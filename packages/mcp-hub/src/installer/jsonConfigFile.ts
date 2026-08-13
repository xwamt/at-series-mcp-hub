import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteFile, ensureDir } from '../fs/atomicWrite';
import { withFileLock } from '../fs/fileLock';

/** Snapshot of the config as it looked before AT Series first touched it. */
export function mcpConfigBackupPath(configPath: string): string {
  return `${configPath}.at-series.bak`;
}

/** Hidden sibling so an IDE scanning the directory does not mistake it for config. */
export function mcpConfigLockPath(configPath: string): string {
  return path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.at-series.lock`
  );
}

export type JsonConfigDocument = {
  config: Record<string, unknown>;
  /** Exact bytes on disk; absent when the file does not exist yet. */
  raw?: string;
};

/**
 * Serialise a read-modify-write on an IDE MCP config.
 *
 * All three AT Series plugins activate on IDE startup and all three repair the
 * same `mcpServers` map. Without this, each one reads the map, edits its own
 * copy, and the last writer silently reverts the others.
 */
export async function withMcpConfigLock<T>(
  configPath: string,
  run: () => Promise<T>
): Promise<T> {
  await ensureDir(path.dirname(configPath), { mode: 'preserve' });
  return withFileLock(mcpConfigLockPath(configPath), run);
}

export async function readJsonConfigDocument(
  configPath: string
): Promise<JsonConfigDocument> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { config: {} };
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(stripBom(raw));
  return { config: isRecord(parsed) ? parsed : {}, raw };
}

/**
 * Back the file up once, then replace it atomically.
 *
 * Callers must already hold {@link withMcpConfigLock}: the document handed in
 * here was derived from a read that must not be superseded before it lands.
 */
export async function writeJsonConfigDocument(input: {
  configPath: string;
  config: Record<string, unknown>;
  existed: boolean;
}): Promise<void> {
  if (input.existed) {
    await backupOnce(input.configPath);
  }
  await atomicWriteFile(
    input.configPath,
    `${JSON.stringify(input.config, null, 2)}\n`,
    { mode: 'preserve' }
  );
}

/**
 * Keep the *first* copy, which is the only one guaranteed to predate us. A
 * later rewrite that captured the file we ourselves produced would be worth
 * nothing as a recovery point.
 *
 * `copyFile` gives the backup the source's permissions, so a config kept at
 * 0600 does not get a world-readable twin.
 */
async function backupOnce(configPath: string): Promise<void> {
  const backupPath = mcpConfigBackupPath(configPath);
  if (await exists(backupPath)) {
    return;
  }

  // Copy aside first: a crash mid-copy leaves an unpromoted temp file rather
  // than a truncated backup that would then never be refreshed.
  const tmpPath = `${backupPath}.${process.pid}.${crypto
    .randomBytes(8)
    .toString('hex')}.tmp`;
  try {
    await fs.copyFile(configPath, tmpPath);
    await fs.rename(tmpPath, backupPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}
