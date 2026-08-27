import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Owner-only, because these files carry bridge tokens and executable code. */
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Windows antivirus / indexers briefly hold freshly written files open, which
 * surfaces as EPERM/EBUSY (occasionally EACCES) on the rename. Those clear in
 * milliseconds, so two short retries turn a spurious publish failure into a
 * non-event. Anything else (EISDIR, EXDEV, ENOENT…) is a real error and is
 * rethrown immediately.
 */
const RENAME_RETRY_DELAYS_MS = [10, 30];
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (
        attempt >= RENAME_RETRY_DELAYS_MS.length ||
        code === undefined ||
        !RETRYABLE_RENAME_CODES.has(code)
      ) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt])
      );
    }
  }
}

/**
 * `'preserve'` keeps whatever the target already has and falls back to the
 * process umask when it does not exist yet. Use it for files we do not own —
 * `~/.cursor/mcp.json` is the user's, and re-permissioning it on their behalf
 * is a side effect they never asked for.
 */
export type AtomicWriteMode = number | 'preserve';

export type AtomicWriteOptions = {
  /** Defaults to 0600 for files, with 0700 on directories we create. */
  mode?: AtomicWriteMode;
};

/**
 * Write via a temp file in the same directory, then rename. The temp file is
 * created with the final mode so the content never exists at a laxer
 * permission, not even briefly.
 *
 * `chmod` is best-effort: it is a no-op on Windows and on some filesystems.
 */
export async function atomicWriteFile(
  filePath: string,
  content: Buffer | string,
  options?: AtomicWriteOptions
): Promise<void> {
  const requested = options?.mode ?? FILE_MODE;
  const preserve = requested === 'preserve';
  // Renaming onto a symlink replaces the link with a regular file, which for a
  // config symlinked into a dotfiles repo silently orphans the tracked copy.
  const target = await resolveLink(filePath);
  await ensureDir(path.dirname(target), {
    mode: preserve ? 'preserve' : DIR_MODE
  });

  const mode = preserve ? await currentMode(target) : requested;

  // pid + timestamp alone is not unique: concurrent writers in one process land
  // on the same millisecond, share a temp file and produce torn content.
  const tmpPath = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto
      .randomBytes(8)
      .toString('hex')}.tmp`
  );

  try {
    await fs.writeFile(tmpPath, content, mode === undefined ? {} : { mode });
    if (mode !== undefined) {
      await tryChmod(tmpPath, mode);
    }
    await renameWithRetry(tmpPath, target);
    if (mode !== undefined) {
      await tryChmod(target, mode);
    }
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Snapshot a file we are about to rewrite, keeping only the *first* copy.
 *
 * A later snapshot would capture a file we ourselves produced, which is
 * worthless as a recovery point. Copying aside before the rename means a crash
 * mid-copy leaves an unpromoted temp file rather than a truncated backup that
 * would then never be refreshed. `copyFile` carries the source's permissions
 * over, so a config kept at 0600 does not get a world-readable twin.
 *
 * No-op when the source is missing or a backup already exists.
 */
export async function backupFileOnce(
  filePath: string,
  backupPath: string
): Promise<void> {
  if (await pathExists(backupPath)) {
    return;
  }
  if (!(await pathExists(filePath))) {
    return;
  }

  const tmpPath = `${backupPath}.${process.pid}.${crypto
    .randomBytes(8)
    .toString('hex')}.tmp`;
  try {
    await fs.copyFile(filePath, tmpPath);
    await fs.rename(tmpPath, backupPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export type EnsureDirOptions = {
  /** `'preserve'` leaves existing directories alone and creates at the umask. */
  mode?: number | 'preserve';
};

/** Create every missing level at 0700; `recursive` only applies mode to the leaf. */
export async function ensureDir(
  dir: string,
  options?: EnsureDirOptions
): Promise<void> {
  const mode = options?.mode ?? DIR_MODE;
  if (mode === 'preserve') {
    await fs.mkdir(dir, { recursive: true });
    return;
  }
  await fs.mkdir(dir, { recursive: true, mode });
  await tryChmod(dir, mode);
}

export async function tryChmod(target: string, mode: number): Promise<void> {
  try {
    await fs.chmod(target, mode);
  } catch {
    // Windows and some filesystems: best-effort.
  }
}

/** `undefined` when the file does not exist yet, meaning "use the umask". */
async function currentMode(filePath: string): Promise<number | undefined> {
  try {
    return (await fs.stat(filePath)).mode & 0o777;
  } catch {
    return undefined;
  }
}

/** Falls back to the given path when it does not exist or cannot be resolved. */
async function resolveLink(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return filePath;
  }
}
