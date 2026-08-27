/**
 * Hub runtime hot-path latency contract (requirements D12/H9, protocol v1 §8,
 * v2 §3–4): memory-catalog routing, the ≤2s tools/list merge window, the
 * unhealthy-probe negative cache, non-blocking cold start, invoke-failure
 * demotion, response slimming, and the selection winner grace window.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { createHubRuntime, type HubRuntime } from '../src/hub/server';
import {
  HUB_BUILTIN_TOOL_NAMES,
  SEARCH_DESCRIPTION_MAX_CHARS,
  type BridgeRegistryRecord,
  type ListProvidersResult,
  type ToolCatalogEntry
} from '../src/protocol/index';
import { startFakeBridge, type FakeBridgeHandle } from './fixtures/fakeBridge';

const HOST_APP = 'cursor';
const HUB_VERSION = '0.3.2';
/** Generous ceiling for "did not wait on a bridge probe" (probe timeout is 2s). */
const HOT_PATH_BUDGET_MS = 500;

function tool(
  name: string,
  overrides: Partial<ToolCatalogEntry> = {}
): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} description`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    ...overrides
  };
}

function baseRecord(
  overrides: Partial<BridgeRegistryRecord> & {
    bridgeId: string;
    pluginId: string;
    port: number;
    token: string;
  }
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    pluginDisplayName: overrides.pluginId,
    pluginVersion: '1.0.0',
    hostApp: HOST_APP,
    pid: process.pid,
    updatedAt: Date.now(),
    tools: [],
    ...overrides
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishFor(
  home: string,
  bridge: FakeBridgeHandle,
  record: Omit<Parameters<typeof baseRecord>[0], 'port' | 'token'>
): Promise<FsBridgePublisher> {
  const publisher = new FsBridgePublisher({
    home,
    bridgeId: record.bridgeId,
    hostApp: HOST_APP
  });
  await publisher.publish(
    baseRecord({ ...record, port: bridge.port, token: bridge.token })
  );
  return publisher;
}

describe('hub hot path', () => {
  let home: string;
  let runtime: HubRuntime | undefined;
  const bridges: FakeBridgeHandle[] = [];

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-hotpath-'));
  });

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await Promise.all(bridges.splice(0).map((b) => b.close()));
    await fs.rm(home, { recursive: true, force: true });
  });

  async function startBridge(
    options: Parameters<typeof startFakeBridge>[0]
  ): Promise<FakeBridgeHandle> {
    const bridge = await startFakeBridge(options);
    bridges.push(bridge);
    return bridge;
  }

  it('a wedged bridge does not slow tools/call to a healthy bridge (§8.3.1)', async () => {
    const alpha = await startBridge({
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      tools: [tool('alpha_ping')]
    });
    // Health always answers after the 2s probe timeout: permanently unhealthy.
    const beta = await startBridge({
      bridgeId: 'beta-1',
      pluginId: 'at.beta',
      tools: [tool('beta_ping')],
      beforeHealth: () => sleep(2500)
    });
    await publishFor(home, alpha, {
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      tools: [tool('alpha_ping')]
    });
    await publishFor(home, beta, {
      bridgeId: 'beta-1',
      pluginId: 'at.beta',
      tools: [tool('beta_ping')]
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION
    });

    // Baseline pays beta's one probe timeout (~2s) exactly once.
    const baseline = await runtime.listToolsForMcp();
    expect(baseline.map((t) => t.name)).toContain('alpha_ping');

    const startedAt = Date.now();
    const result = await runtime.callTool('alpha_ping', { n: 1 });
    const elapsed = Date.now() - startedAt;

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ echoed: { n: 1 } });
    // No pre-invoke full re-probe: beta's 2s stall must not be on this path.
    expect(elapsed).toBeLessThan(HOT_PATH_BUDGET_MS);
  }, 20_000);

  it('tools/list reuses memory inside the 2s window and skips recently failed probes after it (§8.4)', async () => {
    const alpha = await startBridge({
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      tools: [tool('alpha_ping')]
    });
    const beta = await startBridge({
      bridgeId: 'beta-1',
      pluginId: 'at.beta',
      tools: [tool('beta_ping')],
      beforeHealth: () => sleep(2500)
    });
    await publishFor(home, alpha, {
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      tools: [tool('alpha_ping')]
    });
    await publishFor(home, beta, {
      bridgeId: 'beta-1',
      pluginId: 'at.beta',
      tools: [tool('beta_ping')]
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION
    });
    await runtime.listToolsForMcp(); // baseline (~2s: beta times out once)

    // Inside the 2s TTL: pure memory, no HTTP at all.
    let startedAt = Date.now();
    const cached = await runtime.listToolsForMcp();
    expect(Date.now() - startedAt).toBeLessThan(HOT_PATH_BUDGET_MS);
    expect(cached.map((t) => t.name)).toContain('alpha_ping');

    // Past the TTL: an on-demand pass runs, but beta's failure is newer than
    // the 4s negative-cache window, so the pass must not re-pay its timeout.
    await sleep(2200);
    startedAt = Date.now();
    const refreshed = await runtime.listToolsForMcp();
    expect(Date.now() - startedAt).toBeLessThan(HOT_PATH_BUDGET_MS);
    expect(refreshed.map((t) => t.name)).toContain('alpha_ping');
  }, 20_000);

  it('an invoke transport failure demotes the bridge immediately and fails over (§8.3.5)', async () => {
    const now = Date.now();
    const broken = await startBridge({
      bridgeId: 'gamma-1',
      pluginId: 'at.gamma',
      tools: [tool('gamma_ping')],
      destroyOnInvoke: true
    });
    const backup = await startBridge({
      bridgeId: 'gamma-2',
      pluginId: 'at.gamma',
      tools: [tool('gamma_ping')]
    });
    // Same connectedTargets (fixture health reports 1); the newer updatedAt
    // makes the broken bridge the preferred first attempt.
    await publishFor(home, broken, {
      bridgeId: 'gamma-1',
      pluginId: 'at.gamma',
      tools: [tool('gamma_ping')],
      updatedAt: now
    });
    await publishFor(home, backup, {
      bridgeId: 'gamma-2',
      pluginId: 'at.gamma',
      tools: [tool('gamma_ping')],
      updatedAt: now - 5000
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION
    });
    await runtime.listToolsForMcp();

    const result = await runtime.callTool('gamma_ping', { via: 'failover' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      echoed: { via: 'failover' }
    });

    // The failed bridge was dropped from memory at invoke time — no waiting
    // for the periodic re-probe.
    const providersResponse = await runtime.callTool('at_list_providers', {});
    const providers = JSON.parse(
      providersResponse.content[0]!.text
    ) as ListProvidersResult;
    const gamma = providers.providers.find((p) => p.pluginId === 'at.gamma');
    const statusById = new Map(
      gamma?.bridges.map((b) => [b.bridgeId, b.status])
    );
    expect(statusById.get('gamma-1')).toBe('unhealthy');
    expect(statusById.get('gamma-2')).toBe('healthy');
  }, 20_000);

  it('createHubRuntime returns without waiting on bridge probes (§8.1)', async () => {
    const slow = await startBridge({
      bridgeId: 'delta-1',
      pluginId: 'at.delta',
      tools: [tool('delta_ping')],
      beforeHealth: () => sleep(2500)
    });
    await publishFor(home, slow, {
      bridgeId: 'delta-1',
      pluginId: 'at.delta',
      tools: [tool('delta_ping')]
    });

    const startedAt = Date.now();
    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION
    });
    expect(Date.now() - startedAt).toBeLessThan(HOT_PATH_BUDGET_MS);

    // The first list may legitimately be slow: it awaits the in-flight
    // baseline so an immediate client still sees a correct catalog.
    const names = (await runtime.listToolsForMcp()).map((t) => t.name);
    for (const builtin of HUB_BUILTIN_TOOL_NAMES) {
      expect(names).toContain(builtin);
    }
  }, 20_000);

  it('at_search_tools truncates hit descriptions; at_get_tool keeps the full text (v2 §3.2)', async () => {
    const longDescription = `Epsilon lookup over remote inventory. ${'x'.repeat(400)}`;
    const epsilon = await startBridge({
      bridgeId: 'epsilon-1',
      pluginId: 'at.epsilon',
      tools: [tool('epsilon_lookup', { description: longDescription })]
    });
    await publishFor(home, epsilon, {
      bridgeId: 'epsilon-1',
      pluginId: 'at.epsilon',
      tools: [tool('epsilon_lookup', { description: longDescription })]
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION
    });

    const search = await runtime.callTool('at_search_tools', {
      query: 'epsilon_lookup'
    });
    const hits = JSON.parse(search.content[0]!.text) as Array<{
      name: string;
      description: string;
    }>;
    expect(hits).toHaveLength(1);
    expect(hits[0]!.description.length).toBeLessThanOrEqual(
      SEARCH_DESCRIPTION_MAX_CHARS
    );
    expect(longDescription.startsWith(hits[0]!.description)).toBe(true);

    const lookup = await runtime.callTool('at_get_tool', {
      name: 'epsilon_lookup'
    });
    expect(
      (JSON.parse(lookup.content[0]!.text) as { description: string })
        .description
    ).toBe(longDescription);
  }, 20_000);

  it('at_list_providers serializes compact JSON (v2 §3.1)', async () => {
    const alpha = await startBridge({
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      tools: [tool('alpha_ping')]
    });
    await publishFor(home, alpha, {
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      tools: [tool('alpha_ping')]
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION
    });

    const response = await runtime.callTool('at_list_providers', {});
    const text = response.content[0]!.text;
    expect(text).not.toContain('\n  ');
    expect(text).not.toContain('\n');
    // Still parseable, still substantial.
    const parsed = JSON.parse(text) as ListProvidersResult;
    expect(parsed.providers.map((p) => p.pluginId)).toContain('at.alpha');
  }, 20_000);

  it('keeps a selected name through a winner blip inside the grace window (v2 §4)', async () => {
    const zeta = await startBridge({
      bridgeId: 'zeta-1',
      pluginId: 'at.zeta',
      tools: [tool('zeta_ping')]
    });
    const publisher = await publishFor(home, zeta, {
      bridgeId: 'zeta-1',
      pluginId: 'at.zeta',
      tools: [tool('zeta_ping')]
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION,
      discoveryMode: 'always'
    });
    await runtime.callTool('at_select_tools', { names: ['zeta_ping'] });
    expect((await runtime.listToolsForMcp()).map((t) => t.name)).toContain(
      'zeta_ping'
    );

    // Winner disappears: exposed set collapses to meta tools, but the
    // selection itself is retained for the grace window.
    await publisher.unpublish();
    await runtime.refreshCatalog();
    expect((await runtime.listToolsForMcp()).map((t) => t.name)).not.toContain(
      'zeta_ping'
    );

    // Winner returns inside the window: exposed again with NO new select.
    await publishFor(home, zeta, {
      bridgeId: 'zeta-1',
      pluginId: 'at.zeta',
      tools: [tool('zeta_ping')]
    });
    await runtime.refreshCatalog();
    expect((await runtime.listToolsForMcp()).map((t) => t.name)).toContain(
      'zeta_ping'
    );
  }, 20_000);

  it('discards a selected name after continuous absence beyond the grace window (v2 §4)', async () => {
    const zeta = await startBridge({
      bridgeId: 'zeta-1',
      pluginId: 'at.zeta',
      tools: [tool('zeta_ping')]
    });
    const publisher = await publishFor(home, zeta, {
      bridgeId: 'zeta-1',
      pluginId: 'at.zeta',
      tools: [tool('zeta_ping')]
    });

    runtime = await createHubRuntime({
      home,
      hostApp: HOST_APP,
      hubVersion: HUB_VERSION,
      discoveryMode: 'always',
      selectionWinnerGraceMs: 200
    });
    await runtime.callTool('at_select_tools', { names: ['zeta_ping'] });
    expect((await runtime.listToolsForMcp()).map((t) => t.name)).toContain(
      'zeta_ping'
    );

    await publisher.unpublish();
    await runtime.refreshCatalog(); // absence starts
    await sleep(300); // longer than the injected 200ms grace
    await runtime.refreshCatalog(); // absence exceeded grace → discarded

    // The winner coming back does not resurrect the dropped selection.
    await publishFor(home, zeta, {
      bridgeId: 'zeta-1',
      pluginId: 'at.zeta',
      tools: [tool('zeta_ping')]
    });
    await runtime.refreshCatalog();
    expect((await runtime.listToolsForMcp()).map((t) => t.name)).not.toContain(
      'zeta_ping'
    );
  }, 20_000);
});
