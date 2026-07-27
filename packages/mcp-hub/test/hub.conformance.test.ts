/**
 * Protocol v1 §15 conformance suite.
 * Explicit coverage of all 9 required Hub package cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { syncHubBundle } from '../src/publisher/HubBundleSync';
import { createHubRuntime } from '../src/hub/server';
import { listBridgeRecords } from '../src/registry/read';
import { defaultAutoApproveToolNames } from '../src/installer/autoApprove';
import { hubJsPath, hubVersionPath } from '../src/protocol/paths';
import type {
  BridgeRegistryRecord,
  HubVersionRecord,
  ToolCatalogEntry
} from '../src/protocol/index';
import { HUB_BUILTIN_TOOL_NAMES } from '../src/protocol/index';
import { startFakeBridge } from './fixtures/fakeBridge';

function tool(
  name: string,
  overrides: Partial<ToolCatalogEntry> = {}
): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} desc`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    ...overrides
  };
}

function baseRecord(
  overrides: Partial<BridgeRegistryRecord> & {
    bridgeId: string;
    port: number;
    token: string;
  }
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    pluginId: 'at.terminal',
    pluginDisplayName: 'AT Terminal',
    pluginVersion: '0.2.17',
    hostApp: 'cursor',
    pid: process.pid,
    updatedAt: Date.now(),
    tools: [],
    ...overrides
  };
}

function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10000,
  intervalMs = 50
): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        if (await predicate()) {
          resolve();
          return;
        }
      } catch {
        // keep polling
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(() => {
        void tick();
      }, intervalMs);
    };
    void tick();
  });
}

describe('protocol v1 §15 conformance', () => {
  let home: string;
  const hostApp = 'cursor';
  const hubVersion = '0.1.0';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-conform-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('§15.1 two plugins with disjoint tools → aggregated list contains both', async () => {
    const terminal = await startFakeBridge({
      bridgeId: 'term-bridge',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')]
    });
    const jumpserver = await startFakeBridge({
      bridgeId: 'js-bridge',
      pluginId: 'at.jumpserver',
      pluginDisplayName: 'AT JumpServer Terminal',
      tools: [tool('jumpserver_list_assets')]
    });

    try {
      await new FsBridgePublisher({
        home,
        bridgeId: 'term-bridge',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'term-bridge',
          pluginId: 'at.terminal',
          port: terminal.port,
          token: terminal.token,
          tools: [tool('list_ssh_servers')]
        })
      );
      await new FsBridgePublisher({
        home,
        bridgeId: 'js-bridge',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'js-bridge',
          pluginId: 'at.jumpserver',
          pluginDisplayName: 'AT JumpServer Terminal',
          port: jumpserver.port,
          token: jumpserver.token,
          tools: [tool('jumpserver_list_assets')]
        })
      );

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const names = (await runtime.listToolsForMcp()).map((t) => t.name).sort();
      expect(names).toEqual([
        'at_list_providers',
        'jumpserver_list_assets',
        'list_ssh_servers'
      ]);
      await runtime.close();
    } finally {
      await terminal.close();
      await jumpserver.close();
    }
  });

  it('§15.2 same pluginId two Bridges → tools collapsed; call still succeeds', async () => {
    const a = await startFakeBridge({
      bridgeId: 'term-a',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')],
      onInvoke: () => ({
        ok: true,
        name: 'list_ssh_servers',
        result: { from: 'a' }
      })
    });
    const b = await startFakeBridge({
      bridgeId: 'term-b',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')],
      onInvoke: () => ({
        ok: true,
        name: 'list_ssh_servers',
        result: { from: 'b' }
      })
    });

    try {
      await new FsBridgePublisher({
        home,
        bridgeId: 'term-a',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'term-a',
          port: a.port,
          token: a.token,
          tools: [tool('list_ssh_servers')],
          updatedAt: 10,
          capabilities: { connectedTargets: 1 }
        })
      );
      await new FsBridgePublisher({
        home,
        bridgeId: 'term-b',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'term-b',
          port: b.port,
          token: b.token,
          tools: [tool('list_ssh_servers')],
          updatedAt: 20,
          capabilities: { connectedTargets: 2 }
        })
      );

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const names = (await runtime.listToolsForMcp())
        .map((t) => t.name)
        .filter((n) => n !== 'at_list_providers');
      expect(names).toEqual(['list_ssh_servers']);

      const response = await runtime.callTool('list_ssh_servers', {});
      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0]!.text)).toEqual({ from: 'b' });
      await runtime.close();
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('§15.3 different pluginId same tool name → conflict; one winner; at_list_providers reports', async () => {
    const high = await startFakeBridge({
      bridgeId: 'high-bridge',
      pluginId: 'plugin.high',
      pluginDisplayName: 'High',
      tools: [tool('shared_tool', { title: 'from-high' })]
    });
    const low = await startFakeBridge({
      bridgeId: 'low-bridge',
      pluginId: 'plugin.low',
      pluginDisplayName: 'Low',
      tools: [tool('shared_tool', { title: 'from-low' })]
    });

    try {
      // Fake /health returns connectedTargets=1 for both; updatedAt picks the winner.
      await new FsBridgePublisher({
        home,
        bridgeId: 'high-bridge',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'high-bridge',
          pluginId: 'plugin.high',
          pluginDisplayName: 'High',
          port: high.port,
          token: high.token,
          tools: [tool('shared_tool', { title: 'from-high' })],
          updatedAt: 200
        })
      );
      await new FsBridgePublisher({
        home,
        bridgeId: 'low-bridge',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'low-bridge',
          pluginId: 'plugin.low',
          pluginDisplayName: 'Low',
          port: low.port,
          token: low.token,
          tools: [tool('shared_tool', { title: 'from-low' })],
          updatedAt: 50
        })
      );

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const tools = await runtime.listToolsForMcp();
      const shared = tools.filter((t) => t.name === 'shared_tool');
      expect(shared).toHaveLength(1);
      expect(shared[0]!.title).toBe('from-high');

      const providersResp = await runtime.callTool('at_list_providers', {});
      const providers = JSON.parse(providersResp.content[0]!.text) as {
        providers: Array<{ pluginId: string; conflicts: string[] }>;
      };
      const highProv = providers.providers.find((p) => p.pluginId === 'plugin.high');
      const lowProv = providers.providers.find((p) => p.pluginId === 'plugin.low');
      expect(highProv?.conflicts).toContain('shared_tool');
      expect(lowProv?.conflicts).toContain('shared_tool');
      await runtime.close();
    } finally {
      await high.close();
      await low.close();
    }
  });

  it('§15.4 wrong hostApp Bridges ignored', async () => {
    const bridge = await startFakeBridge({
      bridgeId: 'kiro-bridge',
      hostApp: 'kiro',
      tools: [tool('list_ssh_servers')]
    });

    try {
      await new FsBridgePublisher({
        home,
        bridgeId: 'kiro-bridge',
        hostApp: 'kiro'
      }).publish(
        baseRecord({
          bridgeId: 'kiro-bridge',
          hostApp: 'kiro',
          port: bridge.port,
          token: bridge.token,
          tools: [tool('list_ssh_servers')]
        })
      );

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const names = (await runtime.listToolsForMcp()).map((t) => t.name);
      expect(names).toEqual(['at_list_providers']);
      await runtime.close();
    } finally {
      await bridge.close();
    }
  });

  it('§15.5 unscoped (no hostApp) ignored', async () => {
    const dir = path.join(home, '.at-series', 'bridges', hostApp);
    await fs.mkdir(dir, { recursive: true });
    const { hostApp: _omit, ...withoutHostApp } = baseRecord({
      bridgeId: 'unscoped',
      port: 1,
      token: 't'.repeat(32),
      tools: [tool('list_ssh_servers')]
    });
    await fs.writeFile(
      path.join(dir, 'unscoped.json'),
      JSON.stringify(withoutHostApp),
      'utf8'
    );

    const records = await listBridgeRecords({ hostApp, home });
    expect(records).toHaveLength(0);

    const runtime = await createHubRuntime({ home, hostApp, hubVersion });
    const names = (await runtime.listToolsForMcp()).map((t) => t.name);
    expect(names).toEqual(['at_list_providers']);
    await runtime.close();
  });

  it('§15.6 registry delete → tools disappear + onToolsListChanged', async () => {
    const bridge = await startFakeBridge({
      bridgeId: 'term-bridge',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')]
    });

    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'term-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'term-bridge',
          port: bridge.port,
          token: bridge.token,
          tools: [tool('list_ssh_servers')]
        })
      );

      const onToolsListChanged = vi.fn();
      const runtime = await createHubRuntime({
        home,
        hostApp,
        hubVersion,
        onToolsListChanged
      });

      expect(
        (await runtime.listToolsForMcp()).map((t) => t.name).sort()
      ).toEqual(['at_list_providers', 'list_ssh_servers']);

      onToolsListChanged.mockClear();
      await publisher.unpublish();
      await waitFor(() => onToolsListChanged.mock.calls.length >= 1);

      expect((await runtime.listToolsForMcp()).map((t) => t.name)).toEqual([
        'at_list_providers'
      ]);
      expect(onToolsListChanged.mock.calls.length).toBeGreaterThanOrEqual(1);
      await runtime.close();
    } finally {
      await bridge.close();
    }
  });

  it('§15.7 lower hub semver cannot overwrite higher', async () => {
    const mcp = path.dirname(hubJsPath(home));
    await fs.mkdir(mcp, { recursive: true });
    await fs.writeFile(hubJsPath(home), 'active-0.2.0', 'utf8');
    const meta: HubVersionRecord = {
      version: '0.2.0',
      protocolVersion: 1,
      writtenByPluginId: 'at.terminal',
      writtenByPluginVersion: '0.2.0',
      writtenAt: 1_700_000_000_000,
      bundleSha256: sha256Hex('active-0.2.0')
    };
    await fs.writeFile(hubVersionPath(home), JSON.stringify(meta), 'utf8');

    const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-bundle-'));
    try {
      const bundlePath = path.join(bundleDir, 'hub.js');
      await fs.writeFile(bundlePath, 'candidate-0.1.0', 'utf8');

      const result = await syncHubBundle({
        version: '0.1.0',
        bundlePath,
        pluginId: 'at.jumpserver',
        pluginVersion: '1.0.0',
        home
      });

      expect(result).toEqual({ updated: false, activeVersion: '0.2.0' });
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe('active-0.2.0');
    } finally {
      await fs.rm(bundleDir, { recursive: true, force: true });
    }
  });

  it('§15.8 autoApprove helper only returns read tools (+ builtins)', () => {
    const missingRisk = {
      name: 'missing_risk',
      title: 'missing_risk',
      description: 'no risk field',
      inputSchema: { type: 'object', properties: {} }
    } as ToolCatalogEntry;

    const names = defaultAutoApproveToolNames({
      registryTools: [
        tool('list_ssh_servers', { risk: 'read' }),
        tool('sftp_write_file', { risk: 'write' }),
        tool('run_remote_command', { risk: 'exec' }),
        missingRisk
      ]
    });

    expect(names).toEqual([...HUB_BUILTIN_TOOL_NAMES, 'list_ssh_servers']);
    expect(names).not.toContain('sftp_write_file');
    expect(names).not.toContain('run_remote_command');
    expect(names).not.toContain('missing_risk');
  });

  it('§15.9 invoke routes and maps VALIDATION_ERROR → isError + code', async () => {
    const bridge = await startFakeBridge({
      bridgeId: 'term-bridge',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')],
      onInvoke: () => ({
        status: 422,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid arguments',
            details: { field: 'serverId' }
          }
        }
      })
    });

    try {
      await new FsBridgePublisher({
        home,
        bridgeId: 'term-bridge',
        hostApp
      }).publish(
        baseRecord({
          bridgeId: 'term-bridge',
          port: bridge.port,
          token: bridge.token,
          tools: [tool('list_ssh_servers')]
        })
      );

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const response = await runtime.callTool('list_ssh_servers', {
        serverId: 1
      });

      expect(response.isError).toBe(true);
      const body = JSON.parse(response.content[0]!.text) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid arguments');
      await runtime.close();
    } finally {
      await bridge.close();
    }
  });
});
