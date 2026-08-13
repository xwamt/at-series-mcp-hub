import crypto from 'node:crypto';
import fs from 'node:fs/promises';

/** Beyond this the holder is presumed dead, otherwise one crash wedges every plugin. */
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_MS = 20;

export type FileLockOptions = {
  /** Age past which a lock is presumed abandoned. Default 30 s. */
  staleMs?: number;
  /** Total acquisition budget before giving up. Default 5 s. */
  timeoutMs?: number;
  /** Poll interval while waiting. Default 20 ms. */
  retryMs?: number;
};

/**
 * Run `run` while holding an advisory cross-process lock file.
 *
 * Callers that read, decide and write must do all three inside the callback:
 * the lock is what makes that sequence a single step for every other AT Series
 * process on the machine. The parent directory must already exist.
 */
export async function withFileLock<T>(
  lockPath: string,
  run: () => Promise<T>,
  options?: FileLockOptions
): Promise<T> {
  await acquireLock(lockPath, options);
  try {
    return await run();
  } finally {
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

async function acquireLock(
  lockPath: string,
  options?: FileLockOptions
): Promise<void> {
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options?.retryMs ?? DEFAULT_RETRY_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      // 'wx' fails with EEXIST if the file is already there, and that check is
      // atomic, which is what makes this usable across processes.
      const handle = await fs.open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, acquiredAt: Date.now() })
        );
      } finally {
        await handle.close();
      }
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }

    if (await stealIfStale(lockPath, staleMs)) {
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for the lock at ${lockPath}`
      );
    }
    await delay(retryMs);
  }
}

/**
 * Renaming the lock away is the atomic part: whichever caller wins the rename
 * removes it, and everyone else sees ENOENT and loops back to a plain create.
 */
async function stealIfStale(
  lockPath: string,
  staleMs: number
): Promise<boolean> {
  const acquiredAt = await readLockAcquiredAt(lockPath);
  if (acquiredAt !== undefined && Date.now() - acquiredAt <= staleMs) {
    return false;
  }

  const graveyard = `${lockPath}.${process.pid}.${crypto
    .randomBytes(6)
    .toString('hex')}.stale`;
  try {
    await fs.rename(lockPath, graveyard);
  } catch {
    return false;
  }
  await fs.rm(graveyard, { force: true }).catch(() => undefined);
  return true;
}

/** `undefined` for a missing, unreadable or malformed lock, all of which are stale. */
async function readLockAcquiredAt(
  lockPath: string
): Promise<number | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const acquiredAt = (parsed as { acquiredAt?: unknown }).acquiredAt;
  return typeof acquiredAt === 'number' && Number.isFinite(acquiredAt)
    ? acquiredAt
    : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
