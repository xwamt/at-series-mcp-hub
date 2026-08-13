import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Owner-only, because these files carry bridge tokens and executable code. */
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Write via a temp file in the same directory, then rename. The temp file is
 * created with the final mode so the content never exists at a laxer
 * permission, not even briefly.
 *
 * `chmod` is best-effort: it is a no-op on Windows and on some filesystems.
 */
export async function atomicWriteFile(
  filePath: string,
  content: Buffer | string
): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  // pid + timestamp alone is not unique: concurrent writers in one process land
  // on the same millisecond, share a temp file and produce torn content.
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${crypto
      .randomBytes(8)
      .toString('hex')}.tmp`
  );

  try {
    await fs.writeFile(tmpPath, content, { mode: FILE_MODE });
    await tryChmod(tmpPath, FILE_MODE);
    await fs.rename(tmpPath, filePath);
    await tryChmod(filePath, FILE_MODE);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** Create every missing level at 0700; `recursive` only applies mode to the leaf. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
  await tryChmod(dir, DIR_MODE);
}

export async function tryChmod(target: string, mode: number): Promise<void> {
  try {
    await fs.chmod(target, mode);
  } catch {
    // Windows and some filesystems: best-effort.
  }
}
