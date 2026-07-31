import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { createHubRuntime } from '../src/hub/server';
import {
  HUB_BUILTIN_TOOL_NAMES,
  type BridgeRegistryRecord,
  type ToolCatalogEntry
} from '../src/protocol/index';
import { startFakeBridge } from './fixtures/fakeBridge';

function tool(name: string): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} desc`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
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

describe('createHubRuntime', () => {
  let home: string;
  const hostApp = 'cursor';
  const hubVersion = '0.1.0';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-hub-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('aggregates disjoint tools from two plugins plus Hub builtins', async () => {
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
      const termPub = new FsBridgePublisher({
        home,
        bridgeId: 'term-bridge',
        hostApp
      });
      await termPub.publish(
        baseRecord({
          bridgeId: 'term-bridge',
          pluginId: 'at.terminal',
          port: terminal.port,
          token: terminal.token,
          tools: [tool('list_ssh_servers')]
        })
      );

      const jsPub = new FsBridgePublisher({
        home,
        bridgeId: 'js-bridge',
        hostApp
      });
      await jsPub.publish(
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
      const tools = await runtime.listToolsForMcp();
      const names = tools.map((t) => t.name).sort();

      expect(names).toEqual(
        [...HUB_BUILTIN_TOOL_NAMES, 'jumpserver_list_assets', 'list_ssh_servers'].sort()
      );
      await runtime.close();
    } finally {
      await terminal.close();
      await jumpserver.close();
    }
  });

  it('callTool invokes bridge and returns result JSON', async () => {
    const bridge = await startFakeBridge({
      bridgeId: 'term-bridge',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')],
      onInvoke: (req) => ({
        ok: true,
        name: req.name,
        result: { servers: [{ name: 'prod' }] }
      })
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

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const response = await runtime.callTool('list_ssh_servers', {});

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');
      expect(JSON.parse(response.content[0]!.text)).toEqual({
        servers: [{ name: 'prod' }]
      });
      await runtime.close();
    } finally {
      await bridge.close();
    }
  });

  it('ignores bridges registered for a different hostApp', async () => {
    const bridge = await startFakeBridge({
      bridgeId: 'kiro-bridge',
      hostApp: 'kiro',
      tools: [tool('list_ssh_servers')]
    });

    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'kiro-bridge',
        hostApp: 'kiro'
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'kiro-bridge',
          hostApp: 'kiro',
          port: bridge.port,
          token: bridge.token,
          tools: [tool('list_ssh_servers')]
        })
      );

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const tools = await runtime.listToolsForMcp();
      const names = tools.map((t) => t.name);

      expect(names).toEqual([...HUB_BUILTIN_TOOL_NAMES]);
      await runtime.close();
    } finally {
      await bridge.close();
    }
  });

  it('coalesces overlapping refreshCatalog so a slow stale pass cannot resurrect deleted tools', async () => {
    let holdHealth = false;
    const healthWaiters: Array<() => void> = [];

    const bridge = await startFakeBridge({
      bridgeId: 'term-bridge',
      pluginId: 'at.terminal',
      tools: [tool('list_ssh_servers')],
      beforeHealth: () => {
        if (!holdHealth) {
          return;
        }
        return new Promise<void>((resolve) => {
          healthWaiters.push(resolve);
        });
      }
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

      const runtime = await createHubRuntime({ home, hostApp, hubVersion });

      holdHealth = true;
      // Start a refresh that will see the bridge, then stall in /health.
      const slowRefresh = runtime.refreshCatalog();
      await new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          if (healthWaiters.length >= 1) {
            resolve();
            return;
          }
          if (Date.now() - started > 5000) {
            reject(new Error('timed out waiting for health gate'));
            return;
          }
          setTimeout(tick, 10);
        };
        tick();
      });

      await publisher.unpublish();

      // Concurrent refresh after delete; without serialization the slow pass can
      // finish later and overwrite the empty catalog with stale tools.
      const afterDelete = runtime.refreshCatalog();

      // Allow the in-flight (stale) pass to finish; any coalesced follow-up must
      // not block on health again.
      holdHealth = false;
      for (const release of healthWaiters.splice(0)) {
        release();
      }

      const [slowResult, afterResult] = await Promise.all([
        slowRefresh,
        afterDelete
      ]);

      // Both callers must observe the post-delete catalog (latest intent wins).
      // Without refresh serialization, the slow in-flight pass returns stale tools.
      expect(slowResult.tools.map((t) => t.name)).not.toContain('list_ssh_servers');
      expect(afterResult.tools.map((t) => t.name)).not.toContain(
        'list_ssh_servers'
      );

      await runtime.close();
    } finally {
      holdHealth = false;
      for (const release of healthWaiters.splice(0)) {
        release();
      }
      await bridge.close();
    }
  });
});
