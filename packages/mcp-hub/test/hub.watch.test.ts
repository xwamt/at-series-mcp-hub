import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

describe('registry watch poll fallback (directory fingerprint, v1 §8.4)', () => {
  let home: string;
  const hostApp = 'cursor';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-hub-poll-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(home, { recursive: true, force: true });
  });

  /** Make fs.watch unavailable so watchBridgeRegistry must poll. */
  function forcePollMode(): void {
    vi.spyOn(fsSync, 'watch').mockImplementation(() => {
      throw new Error('fs.watch disabled for poll fallback test');
    });
  }

  function recordFilePath(bridgeId: string): string {
    return path.join(home, '.at-series', 'bridges', hostApp, `${bridgeId}.json`);
  }

  async function publishRecord(bridgeId: string): Promise<void> {
    const publisher = new FsBridgePublisher({ home, bridgeId, hostApp });
    await publisher.publish(
      baseRecord({
        bridgeId,
        port: 1,
        token: 't'.repeat(32),
        tools: [tool('list_ssh_servers')]
      })
    );
  }

  it('stays silent while the registry directory is unchanged', async () => {
    forcePollMode();
    const onChange = vi.fn();
    const handle = watchBridgeRegistry({
      hostApp,
      home,
      onChange,
      pollIntervalMs: 150,
      debounceMs: 50
    });

    try {
      expect(handle.mode).toBe('poll');
      // ≥4 poll ticks plus debounce headroom: the unconditional-interval
      // implementation would have fired several times by now.
      await delay(700);
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      handle.close();
    }
  });

  it('fires after a publish changes the fingerprint, then goes quiet again', async () => {
    forcePollMode();
    const onChange = vi.fn();
    const handle = watchBridgeRegistry({
      hostApp,
      home,
      onChange,
      pollIntervalMs: 150,
      debounceMs: 50
    });

    try {
      expect(handle.mode).toBe('poll');
      await publishRecord('term-bridge');
      await waitFor(() => onChange.mock.calls.length >= 1, 4000);

      onChange.mockClear();
      await delay(700);
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      handle.close();
    }
  });

  it('fires when an existing record is rewritten in place', async () => {
    await publishRecord('term-bridge');
    forcePollMode();
    const onChange = vi.fn();
    const handle = watchBridgeRegistry({
      hostApp,
      home,
      onChange,
      pollIntervalMs: 150,
      debounceMs: 50
    });

    try {
      expect(handle.mode).toBe('poll');
      // The baseline fingerprint already contains the record; only the
      // rewrite below may fire. Append a byte so the size moves even where
      // mtime granularity is coarse.
      const filePath = recordFilePath('term-bridge');
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
        updatedAt: number;
      };
      raw.updatedAt += 1;
      await fs.writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

      await waitFor(() => onChange.mock.calls.length >= 1, 4000);
    } finally {
      handle.close();
    }
  });

  it('fires when a record file is deleted', async () => {
    await publishRecord('term-bridge');
    forcePollMode();
    const onChange = vi.fn();
    const handle = watchBridgeRegistry({
      hostApp,
      home,
      onChange,
      pollIntervalMs: 150,
      debounceMs: 50
    });

    try {
      expect(handle.mode).toBe('poll');
      await fs.unlink(recordFilePath('term-bridge'));

      await waitFor(() => onChange.mock.calls.length >= 1, 4000);
    } finally {
      handle.close();
    }
  });
});
