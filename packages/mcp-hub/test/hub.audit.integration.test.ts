import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubRuntime } from '../src/hub/server';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';
import { logsDirForHostApp } from '../src/protocol/paths';
import { startFakeBridge } from './fixtures/fakeBridge';

function tool(
  name: string,
  risk: ToolCatalogEntry['risk'] = 'read'
): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} desc`,
    risk,
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
    pluginId: 'at.example',
    pluginDisplayName: 'Example',
    pluginVersion: '0.0.1',
    hostApp: 'cursor',
    pid: process.pid,
    updatedAt: Date.now(),
    tools: [],
    ...overrides
  };
}

async function readAuditRecords(home: string, hostApp: string): Promise<unknown[]> {
  const dir = logsDirForHostApp(hostApp, home);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const records: unknown[] = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) {
      continue;
    }
    const body = await fs.readFile(path.join(dir, name), 'utf8');
    for (const line of body.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      records.push(JSON.parse(line));
    }
  }
  return records;
}

describe('Hub business-tool audit log', () => {
  let home: string;
  const hostApp = 'cursor';
  const hubVersion = '0.1.0';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-hub-audit-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(home, { recursive: true, force: true });
  });

  it('records a successful business tool call', async () => {
    const tools = [tool('example_ping')];
    const bridge = await startFakeBridge({
      pluginId: 'at.example',
      tools,
      onInvoke: (req) => ({
        ok: true,
        name: req.name,
        result: { pong: true }
      })
    });
    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'ex-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'ex-bridge',
          port: bridge.port,
          token: bridge.token,
          tools
        })
      );
      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const response = await runtime.callTool('example_ping', { n: 1 });
      expect(response.isError).toBeUndefined();
      await runtime.close();

      const records = await readAuditRecords(home, hostApp);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        hostApp: 'cursor',
        pluginId: 'at.example',
        bridgeId: 'ex-bridge',
        toolName: 'example_ping',
        risk: 'read',
        attemptCount: 1,
        status: 'success',
        params: { n: 1 }
      });
      expect(String((records[0] as { traceId: string }).traceId)).toMatch(
        /^at-trace-/
      );
    } finally {
      await bridge.close();
    }
  });

  it('records USER_CANCELLED as cancelled', async () => {
    const tools = [tool('example_run', 'exec')];
    const bridge = await startFakeBridge({
      pluginId: 'at.example',
      tools,
      onInvoke: () => ({
        error: { code: 'USER_CANCELLED', message: 'User cancelled the confirmation' }
      })
    });
    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'ex-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'ex-bridge',
          port: bridge.port,
          token: bridge.token,
          tools
        })
      );
      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const response = await runtime.callTool('example_run', { command: 'rm -rf /' });
      expect(response.isError).toBe(true);
      await runtime.close();

      const records = await readAuditRecords(home, hostApp);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        status: 'cancelled',
        error: { code: 'USER_CANCELLED' },
        toolName: 'example_run',
        risk: 'exec'
      });
    } finally {
      await bridge.close();
    }
  });

  it('records an invoke transport failure as unavailable', async () => {
    const tools = [tool('example_ping')];
    const bridge = await startFakeBridge({
      pluginId: 'at.example',
      tools,
      destroyOnInvoke: true
    });
    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'ex-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'ex-bridge',
          port: bridge.port,
          token: bridge.token,
          tools
        })
      );
      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const response = await runtime.callTool('example_ping', {});
      expect(response.isError).toBe(true);
      await runtime.close();

      const records = await readAuditRecords(home, hostApp);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        status: 'unavailable',
        toolName: 'example_ping',
        attemptCount: 1
      });
    } finally {
      await bridge.close();
    }
  });

  it('records an unknown tool as not_found without pluginId', async () => {
    const runtime = await createHubRuntime({ home, hostApp, hubVersion });
    const response = await runtime.callTool('no_such_tool', {});
    expect(response.isError).toBe(true);
    await runtime.close();

    const records = await readAuditRecords(home, hostApp);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: 'not_found',
      toolName: 'no_such_tool',
      attemptCount: 0
    });
    expect(records[0]).not.toHaveProperty('pluginId');
    expect(records[0]).not.toHaveProperty('bridgeId');
  });

  it('does not record Hub meta-tool calls', async () => {
    const runtime = await createHubRuntime({ home, hostApp, hubVersion });
    await runtime.callTool('at_search_tools', { query: 'ssh' });
    await runtime.close();
    expect(await readAuditRecords(home, hostApp)).toEqual([]);
  });

  it('redacts password arguments on disk', async () => {
    const tools = [tool('example_ping')];
    const bridge = await startFakeBridge({
      pluginId: 'at.example',
      tools
    });
    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'ex-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'ex-bridge',
          port: bridge.port,
          token: bridge.token,
          tools
        })
      );
      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      await runtime.callTool('example_ping', { password: 's3cret', sql: 'SELECT 1' });
      await runtime.close();

      const records = await readAuditRecords(home, hostApp);
      expect(records[0]).toMatchObject({
        params: { password: '[REDACTED]', sql: 'SELECT 1' }
      });
    } finally {
      await bridge.close();
    }
  });

  it('writes nothing when AT_SERIES_AUDIT_LOG is false', async () => {
    vi.stubEnv('AT_SERIES_AUDIT_LOG', 'false');
    const runtime = await createHubRuntime({ home, hostApp, hubVersion });
    await runtime.callTool('no_such_tool', {});
    await runtime.close();
    expect(await readAuditRecords(home, hostApp)).toEqual([]);
  });

  it('returns the same callTool payload when audit logging is on', async () => {
    const tools = [tool('example_ping')];
    const bridge = await startFakeBridge({
      pluginId: 'at.example',
      tools,
      onInvoke: () => ({
        ok: true,
        name: 'example_ping',
        result: { pong: true }
      })
    });
    try {
      const publisher = new FsBridgePublisher({
        home,
        bridgeId: 'ex-bridge',
        hostApp
      });
      await publisher.publish(
        baseRecord({
          bridgeId: 'ex-bridge',
          port: bridge.port,
          token: bridge.token,
          tools
        })
      );
      const runtime = await createHubRuntime({ home, hostApp, hubVersion });
      const response = await runtime.callTool('example_ping', {});
      await runtime.close();
      expect(JSON.parse(response.content[0]!.text)).toEqual({ pong: true });
    } finally {
      await bridge.close();
    }
  });
});
