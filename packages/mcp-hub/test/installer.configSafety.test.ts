import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig
} from '../src/installer/index';
import {
  mcpConfigBackupPath,
  mcpConfigLockPath
} from '../src/installer/jsonConfigFile';
import { MCP_SERVER_DISPLAY_NAME } from '../src/protocol/index';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type McpDocument = { mcpServers: Record<string, unknown> };

/** A third-party server the user configured themselves. We must not lose it. */
const otherServer = { command: 'uvx', args: ['mcp-server-fetch'] };

describe('IDE MCP config write safety', () => {
  let home: string;
  let hubJs: string;
  let mcpPath: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-cfgsafety-'));
    hubJs = path.join(home, '.at-series', 'mcp', 'hub.js');
    await fs.mkdir(path.dirname(hubJs), { recursive: true });
    await fs.writeFile(hubJs, 'module.exports = {};\n', 'utf8');
    mcpPath = path.join(home, '.cursor', 'mcp.json');
    await fs.mkdir(path.dirname(mcpPath), { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(home, { recursive: true, force: true });
  });

  async function seed(config: unknown): Promise<string> {
    const text = `${JSON.stringify(config, null, 2)}\n`;
    await fs.writeFile(mcpPath, text, 'utf8');
    return text;
  }

  function ensure(): Promise<{ updated: boolean }> {
    return ensureAtSeriesMcpConfig({
      target: 'cursor',
      hostApp: 'cursor',
      hubJsAbsolutePath: hubJs,
      home
    });
  }

  async function readDoc(): Promise<McpDocument> {
    return JSON.parse(await fs.readFile(mcpPath, 'utf8')) as McpDocument;
  }

  /** Stand in for a second IDE window that is mid-write right now. */
  async function holdLock(): Promise<void> {
    await fs.writeFile(
      mcpConfigLockPath(mcpPath),
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
      'utf8'
    );
  }

  describe('crash safety', () => {
    it('never exposes a half-written config to a concurrent reader', async () => {
      // The user's whole MCP setup lives in this one file. Truncate-then-write
      // means any reader during the write — the IDE included — can see an
      // empty or partial document.
      const bulky: Record<string, unknown> = {};
      for (let i = 0; i < 4000; i += 1) {
        bulky[`third-party-${i}`] = {
          command: 'uvx',
          args: ['mcp-server-fetch', 'x'.repeat(512)]
        };
      }
      const before = await seed({ mcpServers: bulky });

      const samples: string[] = [];
      const sampler = setInterval(() => {
        void fs.readFile(mcpPath, 'utf8').then(
          (text) => samples.push(text),
          () => undefined
        );
      }, 1);
      await ensure();
      clearInterval(sampler);
      await delay(5);
      const after = await fs.readFile(mcpPath, 'utf8');

      expect(samples.length).toBeGreaterThan(0);
      const torn = samples.filter((s) => s !== before && s !== after);
      expect(torn.map((s) => s.length)).toEqual([]);
    });

    it('leaves the original untouched when the write fails', async () => {
      const before = await seed({ mcpServers: { 'other-server': otherServer } });
      const failure = new Error('ENOSPC: no space left on device');
      vi.spyOn(fs, 'rename').mockRejectedValue(failure);

      await expect(ensure()).rejects.toThrow('ENOSPC');

      expect(await fs.readFile(mcpPath, 'utf8')).toBe(before);
    });

    it('leaves no temp file behind when the write fails', async () => {
      await seed({ mcpServers: { 'other-server': otherServer } });
      vi.spyOn(fs, 'rename').mockRejectedValue(new Error('EIO'));

      await expect(ensure()).rejects.toThrow();

      const stray = (await fs.readdir(path.dirname(mcpPath))).filter((name) =>
        name.endsWith('.tmp')
      );
      expect(stray).toEqual([]);
    });
  });

  describe('backup', () => {
    it('keeps a copy of the original before the first rewrite', async () => {
      const before = await seed({ mcpServers: { 'other-server': otherServer } });

      await ensure();

      expect(await fs.readFile(`${mcpPath}.at-series.bak`, 'utf8')).toBe(before);
    });

    it('keeps the pristine original across later rewrites', async () => {
      const before = await seed({ mcpServers: { 'other-server': otherServer } });
      await ensure();

      await uninstallAtSeriesMcpConfig({ target: 'cursor', home });
      await ensure();

      expect(await fs.readFile(mcpConfigBackupPath(mcpPath), 'utf8')).toBe(
        before
      );
    });

    it('backs up byte for byte, including formatting we do not reproduce', async () => {
      const before = '{\n\t"mcpServers": {\n\t\t"other-server": {}\n\t}\n}';
      await fs.writeFile(mcpPath, before, 'utf8');

      await ensure();

      expect(await fs.readFile(mcpConfigBackupPath(mcpPath), 'utf8')).toBe(
        before
      );
    });

    it.skipIf(process.platform === 'win32')(
      'does not give a private config a world-readable backup',
      async () => {
        // Third-party MCP entries carry API keys in `env`.
        await seed({ mcpServers: { 'other-server': otherServer } });
        await fs.chmod(mcpPath, 0o600);

        await ensure();

        const mode = (await fs.stat(mcpConfigBackupPath(mcpPath))).mode & 0o777;
        expect(mode & 0o077).toBe(0);
      }
    );

    it('writes no backup when there was no config to lose', async () => {
      await ensure();

      await expect(
        fs.access(mcpConfigBackupPath(mcpPath))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  describe('concurrent plugin activations', () => {
    it('keeps every third-party server when ten activations race', async () => {
      const seeded: Record<string, unknown> = {};
      for (let i = 0; i < 20; i += 1) {
        seeded[`third-party-${i}`] = { command: 'uvx', args: [`server-${i}`] };
      }
      seeded['AT Terminal'] = {
        command: 'node',
        args: ['C:/old/at-terminal/dist/mcp-server.js']
      };
      await seed({ mcpServers: seeded });

      await Promise.all(Array.from({ length: 10 }, () => ensure()));

      const doc = await readDoc();
      for (let i = 0; i < 20; i += 1) {
        expect(doc.mcpServers[`third-party-${i}`]).toEqual({
          command: 'uvx',
          args: [`server-${i}`]
        });
      }
      expect(doc.mcpServers['AT Terminal']).toBeUndefined();
      expect(doc.mcpServers[MCP_SERVER_DISPLAY_NAME]).toBeDefined();
    });

    it('leaves exactly one AT Series entry (INV-1)', async () => {
      await seed({ mcpServers: { 'other-server': otherServer } });

      await Promise.all(Array.from({ length: 10 }, () => ensure()));

      const doc = await readDoc();
      const atEntries = Object.keys(doc.mcpServers).filter((k) =>
        k.toLowerCase().startsWith('at ')
      );
      expect(atEntries).toEqual([MCP_SERVER_DISPLAY_NAME]);
    });

    it('reports the write exactly once across racing activations', async () => {
      await seed({ mcpServers: { 'other-server': otherServer } });

      const results = await Promise.all(
        Array.from({ length: 10 }, () => ensure())
      );

      expect(results.filter((r) => r.updated)).toHaveLength(1);
    });

    it('waits for a lock another activation is holding', async () => {
      // Deterministic proof that the read-modify-write is guarded: while a live
      // lock exists the config must stay untouched, and the wait must end when
      // the holder releases.
      const before = await seed({
        mcpServers: { 'other-server': otherServer }
      });
      await holdLock();

      const pending = ensure();
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      await delay(200);
      expect(settled).toBe(false);
      expect(await fs.readFile(mcpPath, 'utf8')).toBe(before);

      await fs.rm(mcpConfigLockPath(mcpPath));

      await expect(pending).resolves.toEqual({ updated: true });
    });

    it('makes uninstall wait for the same lock', async () => {
      await seed({ mcpServers: { 'other-server': otherServer } });
      await ensure();
      const before = await fs.readFile(mcpPath, 'utf8');
      await holdLock();

      const pending = uninstallAtSeriesMcpConfig({ target: 'cursor', home });
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      await delay(200);
      expect(settled).toBe(false);
      expect(await fs.readFile(mcpPath, 'utf8')).toBe(before);

      await fs.rm(mcpConfigLockPath(mcpPath));

      await expect(pending).resolves.toEqual({ removed: true });
    });

    it('releases the lock once the config is written', async () => {
      await ensure();

      await expect(
        fs.access(mcpConfigLockPath(mcpPath))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  describe('third-party entries', () => {
    it('round-trips an unrelated server byte for byte', async () => {
      const rich = {
        command: 'uvx',
        args: ['mcp-server-fetch', '--flag'],
        env: { API_KEY: 'secret' },
        disabled: false,
        nested: { deep: [1, 2, { three: true }] }
      };
      await seed({ mcpServers: { 'other-server': rich } });

      await ensure();

      expect((await readDoc()).mcpServers['other-server']).toEqual(rich);
    });

    it('keeps unrelated top-level keys', async () => {
      await seed({
        mcpServers: { 'other-server': otherServer },
        someOtherSetting: { keep: 'me' }
      });

      await ensure();

      const doc = JSON.parse(await fs.readFile(mcpPath, 'utf8')) as {
        someOtherSetting: unknown;
      };
      expect(doc.someOtherSetting).toEqual({ keep: 'me' });
    });
  });

  describe('file ownership', () => {
    it.skipIf(process.platform === 'win32')(
      'does not re-permission the user config',
      async () => {
        await seed({ mcpServers: { 'other-server': otherServer } });
        await fs.chmod(mcpPath, 0o644);

        await ensure();

        expect((await fs.stat(mcpPath)).mode & 0o777).toBe(0o644);
      }
    );

    it.skipIf(process.platform === 'win32')(
      'does not re-permission the IDE config directory',
      async () => {
        await fs.chmod(path.dirname(mcpPath), 0o755);

        await ensure();

        expect((await fs.stat(path.dirname(mcpPath))).mode & 0o777).toBe(0o755);
      }
    );
  });
});
