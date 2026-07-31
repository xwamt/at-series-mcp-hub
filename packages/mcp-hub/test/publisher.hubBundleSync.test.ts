import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncHubBundle } from '../src/publisher/HubBundleSync';
import { hubJsPath, hubVersionPath } from '../src/protocol/paths';
import type { HubVersionRecord } from '../src/protocol/index';

function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function writeActiveHub(
  home: string,
  opts: {
    version: string;
    content: string;
    pluginId?: string;
    pluginVersion?: string;
  }
): Promise<void> {
  const mcp = path.dirname(hubJsPath(home));
  await fs.mkdir(mcp, { recursive: true });
  await fs.writeFile(hubJsPath(home), opts.content, 'utf8');
  const meta: HubVersionRecord = {
    version: opts.version,
    protocolVersion: 1,
    writtenByPluginId: opts.pluginId ?? 'at.terminal',
    writtenByPluginVersion: opts.pluginVersion ?? '0.2.0',
    writtenAt: 1_700_000_000_000,
    bundleSha256: sha256Hex(opts.content)
  };
  await fs.writeFile(hubVersionPath(home), JSON.stringify(meta, null, 2), 'utf8');
}

describe('syncHubBundle', () => {
  let home: string;
  let bundleDir: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-hubsync-'));
    bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-bundle-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(bundleDir, { recursive: true, force: true });
  });

  async function candidate(content: string): Promise<string> {
    const p = path.join(bundleDir, 'hub.js');
    await fs.writeFile(p, content, 'utf8');
    return p;
  }

  it('writes hub.js and hub-version.json when no hub exists', async () => {
    const content = 'module.exports = { v: "0.1.0" };\n';
    const bundlePath = await candidate(content);

    const result = await syncHubBundle({
      version: '0.1.0',
      bundlePath,
      pluginId: 'at.terminal',
      pluginVersion: '0.2.17',
      home
    });

    expect(result).toEqual({ updated: true, activeVersion: '0.1.0' });

    const hubText = await fs.readFile(hubJsPath(home), 'utf8');
    expect(hubText).toBe(content);

    const meta = JSON.parse(
      await fs.readFile(hubVersionPath(home), 'utf8')
    ) as HubVersionRecord;
    expect(meta.version).toBe('0.1.0');
    expect(meta.protocolVersion).toBe(2);
    expect(meta.writtenByPluginId).toBe('at.terminal');
    expect(meta.writtenByPluginVersion).toBe('0.2.17');
    expect(meta.bundleSha256).toBe(sha256Hex(content));
    expect(typeof meta.writtenAt).toBe('number');
  });

  it('does not overwrite when candidate semver is lower', async () => {
    await writeActiveHub(home, {
      version: '0.2.0',
      content: 'active-0.2.0'
    });
    const bundlePath = await candidate('candidate-0.1.0');

    const result = await syncHubBundle({
      version: '0.1.0',
      bundlePath,
      pluginId: 'at.jumpserver',
      pluginVersion: '1.0.0',
      home
    });

    expect(result).toEqual({ updated: false, activeVersion: '0.2.0' });
    expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe('active-0.2.0');
  });

  it('overwrites when candidate semver is greater', async () => {
    await writeActiveHub(home, {
      version: '0.1.0',
      content: 'active-0.1.0'
    });
    const content = 'candidate-0.2.0';
    const bundlePath = await candidate(content);

    const result = await syncHubBundle({
      version: '0.2.0',
      bundlePath,
      pluginId: 'at.jumpserver',
      pluginVersion: '1.0.0',
      home
    });

    expect(result).toEqual({ updated: true, activeVersion: '0.2.0' });
    expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);

    const meta = JSON.parse(
      await fs.readFile(hubVersionPath(home), 'utf8')
    ) as HubVersionRecord;
    expect(meta.version).toBe('0.2.0');
    expect(meta.writtenByPluginId).toBe('at.jumpserver');
    expect(meta.bundleSha256).toBe(sha256Hex(content));
  });

  it('overwrites when same semver but different bundle hash', async () => {
    await writeActiveHub(home, {
      version: '0.1.0',
      content: 'content-a'
    });
    const content = 'content-b';
    const bundlePath = await candidate(content);

    const result = await syncHubBundle({
      version: '0.1.0',
      bundlePath,
      pluginId: 'at.terminal',
      pluginVersion: '0.2.18',
      home
    });

    expect(result).toEqual({ updated: true, activeVersion: '0.1.0' });
    expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);

    const meta = JSON.parse(
      await fs.readFile(hubVersionPath(home), 'utf8')
    ) as HubVersionRecord;
    expect(meta.bundleSha256).toBe(sha256Hex(content));
    expect(meta.writtenByPluginVersion).toBe('0.2.18');
  });

  it('no-ops when same semver and identical bundle hash', async () => {
    const content = 'same-content';
    await writeActiveHub(home, {
      version: '0.1.0',
      content,
      pluginId: 'at.terminal',
      pluginVersion: '0.2.17'
    });
    const beforeMeta = await fs.readFile(hubVersionPath(home), 'utf8');
    const bundlePath = await candidate(content);

    const result = await syncHubBundle({
      version: '0.1.0',
      bundlePath,
      pluginId: 'at.jumpserver',
      pluginVersion: '9.9.9',
      home
    });

    expect(result).toEqual({ updated: false, activeVersion: '0.1.0' });
    expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);
    expect(await fs.readFile(hubVersionPath(home), 'utf8')).toBe(beforeMeta);
  });
});
