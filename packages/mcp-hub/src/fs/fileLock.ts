import crypto from 'node:crypto';
import fs from 'node:fs/promises';

/** Beyond this the holder is presumed dead, otherwise one crash wedges every plugin. */
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_MS = 20;
/**
 * Creation ('wx' open) and the content write are two syscalls, so a lock file
 * is briefly empty. Unparseable content younger than this is "still being
 * written", not "left over from a crash" — stealing inside that window hands
 * the lock to two holders at once. Past the grace it is stale as usual.
 */
const MALFORMED_GRACE_MS = 250;

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
 *
 * A lock is reclaimable when its `acquiredAt` is past the staleness threshold,
 * its contents are malformed — or, per protocol v1 §8.6, its recorded `pid` is
 * a dead process even though `acquiredAt` is fresh. A holder that crashes
 * right after acquiring would otherwise wedge every waiter for the full
 * staleness window on each acquisition.
 */
async function stealIfStale(
  lockPath: string,
  staleMs: number
): Promise<boolean> {
  const info = await readLockInfo(lockPath);
  if (info === undefined) {
    // Unreadable/unparseable: either a crash artefact (steal) or a lock whose
    // creator has not finished writing the content yet (do not steal).
    if (await isYoungerThan(lockPath, MALFORMED_GRACE_MS)) {
      return false;
    }
  } else {
    const fresh =
      info.acquiredAt !== undefined && Date.now() - info.acquiredAt <= staleMs;
    if (fresh && isLockHolderAlive(info.pid)) {
      return false;
    }
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

/**
 * Signal-0 liveness probe. `ESRCH` means dead; `EPERM` means the pid exists
 * but is owned by someone else, which is alive for our purposes. A missing or
 * non-positive pid is treated as dead rather than probed: `kill(0)` /
 * `kill(-n)` would signal a whole process group, never a single holder.
 */
function isLockHolderAlive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** False when the file is already gone — the caller loops back to a create. */
async function isYoungerThan(target: string, ageMs: number): Promise<boolean> {
  try {
    const stat = await fs.stat(target);
    return Date.now() - stat.mtimeMs < ageMs;
  } catch {
    return false;
  }
}

type LockInfo = {
  acquiredAt?: number;
  pid?: number;
};

/** `undefined` for a missing, unreadable or malformed lock, all of which are stale. */
async function readLockInfo(lockPath: string): Promise<LockInfo | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const { acquiredAt, pid } = parsed as { acquiredAt?: unknown; pid?: unknown };
  return {
    acquiredAt:
      typeof acquiredAt === 'number' && Number.isFinite(acquiredAt)
        ? acquiredAt
        : undefined,
    pid: typeof pid === 'number' && Number.isFinite(pid) ? pid : undefined
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
