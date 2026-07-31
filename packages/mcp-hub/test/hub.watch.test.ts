import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { createHubRuntime } from '../src/hub/server';
import { watchBridgeRegistry } from '../src/registry/watch';
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

function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 8000,
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

describe('registry watch + list_changed', () => {
  let home: string;
  const hostApp = 'cursor';
  const hubVersion = '0.1.0';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-hub-watch-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('watchBridgeRegistry reports a mode and fires onChange after file write', async () => {
    const onChange = vi.fn();
    const handle = watchBridgeRegistry({
      hostApp,
      home,
      onChange,
      pollIntervalMs: 500,
      debounceMs: 100
    });

    expect(handle.mode === 'watch' || handle.mode === 'poll').toBe(true);

    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'term-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'term-bridge',
          port: 1,
          token: 't'.repeat(32),
          tools: [tool('list_ssh_servers')]
        })
      );

      await waitFor(() => onChange.mock.calls.length >= 1, 8000);
      expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      handle.close();
    }
  });

  it('after unpublish, listToolsForMcp drops plugin tools and onToolsListChanged fires', async () => {
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

      const before = await runtime.listToolsForMcp();
      expect(before.map((t) => t.name).sort()).toEqual(
        [...HUB_BUILTIN_TOOL_NAMES, 'list_ssh_servers'].sort()
      );

      onToolsListChanged.mockClear();
      await publisher.unpublish();

      // Wait for watch/health-driven refresh (do not listTools here — that would
      // itself refresh and fire the callback, masking watch failures).
      await waitFor(() => onToolsListChanged.mock.calls.length >= 1, 10000);

      const after = await runtime.listToolsForMcp();
      expect(after.map((t) => t.name)).toEqual([...HUB_BUILTIN_TOOL_NAMES]);
      expect(onToolsListChanged.mock.calls.length).toBeGreaterThanOrEqual(1);

      await runtime.close();
    } finally {
      await bridge.close();
    }
  });
});
