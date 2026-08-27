import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';
import { createHubRuntime } from '../src/hub/server';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { listBridgeRecords } from '../src/registry/read';
import { startFakeBridge } from './fixtures/fakeBridge';

describe('catalog refresh resilience', () => {
  it('degrades instead of rejecting when the registry directory is unreadable', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-hub-resilience-'));
    // Make `bridges/cursor` a FILE where a directory is expected -> ENOTDIR.
    await fs.mkdir(path.join(home, '.at-series', 'bridges'), { recursive: true });
    await fs.writeFile(path.join(home, '.at-series', 'bridges', 'cursor'), 'not a dir');

    const runtime = await createHubRuntime({
      hostApp: 'cursor',
      hubVersion: '0.3.0',
      home
    });

    // Must resolve, not reject: a broken registry is not a fatal condition.
    const tools = await runtime.listToolsForMcp();

    // Hub built-ins must survive a registry failure.
    const names = tools.map((t) => t.name);
    expect(names).toContain('at_list_providers');
    expect(names).toContain('at_select_tools');

    await runtime.close();
    await fs.rm(home, { recursive: true, force: true });
  });
});

function sharedTool(description: string): ToolCatalogEntry {
  return {
    name: 'shared_tool',
    title: 'Shared',
    description,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  };
}

/**
 * Both records carry the same `updatedAt`, and both fixtures report the same
 * connectedTargets, so aggregateTools cannot rank them on score. That forces
 * the conflict onto its last tie-break — the order of `healthyBridges` — which
 * is exactly the property parallel probing could destroy.
 */
const TIED_UPDATED_AT = Date.now();

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
    hostApp: 'cursor',
    pid: process.pid,
    updatedAt: TIED_UPDATED_AT,
    tools: [],
    ...overrides
  };
}

describe('parallel bridge probing', () => {
  it('lets registry order, not probe completion order, pick the conflict winner', async () => {
    // Two providers publish the same tool name. Health latency is assigned
    // only after the registry order is known, so the bridge that registry
    // order must crown is always the one that answers last. Completion-order
    // assembly therefore crowns the other provider and fails this test.
    const healthDelayMs = new Map<string, number>();
    const startProvider = (bridgeId: string, pluginId: string) =>
      startFakeBridge({
        bridgeId,
        pluginId,
        beforeHealth: () => {
          const ms = healthDelayMs.get(bridgeId) ?? 0;
          return ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : undefined;
        },
        tools: [sharedTool(`from ${pluginId}`)]
      });

    const alpha = await startProvider('alpha-1', 'at.alpha');
    const beta = await startProvider('beta-1', 'at.beta');

    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-parallel-'));

    try {
      await new FsBridgePublisher({ home, bridgeId: 'alpha-1', hostApp: 'cursor' }).publish(
        baseRecord({
          bridgeId: 'alpha-1',
          pluginId: 'at.alpha',
          port: alpha.port,
          token: alpha.token,
          tools: [sharedTool('from at.alpha')]
        })
      );

      await new FsBridgePublisher({ home, bridgeId: 'beta-1', hostApp: 'cursor' }).publish(
        baseRecord({
          bridgeId: 'beta-1',
          pluginId: 'at.beta',
          port: beta.port,
          token: beta.token,
          tools: [sharedTool('from at.beta')]
        })
      );

      const records = await listBridgeRecords({ hostApp: 'cursor', home });
      expect(records).toHaveLength(2);
      const registryFirst = records[0]!;
      // Slow down whichever bridge the registry lists first.
      healthDelayMs.set(registryFirst.bridgeId, 150);

      const runtime = await createHubRuntime({
        hostApp: 'cursor',
        hubVersion: '0.3.0',
        home
      });

      const winnerOf = (tools: ToolCatalogEntry[]): string | undefined =>
        tools.find((t) => t.name === 'shared_tool')?.description;

      const first = winnerOf(await runtime.listToolsForMcp());
      const second = winnerOf(await runtime.listToolsForMcp());
      const third = winnerOf(await runtime.listToolsForMcp());

      expect(first).toBe(`from ${registryFirst.pluginId}`);
      expect(second).toBe(first);
      expect(third).toBe(first);

      await runtime.close();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
      await alpha.close();
      await beta.close();
    }
  }, 20_000);

  it('probes every bridge concurrently rather than one after another', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const holdHealth = async (): Promise<void> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((r) => setTimeout(r, 50));
      inFlight -= 1;
    };

    const first = await startFakeBridge({
      bridgeId: 'one-1',
      pluginId: 'at.one',
      beforeHealth: holdHealth,
      tools: [sharedTool('from at.one')]
    });
    const second = await startFakeBridge({
      bridgeId: 'two-1',
      pluginId: 'at.two',
      beforeHealth: holdHealth,
      tools: [sharedTool('from at.two')]
    });

    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-concurrent-'));

    try {
      await new FsBridgePublisher({ home, bridgeId: 'one-1', hostApp: 'cursor' }).publish(
        baseRecord({
          bridgeId: 'one-1',
          pluginId: 'at.one',
          port: first.port,
          token: first.token,
          tools: [sharedTool('from at.one')]
        })
      );
      await new FsBridgePublisher({ home, bridgeId: 'two-1', hostApp: 'cursor' }).publish(
        baseRecord({
          bridgeId: 'two-1',
          pluginId: 'at.two',
          port: second.port,
          token: second.token,
          tools: [sharedTool('from at.two')]
        })
      );

      const runtime = await createHubRuntime({
        hostApp: 'cursor',
        hubVersion: '0.3.0',
        home
      });

      maxInFlight = 0;
      await runtime.refreshCatalog();

      // Serial probing can never hold two /health requests open at once.
      expect(maxInFlight).toBe(2);

      await runtime.close();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
      await first.close();
      await second.close();
    }
  }, 20_000);

  it('sends /health and /tools for one bridge concurrently (v1 §8.2)', async () => {
    // /health only answers once /tools has been reached. A hub that probes
    // sequentially (health, then tools) deadlocks here: health times out at
    // 2s, the bridge is marked unhealthy, and the tool never aggregates.
    let toolsReached!: () => void;
    const toolsReachedPromise = new Promise<void>((resolve) => {
      toolsReached = resolve;
    });

    const bridge = await startFakeBridge({
      bridgeId: 'pair-1',
      pluginId: 'at.pair',
      tools: [sharedTool('from at.pair')],
      beforeHealth: () => toolsReachedPromise,
      beforeTools: () => {
        toolsReached();
      }
    });

    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-pair-'));

    try {
      await new FsBridgePublisher({ home, bridgeId: 'pair-1', hostApp: 'cursor' }).publish(
        baseRecord({
          bridgeId: 'pair-1',
          pluginId: 'at.pair',
          port: bridge.port,
          token: bridge.token,
          tools: []
        })
      );

      const runtime = await createHubRuntime({
        hostApp: 'cursor',
        hubVersion: '0.3.0',
        home
      });

      // The live /tools catalog (not the empty registry snapshot) must win,
      // proving the tools response was fetched — and fetched in parallel.
      const tools = await runtime.listToolsForMcp();
      expect(tools.map((t) => t.name)).toContain('shared_tool');

      await runtime.close();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
      await bridge.close();
    }
  }, 20_000);
});
