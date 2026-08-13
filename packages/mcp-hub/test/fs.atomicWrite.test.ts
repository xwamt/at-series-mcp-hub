import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
