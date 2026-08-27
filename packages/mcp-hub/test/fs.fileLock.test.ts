import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withFileLock } from '../src/fs/fileLock';

const isWindows = process.platform === 'win32';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withFileLock', () => {
  let root: string;
  let lockPath: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-filelock-'));
    lockPath = path.join(root, '.guarded.lock');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns the callback result', async () => {
    const result = await withFileLock(lockPath, async () => 'done');

    expect(result).toBe('done');
  });

  it('serialises concurrent read-modify-write cycles on one file', async () => {
    // This is the lost-update bug in miniature: every racer reads, thinks, then
    // writes back a value derived from a snapshot that may already be stale.
    const counter = path.join(root, 'counter');
    await fs.writeFile(counter, '0', 'utf8');
    const bump = async (): Promise<void> => {
      const seen = Number(await fs.readFile(counter, 'utf8'));
      await delay(2);
      await fs.writeFile(counter, String(seen + 1), 'utf8');
    };

    await Promise.all(
      Array.from({ length: 10 }, () => withFileLock(lockPath, bump))
    );

    expect(await fs.readFile(counter, 'utf8')).toBe('10');
  });

  it('never lets two holders overlap', async () => {
    let inside = 0;
    let maxInside = 0;
    const critical = async (): Promise<void> => {
      inside += 1;
      maxInside = Math.max(maxInside, inside);
      await delay(2);
      inside -= 1;
    };

    await Promise.all(
      Array.from({ length: 8 }, () => withFileLock(lockPath, critical))
    );

    expect(maxInside).toBe(1);
  });

  it('releases the lock after the callback succeeds', async () => {
    await withFileLock(lockPath, async () => undefined);

    await expect(fs.access(lockPath)).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('releases the lock and rethrows when the callback fails', async () => {
    await expect(
      withFileLock(lockPath, async () => {
        throw new Error('callback exploded');
      })
    ).rejects.toThrow('callback exploded');

    await expect(fs.access(lockPath)).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it.skipIf(isWindows)('creates the lock file owner-only', async () => {
    let mode = -1;
    await withFileLock(lockPath, async () => {
      mode = (await fs.stat(lockPath)).mode & 0o777;
    });

    expect(mode).toBe(0o600);
  });

  it('steals a lock left behind by a crashed holder', async () => {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: 999_999, acquiredAt: Date.now() - 300_000 }),
      'utf8'
    );

    await expect(withFileLock(lockPath, async () => 'ran')).resolves.toBe(
      'ran'
    );
  });

  it.each([
    ['unparseable', 'not json at all'],
    ['empty', ''],
    ['missing acquiredAt', '{"pid":1}'],
    ['a non-numeric acquiredAt', '{"acquiredAt":"soon"}']
  ])('treats %s lock content as stale', async (_label, raw) => {
    await fs.writeFile(lockPath, raw, 'utf8');

    await expect(withFileLock(lockPath, async () => 'ran')).resolves.toBe(
      'ran'
    );
  });

  it('immediately steals a fresh lock whose recorded pid is dead', async () => {
    // Protocol v1 §8.6: a crashed holder must not wedge waiters for the full
    // staleness window. acquiredAt is brand new; only the dead pid frees it.
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: 999_999, acquiredAt: Date.now() }),
      'utf8'
    );

    const started = Date.now();
    await expect(
      withFileLock(lockPath, async () => 'ran', { timeoutMs: 200 })
    ).resolves.toBe('ran');
    expect(Date.now() - started).toBeLessThan(200);
  });

  it.each([
    ['zero', 0],
    ['negative', -1234],
    ['fractional', 3.14],
    ['a string', '123']
  ])('treats a fresh lock recording %s as pid as stale', async (_label, pid) => {
    // Invalid pids are never signalled (kill(0)/kill(-n) hit process groups);
    // they simply count as dead, so the lock is reclaimable.
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid, acquiredAt: Date.now() }),
      'utf8'
    );

    await expect(
      withFileLock(lockPath, async () => 'ran', { timeoutMs: 200 })
    ).resolves.toBe('ran');
  });

  it.skipIf(isWindows)(
    'does not steal a fresh lock whose pid exists but is not signalable',
    async () => {
      // pid 1 is init: kill(1, 0) yields EPERM for a non-root test run (and
      // plain success under root), both of which must count as "alive".
      await fs.writeFile(
        lockPath,
        JSON.stringify({ pid: 1, acquiredAt: Date.now() }),
        'utf8'
      );

      await expect(
        withFileLock(lockPath, async () => 'ran', { timeoutMs: 150 })
      ).rejects.toThrow(/lock/i);
    }
  );

  it('still steals an expired lock even when its pid is alive', async () => {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() - 300_000 }),
      'utf8'
    );

    await expect(withFileLock(lockPath, async () => 'ran')).resolves.toBe(
      'ran'
    );
  });

  it('gives up instead of hanging when a live lock is never released', async () => {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
      'utf8'
    );

    await expect(
      withFileLock(lockPath, async () => 'ran', { timeoutMs: 100 })
    ).rejects.toThrow(/lock/i);
  });

  it('names the contended path in the timeout error', async () => {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
      'utf8'
    );

    await expect(
      withFileLock(lockPath, async () => 'ran', { timeoutMs: 100 })
    ).rejects.toThrow(lockPath);
  });

  it('leaves a live lock in place after giving up on it', async () => {
    const held = JSON.stringify({
      pid: process.pid,
      acquiredAt: Date.now()
    });
    await fs.writeFile(lockPath, held, 'utf8');

    await expect(
      withFileLock(lockPath, async () => 'ran', { timeoutMs: 100 })
    ).rejects.toThrow();

    expect(await fs.readFile(lockPath, 'utf8')).toBe(held);
  });

  it('honours a custom stale threshold', async () => {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() - 200 }),
      'utf8'
    );

    await expect(
      withFileLock(lockPath, async () => 'ran', {
        staleMs: 50,
        timeoutMs: 500
      })
    ).resolves.toBe('ran');
  });

  it('waits for a holder that releases before the deadline', async () => {
    const order: string[] = [];
    const slow = withFileLock(lockPath, async () => {
      order.push('slow:start');
      await delay(60);
      order.push('slow:end');
    });
    await delay(5);
    const fast = withFileLock(lockPath, async () => {
      order.push('fast');
    });

    await Promise.all([slow, fast]);

    expect(order).toEqual(['slow:start', 'slow:end', 'fast']);
  });
});
