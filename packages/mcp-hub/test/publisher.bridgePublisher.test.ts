import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { bridgeRecordPath } from '../src/protocol/paths';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';

function baseRecord(
  overrides: Partial<BridgeRegistryRecord> = {}
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    bridgeId: 'bridge-a',
    pluginId: 'at.terminal',
    pluginDisplayName: 'AT Terminal',
    pluginVersion: '0.2.17',
    hostApp: 'cursor',
    port: 53123,
    token: 't'.repeat(32),
    pid: 12345,
    updatedAt: 1_700_000_000_000,
    tools: [],
    ...overrides
  };
}

describe('FsBridgePublisher', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-pub-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('publish creates registry file with correct JSON fields', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    const record = baseRecord({
      tools: [
        {
          name: 'list_ssh_servers',
          title: 'List SSH Servers',
          description: 'List servers',
          risk: 'read',
          inputSchema: { type: 'object', properties: {} }
        }
      ],
      capabilities: { connectedTargets: 2 }
    });

    await publisher.publish(record);

    const filePath = bridgeRecordPath('cursor', 'bridge-a', home);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as BridgeRegistryRecord;

    expect(parsed.protocolVersion).toBe(1);
    expect(parsed.bridgeId).toBe('bridge-a');
    expect(parsed.hostApp).toBe('cursor');
    expect(parsed.pluginId).toBe('at.terminal');
    expect(parsed.port).toBe(53123);
    expect(parsed.token).toBe(record.token);
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0].name).toBe('list_ssh_servers');
    expect(parsed.capabilities).toEqual({ connectedTargets: 2 });
  });

  it('publish creates parent directories when missing', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });

    await publisher.publish(baseRecord());

    const dir = path.join(home, '.at-series', 'bridges', 'cursor');
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('publish throws when record.bridgeId or hostApp disagree with opts', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });

    await expect(
      publisher.publish(baseRecord({ bridgeId: 'other' }))
    ).rejects.toThrow();

    await expect(
      publisher.publish(baseRecord({ hostApp: 'kiro' }))
    ).rejects.toThrow();
  });

  it('updateTools rewrites tools array and bumps updatedAt', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(baseRecord({ updatedAt: 100 }));

    const tools: ToolCatalogEntry[] = [
      {
        name: 'run_remote_command',
        title: 'Run Remote Command',
        description: 'Exec',
        risk: 'exec',
        inputSchema: { type: 'object', properties: {} }
      }
    ];
    await publisher.updateTools(tools);

    const raw = await fs.readFile(
      bridgeRecordPath('cursor', 'bridge-a', home),
      'utf8'
    );
    const parsed = JSON.parse(raw) as BridgeRegistryRecord;
    expect(parsed.tools).toEqual(tools);
    expect(parsed.updatedAt).toBeGreaterThan(100);
  });

  it('heartbeat bumps updatedAt and can replace capabilities', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(
      baseRecord({
        updatedAt: 100,
        capabilities: { connectedTargets: 1 }
      })
    );

    const before = Date.now();
    await publisher.heartbeat({
      capabilities: { connectedTargets: 5 }
    });
    const after = Date.now();

    const raw = await fs.readFile(
      bridgeRecordPath('cursor', 'bridge-a', home),
      'utf8'
    );
    const parsed = JSON.parse(raw) as BridgeRegistryRecord;
    expect(parsed.updatedAt).toBeGreaterThanOrEqual(before);
    expect(parsed.updatedAt).toBeLessThanOrEqual(after);
    expect(parsed.capabilities).toEqual({ connectedTargets: 5 });
  });

  it('heartbeat uses patch.updatedAt when provided', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(baseRecord({ updatedAt: 100 }));

    await publisher.heartbeat({ updatedAt: 9_999 });

    const raw = await fs.readFile(
      bridgeRecordPath('cursor', 'bridge-a', home),
      'utf8'
    );
    const parsed = JSON.parse(raw) as BridgeRegistryRecord;
    expect(parsed.updatedAt).toBe(9_999);
  });

  it('heartbeat after publish does not read the record back from disk', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(
      baseRecord({ updatedAt: 100, capabilities: { connectedTargets: 1 } })
    );

    // Corrupt the on-disk copy: a heartbeat that re-read it would blow up on
    // JSON.parse. The cached-record path must not care.
    const filePath = bridgeRecordPath('cursor', 'bridge-a', home);
    await fs.writeFile(filePath, 'definitely not json', 'utf8');

    await publisher.heartbeat({ updatedAt: 9_999 });

    const parsed = JSON.parse(
      await fs.readFile(filePath, 'utf8')
    ) as BridgeRegistryRecord;
    expect(parsed.updatedAt).toBe(9_999);
    expect(parsed.bridgeId).toBe('bridge-a');
    expect(parsed.capabilities).toEqual({ connectedTargets: 1 });
  });

  it('updateTools after publish does not read the record back from disk', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(baseRecord({ updatedAt: 100 }));

    const filePath = bridgeRecordPath('cursor', 'bridge-a', home);
    await fs.writeFile(filePath, 'definitely not json', 'utf8');

    const tools: ToolCatalogEntry[] = [
      {
        name: 'list_ssh_servers',
        title: 'List SSH Servers',
        description: 'List servers',
        risk: 'read',
        inputSchema: { type: 'object', properties: {} }
      }
    ];
    await publisher.updateTools(tools);

    const parsed = JSON.parse(
      await fs.readFile(filePath, 'utf8')
    ) as BridgeRegistryRecord;
    expect(parsed.tools).toEqual(tools);
    expect(parsed.token).toBe('t'.repeat(32));
  });

  it('heartbeat falls back to reading the disk when this instance never wrote', async () => {
    const original = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await original.publish(baseRecord({ updatedAt: 100 }));

    // A fresh instance (e.g. after an extension host restart) has no cache
    // and must pick the record up from disk.
    const restarted = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await restarted.heartbeat({ updatedAt: 4_242 });

    const parsed = JSON.parse(
      await fs.readFile(bridgeRecordPath('cursor', 'bridge-a', home), 'utf8')
    ) as BridgeRegistryRecord;
    expect(parsed.updatedAt).toBe(4_242);
    expect(parsed.token).toBe('t'.repeat(32));
  });

  it('unpublish clears the cache so a later heartbeat sees the missing file', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(baseRecord());
    await publisher.unpublish();

    await expect(publisher.heartbeat()).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('unpublish deletes own file only', async () => {
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-a',
      hostApp: 'cursor'
    });
    await publisher.publish(baseRecord());

    const otherPath = bridgeRecordPath('cursor', 'bridge-b', home);
    await fs.writeFile(
      otherPath,
      JSON.stringify(baseRecord({ bridgeId: 'bridge-b' })),
      'utf8'
    );

    await publisher.unpublish();

    await expect(
      fs.access(bridgeRecordPath('cursor', 'bridge-a', home))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(otherPath)).resolves.toBeUndefined();
  });
});
