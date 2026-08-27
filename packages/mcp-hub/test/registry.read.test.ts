import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  listBridgeRecords,
  parseBridgeRegistryRecord
} from '../src/registry/read';

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1,
    bridgeId: 'a',
    pluginId: 'at.terminal',
    pluginDisplayName: 'AT Terminal',
    pluginVersion: '0.2.17',
    hostApp: 'cursor',
    port: 1234,
    token: 't'.repeat(32),
    pid: 1,
    updatedAt: 1,
    tools: [],
    ...overrides
  };
}

async function writeRecord(
  home: string,
  hostApp: string,
  name: string,
  body: unknown
) {
  const dir = path.join(home, '.at-series', 'bridges', hostApp);
  await fs.mkdir(dir, { recursive: true });
  const content =
    typeof body === 'string' ? body : JSON.stringify(body);
  await fs.writeFile(path.join(dir, name), content, 'utf8');
}

describe('listBridgeRecords', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('returns valid protocolVersion=1 records for hostApp', async () => {
    await writeRecord(home, 'cursor', 'a.json', validRecord({ bridgeId: 'a' }));
    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records).toHaveLength(1);
    expect(records[0].bridgeId).toBe('a');
  });

  it('ignores records missing hostApp field even if file under folder', async () => {
    const { hostApp: _omit, ...withoutHostApp } = validRecord({ bridgeId: 'b' });
    await writeRecord(home, 'cursor', 'bad.json', withoutHostApp);
    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records).toHaveLength(0);
  });

  it('ignores other hostApp directories when querying cursor', async () => {
    await writeRecord(
      home,
      'kiro',
      'k.json',
      validRecord({ bridgeId: 'k', hostApp: 'kiro' })
    );
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });

  it('skips invalid JSON', async () => {
    await writeRecord(home, 'cursor', 'broken.json', '{not-json');
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });

  it('skips protocolVersion !== 1', async () => {
    await writeRecord(
      home,
      'cursor',
      'v2.json',
      validRecord({ protocolVersion: 2 })
    );
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });

  it('skips record.hostApp mismatch vs query (defense in depth)', async () => {
    await writeRecord(
      home,
      'cursor',
      'mismatch.json',
      validRecord({ hostApp: 'kiro' })
    );
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });

  it('skips non-.json files', async () => {
    await writeRecord(home, 'cursor', 'a.txt', validRecord());
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });

  it('returns empty array when directory is missing', async () => {
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });

  it('skips a record with an out-of-range port instead of throwing', async () => {
    await writeRecord(home, 'cursor', 'ok.json', validRecord({ bridgeId: 'ok' }));
    await writeRecord(
      home,
      'cursor',
      'bad-port.json',
      validRecord({ bridgeId: 'bad-port', port: 70000 })
    );
    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records.map((r) => r.bridgeId)).toEqual(['ok']);
  });

  it('keeps records in readdir relative order with invalid files skipped', async () => {
    // Hub conflict adjudication relies on a stable record order; the parallel
    // read must preserve the readdir order the sequential loop had.
    const ids = ['b', 'a', 'e', 'c', 'd'];
    for (const id of ids) {
      await writeRecord(home, 'cursor', `${id}.json`, validRecord({ bridgeId: id }));
    }
    await writeRecord(home, 'cursor', 'broken.json', '{not-json');
    await writeRecord(home, 'cursor', 'notes.txt', 'not a record');

    const dir = path.join(home, '.at-series', 'bridges', 'cursor');
    const expected = (await fs.readdir(dir))
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.basename(name, '.json'))
      .filter((id) => ids.includes(id));

    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records.map((r) => r.bridgeId)).toEqual(expected);
    expect(records).toHaveLength(ids.length);
  });

  it('aggregates a large directory without losing or duplicating records', async () => {
    const count = 40;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        writeRecord(
          home,
          'cursor',
          `bridge-${String(i).padStart(2, '0')}.json`,
          validRecord({ bridgeId: `bridge-${String(i).padStart(2, '0')}` })
        )
      )
    );

    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records).toHaveLength(count);
    expect(new Set(records.map((r) => r.bridgeId)).size).toBe(count);
  });

  it('skips a record whose endpoints escape the Bridge path space', async () => {
    await writeRecord(
      home,
      'cursor',
      'ssrf.json',
      validRecord({
        bridgeId: 'ssrf',
        port: 2375,
        endpoints: { invoke: '/v1.41/containers/create' }
      })
    );
    await writeRecord(
      home,
      'cursor',
      'traversal.json',
      validRecord({ bridgeId: 'traversal', endpoints: { invoke: '/../admin' } })
    );
    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records.map((r) => r.bridgeId)).toEqual(['ssrf']);
  });
});

describe('parseBridgeRegistryRecord port validation', () => {
  it.each([0, -1, 3.14, 70000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects port %p',
    (port) => {
      expect(parseBridgeRegistryRecord(validRecord({ port }))).toBeNull();
    }
  );

  it.each([1, 65535, 53123])('accepts port %p', (port) => {
    expect(parseBridgeRegistryRecord(validRecord({ port }))?.port).toBe(port);
  });
});

describe('parseBridgeRegistryRecord endpoints validation', () => {
  it.each(['/../admin', '//evil', 'not-a-path', '/x?y=1', '/a/../../b', ''])(
    'rejects endpoints.invoke %p',
    (invoke) => {
      expect(
        parseBridgeRegistryRecord(validRecord({ endpoints: { invoke } }))
      ).toBeNull();
    }
  );

  it.each(['/invoke', '/api/v1/invoke', '/', '/at-series/invoke_v2'])(
    'accepts endpoints.invoke %p',
    (invoke) => {
      expect(
        parseBridgeRegistryRecord(validRecord({ endpoints: { invoke } }))
          ?.endpoints?.invoke
      ).toBe(invoke);
    }
  );

  it('applies the same rule to health and tools overrides', () => {
    expect(
      parseBridgeRegistryRecord(
        validRecord({ endpoints: { health: 'http://evil.test/health' } })
      )
    ).toBeNull();
    expect(
      parseBridgeRegistryRecord(validRecord({ endpoints: { tools: '/../../tools' } }))
    ).toBeNull();
  });

  it('rejects a non-string endpoint override', () => {
    expect(
      parseBridgeRegistryRecord(validRecord({ endpoints: { invoke: 42 } }))
    ).toBeNull();
  });

  it('rejects endpoints that is not a plain object', () => {
    expect(parseBridgeRegistryRecord(validRecord({ endpoints: ['/invoke'] }))).toBeNull();
    expect(parseBridgeRegistryRecord(validRecord({ endpoints: '/invoke' }))).toBeNull();
  });

  it('accepts a record without endpoints', () => {
    expect(parseBridgeRegistryRecord(validRecord())?.bridgeId).toBe('a');
  });
});

describe('parseBridgeRegistryRecord identifier validation', () => {
  it.each(['at.terminal', 'at.jumpserver', 'at.grafana'])(
    'accepts pluginId %p',
    (pluginId) => {
      expect(parseBridgeRegistryRecord(validRecord({ pluginId }))?.pluginId).toBe(
        pluginId
      );
    }
  );

  it.each(['AT.Terminal', 'terminal', 'at..terminal', 'at.terminal.', '../evil'])(
    'rejects pluginId %p',
    (pluginId) => {
      expect(parseBridgeRegistryRecord(validRecord({ pluginId }))).toBeNull();
    }
  );

  it('accepts a catalog of protocol-conformant tool names', () => {
    const record = parseBridgeRegistryRecord(
      validRecord({
        tools: [
          { name: 'list_ssh_servers', risk: 'read' },
          { name: 'jumpserver_sftp_read_file', risk: 'read' }
        ]
      })
    );
    expect(record?.tools.map((t) => t.name)).toEqual([
      'list_ssh_servers',
      'jumpserver_sftp_read_file'
    ]);
  });

  it.each(['ListSshServers', '../evil', '', 'list-ssh-servers', '_leading'])(
    'rejects a catalog containing tool name %p',
    (name) => {
      expect(
        parseBridgeRegistryRecord(validRecord({ tools: [{ name, risk: 'read' }] }))
      ).toBeNull();
    }
  );

  it('rejects a catalog entry that is not an object', () => {
    expect(parseBridgeRegistryRecord(validRecord({ tools: [null] }))).toBeNull();
    expect(parseBridgeRegistryRecord(validRecord({ tools: ['list_ssh_servers'] }))).toBeNull();
  });
});
