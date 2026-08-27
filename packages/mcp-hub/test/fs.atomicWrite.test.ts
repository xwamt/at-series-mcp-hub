import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile, ensureDir } from '../src/fs/atomicWrite';

const isWindows = process.platform === 'win32';

async function modeOf(target: string): Promise<number> {
  const stat = await fs.stat(target);
  return stat.mode & 0o777;
}

describe('atomicWriteFile', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-atomic-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes the exact content', async () => {
    const target = path.join(root, 'record.json');
    await atomicWriteFile(target, '{"a":1}');

    expect(await fs.readFile(target, 'utf8')).toBe('{"a":1}');
  });

  it('writes Buffer content byte for byte', async () => {
    const target = path.join(root, 'hub.js');
    const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x0a]);
    await atomicWriteFile(target, bytes);

    expect(await fs.readFile(target)).toEqual(bytes);
  });

  it.skipIf(isWindows)('leaves the target at 0600', async () => {
    const target = path.join(root, 'token.json');
    await atomicWriteFile(target, 'secret');

    expect(await modeOf(target)).toBe(0o600);
  });

  it.skipIf(isWindows)('overwrites a lax pre-existing file back to 0600', async () => {
    const target = path.join(root, 'token.json');
    await fs.writeFile(target, 'old', { mode: 0o644 });
    expect(await modeOf(target)).toBe(0o644);

    await atomicWriteFile(target, 'new');

    expect(await modeOf(target)).toBe(0o600);
    expect(await fs.readFile(target, 'utf8')).toBe('new');
  });

  it.skipIf(isWindows)(
    'never exposes the content through a laxer temp file',
    async () => {
      const target = path.join(root, 'token.json');
      // The temp file is the only other place the content ever lives. Sampling
      // the directory while the write is in flight is racy, so instead assert
      // the invariant that makes the window impossible: every entry that
      // appears in the directory during the write is already 0600.
      const seen: number[] = [];
      const sampler = setInterval(() => {
        void (async () => {
          const entries = await fs.readdir(root).catch(() => []);
          for (const entry of entries) {
            const mode = await modeOf(path.join(root, entry)).catch(() => -1);
            if (mode >= 0) {
              seen.push(mode);
            }
          }
        })();
      }, 1);

      const big = 'x'.repeat(4 * 1024 * 1024);
      await atomicWriteFile(target, big);
      clearInterval(sampler);
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(await modeOf(target)).toBe(0o600);
      for (const mode of seen) {
        expect(mode).toBe(0o600);
      }
    }
  );

  it('creates missing parent directories', async () => {
    const target = path.join(root, 'a', 'b', 'c', 'record.json');
    await atomicWriteFile(target, 'nested');

    expect(await fs.readFile(target, 'utf8')).toBe('nested');
  });

  it.skipIf(isWindows)('creates every missing directory level at 0700', async () => {
    const target = path.join(root, 'a', 'b', 'c', 'record.json');
    await atomicWriteFile(target, 'nested');

    expect(await modeOf(path.join(root, 'a'))).toBe(0o700);
    expect(await modeOf(path.join(root, 'a', 'b'))).toBe(0o700);
    expect(await modeOf(path.join(root, 'a', 'b', 'c'))).toBe(0o700);
  });

  it('leaves no temp files behind', async () => {
    const target = path.join(root, 'record.json');
    await atomicWriteFile(target, 'done');

    expect(await fs.readdir(root)).toEqual(['record.json']);
  });

  it('never leaves a torn file when 10 writers race on one target', async () => {
    const target = path.join(root, 'contended.json');
    const bodies = Array.from({ length: 10 }, (_, i) =>
      `${i}`.repeat(512 * 1024)
    );

    await Promise.all(bodies.map((body) => atomicWriteFile(target, body)));

    const finalText = await fs.readFile(target, 'utf8');
    expect(bodies).toContain(finalText);
    expect(await fs.readdir(root)).toEqual(['contended.json']);
  });

  it('rejects and cleans up when the target path is a directory', async () => {
    const target = path.join(root, 'blocked');
    await fs.mkdir(target);

    await expect(atomicWriteFile(target, 'nope')).rejects.toThrow();
    expect(await fs.readdir(root)).toEqual(['blocked']);
  });
});

describe('atomicWriteFile rename retry', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-rename-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  function errnoError(code: string): NodeJS.ErrnoException {
    const err = new Error(`${code}: mocked rename failure`) as NodeJS.ErrnoException;
    err.code = code;
    return err;
  }

  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'retries a transient %s on rename and still lands the write',
    async (code) => {
      const target = path.join(root, 'record.json');
      const realRename = fs.rename;
      let failures = 0;
      const spy = vi
        .spyOn(fs, 'rename')
        .mockImplementation(async (from, to) => {
          if (failures < 2) {
            failures += 1;
            throw errnoError(code);
          }
          return realRename(from, to);
        });

      await atomicWriteFile(target, 'after retry');

      expect(await fs.readFile(target, 'utf8')).toBe('after retry');
      expect(spy).toHaveBeenCalledTimes(3);
      expect(await fs.readdir(root)).toEqual(['record.json']);
    }
  );

  it('gives up after exhausting retries and cleans the temp file', async () => {
    const target = path.join(root, 'record.json');
    const spy = vi.spyOn(fs, 'rename').mockRejectedValue(errnoError('EPERM'));

    await expect(atomicWriteFile(target, 'never lands')).rejects.toMatchObject({
      code: 'EPERM'
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('does not retry a non-transient rename failure', async () => {
    const target = path.join(root, 'record.json');
    const spy = vi.spyOn(fs, 'rename').mockRejectedValue(errnoError('EXDEV'));

    await expect(atomicWriteFile(target, 'nope')).rejects.toMatchObject({
      code: 'EXDEV'
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(root)).toEqual([]);
  });
});

describe('atomicWriteFile with mode "preserve"', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-preserve-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes the exact content', async () => {
    const target = path.join(root, 'mcp.json');
    await atomicWriteFile(target, '{"a":1}', { mode: 'preserve' });

    expect(await fs.readFile(target, 'utf8')).toBe('{"a":1}');
  });

  it.skipIf(isWindows)('keeps the permissions the target file already had', async () => {
    // ~/.cursor/mcp.json belongs to the user, not to us. Rewriting their MCP
    // config must not silently re-permission it.
    const target = path.join(root, 'mcp.json');
    await fs.writeFile(target, 'old', { mode: 0o644 });

    await atomicWriteFile(target, 'new', { mode: 'preserve' });

    expect(await modeOf(target)).toBe(0o644);
    expect(await fs.readFile(target, 'utf8')).toBe('new');
  });

  it.skipIf(isWindows)('keeps unusually tight permissions too', async () => {
    const target = path.join(root, 'mcp.json');
    await fs.writeFile(target, 'old', { mode: 0o600 });

    await atomicWriteFile(target, 'new', { mode: 'preserve' });

    expect(await modeOf(target)).toBe(0o600);
  });

  it.skipIf(isWindows)('creates a missing file with the process default mode', async () => {
    const control = path.join(root, 'control');
    await fs.writeFile(control, 'x');
    const target = path.join(root, 'mcp.json');

    await atomicWriteFile(target, 'new', { mode: 'preserve' });

    expect(await modeOf(target)).toBe(await modeOf(control));
  });

  it.skipIf(isWindows)('never widens the target through the temp file', async () => {
    // The temp file is the only other place the content lives. For a 0600
    // target it must not appear at 0644 even briefly.
    const target = path.join(root, 'mcp.json');
    await fs.writeFile(target, 'old', { mode: 0o600 });
    const seen: number[] = [];
    const sampler = setInterval(() => {
      void (async () => {
        for (const entry of await fs.readdir(root).catch(() => [])) {
          const mode = await modeOf(path.join(root, entry)).catch(() => -1);
          if (mode >= 0) {
            seen.push(mode);
          }
        }
      })();
    }, 1);

    await atomicWriteFile(target, 'x'.repeat(4 * 1024 * 1024), {
      mode: 'preserve'
    });
    clearInterval(sampler);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(seen.length).toBeGreaterThan(0);
    for (const mode of seen) {
      expect(mode).toBe(0o600);
    }
  });

  it.skipIf(isWindows)('leaves an existing parent directory untouched', async () => {
    const dir = path.join(root, 'dot-cursor');
    await fs.mkdir(dir, { mode: 0o755 });
    const target = path.join(dir, 'mcp.json');

    await atomicWriteFile(target, 'new', { mode: 'preserve' });

    expect(await modeOf(dir)).toBe(0o755);
  });

  it.skipIf(isWindows)(
    'creates missing parent directories at the process default mode',
    async () => {
      const control = path.join(root, 'control-dir');
      await fs.mkdir(control);
      const target = path.join(root, 'dot-cursor', 'mcp.json');

      await atomicWriteFile(target, 'new', { mode: 'preserve' });

      expect(await modeOf(path.dirname(target))).toBe(await modeOf(control));
    }
  );

  it('leaves no temp files behind', async () => {
    const target = path.join(root, 'mcp.json');
    await atomicWriteFile(target, 'done', { mode: 'preserve' });

    expect(await fs.readdir(root)).toEqual(['mcp.json']);
  });

  it('writes through a symlink instead of replacing it', async () => {
    // Dotfile setups symlink ~/.cursor/mcp.json into a tracked repo. A rename
    // onto the link would swap it for a regular file and silently orphan the
    // tracked copy.
    const store = path.join(root, 'dotfiles', 'mcp.json');
    await fs.mkdir(path.dirname(store), { recursive: true });
    await fs.writeFile(store, 'old', 'utf8');
    const link = path.join(root, 'mcp.json');
    await fs.symlink(store, link);

    await atomicWriteFile(link, 'new', { mode: 'preserve' });

    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(store, 'utf8')).toBe('new');
  });
});

describe('ensureDir', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-ensuredir-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.skipIf(isWindows)('sets 0700 on every level it creates', async () => {
    const leaf = path.join(root, 'x', 'y', 'z');
    await ensureDir(leaf);

    expect(await modeOf(path.join(root, 'x'))).toBe(0o700);
    expect(await modeOf(path.join(root, 'x', 'y'))).toBe(0o700);
    expect(await modeOf(leaf)).toBe(0o700);
  });

  it.skipIf(isWindows)('tightens an existing lax directory', async () => {
    const dir = path.join(root, 'lax');
    await fs.mkdir(dir, { mode: 0o755 });
    expect(await modeOf(dir)).toBe(0o755);

    await ensureDir(dir);

    expect(await modeOf(dir)).toBe(0o700);
  });

  it('is idempotent', async () => {
    const dir = path.join(root, 'again');
    await ensureDir(dir);
    await ensureDir(dir);

    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it.skipIf(isWindows)(
    'with mode "preserve" does not tighten an existing directory',
    async () => {
      const dir = path.join(root, 'dot-cursor');
      await fs.mkdir(dir, { mode: 0o755 });

      await ensureDir(dir, { mode: 'preserve' });

      expect(await modeOf(dir)).toBe(0o755);
    }
  );
});
