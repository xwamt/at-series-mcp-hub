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

  async function candidate(content: string, name = 'hub.js'): Promise<string> {
    const p = path.join(bundleDir, name);
    await fs.writeFile(p, content, 'utf8');
    return p;
  }

  function lockPath(): string {
    return path.join(path.dirname(hubJsPath(home)), '.hub-sync.lock');
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

  describe('on-disk integrity', () => {
    it('rewrites hub.js when the file on disk no longer matches its recorded hash', async () => {
      const content = 'module.exports = { v: "0.3.0" };\n';
      const bundlePath = await candidate(content);
      await syncHubBundle({
        version: '0.3.0',
        bundlePath,
        pluginId: 'at.a',
        pluginVersion: '1.0.0',
        home
      });

      // Tamper: replace the executable while leaving the metadata untouched,
      // which is exactly what a local attacker installing a backdoor would do.
      await fs.writeFile(hubJsPath(home), '/* backdoor */\n');

      const result = await syncHubBundle({
        version: '0.3.0',
        bundlePath,
        pluginId: 'at.a',
        pluginVersion: '1.0.0',
        home
      });

      expect(result.updated).toBe(true);
      const restored = await fs.readFile(hubJsPath(home), 'utf8');
      expect(restored).not.toContain('backdoor');
      expect(restored).toBe(content);
    });

    it('rewrites hub.js when the recorded version is higher but the file was tampered with', async () => {
      // A lower-versioned plugin must still repair a corrupted hub.js rather
      // than deferring to metadata that no longer describes anything on disk.
      await writeActiveHub(home, { version: '0.9.0', content: 'active-0.9.0' });
      await fs.writeFile(hubJsPath(home), '/* backdoor */\n');
      const content = 'candidate-0.3.0';
      const bundlePath = await candidate(content);

      const result = await syncHubBundle({
        version: '0.3.0',
        bundlePath,
        pluginId: 'at.b',
        pluginVersion: '1.0.0',
        home
      });

      expect(result.updated).toBe(true);
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);
      const meta = JSON.parse(
        await fs.readFile(hubVersionPath(home), 'utf8')
      ) as HubVersionRecord;
      expect(meta.version).toBe('0.3.0');
      expect(meta.bundleSha256).toBe(sha256Hex(content));
    });

    it('rewrites hub.js when the metadata exists but the file is gone', async () => {
      const content = 'restored-0.1.0';
      await writeActiveHub(home, { version: '0.1.0', content });
      await fs.rm(hubJsPath(home));
      const bundlePath = await candidate(content);

      const result = await syncHubBundle({
        version: '0.1.0',
        bundlePath,
        pluginId: 'at.terminal',
        pluginVersion: '0.2.17',
        home
      });

      expect(result).toEqual({ updated: true, activeVersion: '0.1.0' });
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);
    });
  });

  describe('corrupt metadata self-healing', () => {
    it.each([
      ['empty object', '{}'],
      ['not JSON at all', 'not json {{{'],
      ['a JSON array', '[]'],
      ['null', 'null'],
      ['missing bundleSha256', '{"version":"0.2.0"}'],
      ['a non-semver version', '{"version":"garbage","bundleSha256":"abc"}'],
      [
        'a non-string version',
        '{"version":3,"bundleSha256":"abc"}'
      ]
    ])('treats %s as no active hub and writes a fresh one', async (_label, raw) => {
      const content = 'healed-0.1.0';
      await writeActiveHub(home, { version: '0.1.0', content: 'stale' });
      await fs.writeFile(hubVersionPath(home), raw, 'utf8');
      const bundlePath = await candidate(content);

      const result = await syncHubBundle({
        version: '0.1.0',
        bundlePath,
        pluginId: 'at.terminal',
        pluginVersion: '0.2.17',
        home
      });

      expect(result).toEqual({ updated: true, activeVersion: '0.1.0' });
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);
      const meta = JSON.parse(
        await fs.readFile(hubVersionPath(home), 'utf8')
      ) as HubVersionRecord;
      expect(meta.version).toBe('0.1.0');
      expect(meta.bundleSha256).toBe(sha256Hex(content));
    });
  });

  describe('concurrent election', () => {
    it('never lets a lower version win a concurrent election', async () => {
      const highContent = 'high-0.3.0';
      const lowContent = 'low-0.2.0';
      const highBundle = await candidate(highContent, 'high.js');
      const lowBundle = await candidate(lowContent, 'low.js');

      await Promise.all([
        syncHubBundle({
          version: '0.3.0',
          bundlePath: highBundle,
          pluginId: 'at.a',
          pluginVersion: '1.0.0',
          home
        }),
        syncHubBundle({
          version: '0.2.0',
          bundlePath: lowBundle,
          pluginId: 'at.b',
          pluginVersion: '1.0.0',
          home
        })
      ]);

      const meta = JSON.parse(
        await fs.readFile(hubVersionPath(home), 'utf8')
      ) as HubVersionRecord;
      expect(meta.version).toBe('0.3.0');
      // The metadata must describe the file that is actually on disk.
      const onDisk = sha256Hex(await fs.readFile(hubJsPath(home)));
      expect(meta.bundleSha256).toBe(onDisk);
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(highContent);
    });

    it('holds the same outcome when the low version is scheduled first', async () => {
      const highContent = 'high-0.3.0';
      const highBundle = await candidate(highContent, 'high.js');
      const lowBundle = await candidate('low-0.2.0', 'low.js');

      await Promise.all([
        syncHubBundle({
          version: '0.2.0',
          bundlePath: lowBundle,
          pluginId: 'at.b',
          pluginVersion: '1.0.0',
          home
        }),
        syncHubBundle({
          version: '0.3.0',
          bundlePath: highBundle,
          pluginId: 'at.a',
          pluginVersion: '1.0.0',
          home
        })
      ]);

      const meta = JSON.parse(
        await fs.readFile(hubVersionPath(home), 'utf8')
      ) as HubVersionRecord;
      expect(meta.version).toBe('0.3.0');
      expect(meta.bundleSha256).toBe(
        sha256Hex(await fs.readFile(hubJsPath(home)))
      );
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(highContent);
    });

    it('keeps metadata consistent when three plugins race', async () => {
      const versions = ['0.1.0', '0.2.0', '0.3.0'];
      const bundles = await Promise.all(
        versions.map((v) => candidate(`bundle-${v}`, `${v}.js`))
      );

      await Promise.all(
        versions.map((version, i) =>
          syncHubBundle({
            version,
            bundlePath: bundles[i],
            pluginId: `at.${i}`,
            pluginVersion: '1.0.0',
            home
          })
        )
      );

      const meta = JSON.parse(
        await fs.readFile(hubVersionPath(home), 'utf8')
      ) as HubVersionRecord;
      expect(meta.version).toBe('0.3.0');
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe('bundle-0.3.0');
      expect(meta.bundleSha256).toBe(
        sha256Hex(await fs.readFile(hubJsPath(home)))
      );
    });

    it('releases the lock after a successful sync', async () => {
      const bundlePath = await candidate('released');

      await syncHubBundle({
        version: '0.1.0',
        bundlePath,
        pluginId: 'at.a',
        pluginVersion: '1.0.0',
        home
      });

      await expect(fs.access(lockPath())).rejects.toMatchObject({
        code: 'ENOENT'
      });
    });

    it('releases the lock when the write fails', async () => {
      // hub.js is a directory, so the rename inside atomicWriteFile fails.
      await fs.mkdir(hubJsPath(home), { recursive: true });
      const bundlePath = await candidate('doomed');

      await expect(
        syncHubBundle({
          version: '0.1.0',
          bundlePath,
          pluginId: 'at.a',
          pluginVersion: '1.0.0',
          home
        })
      ).rejects.toThrow();

      await expect(fs.access(lockPath())).rejects.toMatchObject({
        code: 'ENOENT'
      });
    });

    it('steals a stale lock rather than wedging hub sync forever', async () => {
      // A crashed plugin leaves its lock behind. Without stale handling every
      // plugin on the machine would refuse to sync from then on.
      await fs.mkdir(path.dirname(lockPath()), { recursive: true });
      await fs.writeFile(
        lockPath(),
        JSON.stringify({ pid: 999_999, acquiredAt: Date.now() - 300_000 }),
        'utf8'
      );
      const content = 'after-stale-lock';
      const bundlePath = await candidate(content);

      const result = await syncHubBundle({
        version: '0.1.0',
        bundlePath,
        pluginId: 'at.a',
        pluginVersion: '1.0.0',
        home
      });

      expect(result).toEqual({ updated: true, activeVersion: '0.1.0' });
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);
    });

    it('treats an unparseable lock file as stale', async () => {
      await fs.mkdir(path.dirname(lockPath()), { recursive: true });
      await fs.writeFile(lockPath(), 'not json at all', 'utf8');
      const content = 'after-corrupt-lock';
      const bundlePath = await candidate(content);

      const result = await syncHubBundle({
        version: '0.1.0',
        bundlePath,
        pluginId: 'at.a',
        pluginVersion: '1.0.0',
        home
      });

      expect(result).toEqual({ updated: true, activeVersion: '0.1.0' });
      expect(await fs.readFile(hubJsPath(home), 'utf8')).toBe(content);
    });

    it('gives up instead of hanging when a live lock is never released', async () => {
      await fs.mkdir(path.dirname(lockPath()), { recursive: true });
      await fs.writeFile(
        lockPath(),
        JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
        'utf8'
      );
      const bundlePath = await candidate('blocked');

      await expect(
        syncHubBundle({
          version: '0.1.0',
          bundlePath,
          pluginId: 'at.a',
          pluginVersion: '1.0.0',
          home
        })
      ).rejects.toThrow(/lock/i);
    }, 15_000);
  });
});
