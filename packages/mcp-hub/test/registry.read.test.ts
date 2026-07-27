import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listBridgeRecords } from '../src/registry/read';

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
});
