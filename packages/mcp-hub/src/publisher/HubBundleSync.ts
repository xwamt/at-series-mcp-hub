import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { atomicWriteFile, ensureDir } from '../fs/atomicWrite';
import {
  AT_SERIES_HUB_PROTOCOL_VERSION,
  type HubVersionRecord
} from '../protocol/index';
import { hubJsPath, hubVersionPath, mcpDir } from '../protocol/paths';

const LOCK_FILENAME = '.hub-sync.lock';
/** Beyond this the holder is presumed dead, otherwise one crash wedges every plugin. */
const LOCK_STALE_MS = 30_000;
const LOCK_ACQUIRE_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 20;

export async function syncHubBundle(input: {
  version: string;
  bundlePath: string;
  pluginId: string;
  pluginVersion: string;
  home?: string;
}): Promise<{ updated: boolean; activeVersion: string }> {
  if (!semver.valid(input.version)) {
    throw new Error(`invalid hub semver: ${input.version}`);
  }

  const home = input.home ?? os.homedir();
  const dir = mcpDir(home);
  const targetHub = hubJsPath(home);
  const targetMeta = hubVersionPath(home);

  const candidateBytes = await fs.readFile(input.bundlePath);
  const candidateSha = crypto
    .createHash('sha256')
    .update(candidateBytes)
    .digest('hex');

  await ensureDir(dir);

  // Read, decide and write under one lock. Three plugins activate within
  // milliseconds of each other when an IDE starts; without mutual exclusion
  // they all observe the same pre-election state and the last writer wins
  // regardless of semver, which is exactly what §8.6 forbids.
  return withHubSyncLock(dir, async () => {
    const active = await readActiveVersion(targetMeta);
    // The election may only defer to the recorded metadata while that metadata
    // still describes the file the IDE actually executes. Skipping this check
    // turns syncHubBundle into a shield for a tampered hub.js: an attacker who
    // swaps the bundle and leaves hub-version.json alone would otherwise see
    // every plugin activation decline to repair it.
    if (active && (await onDiskSha256(targetHub)) === active.bundleSha256) {
      if (semver.gt(active.version, input.version)) {
        return { updated: false, activeVersion: active.version };
      }
      if (
        semver.eq(active.version, input.version) &&
        active.bundleSha256 === candidateSha
      ) {
        return { updated: false, activeVersion: active.version };
      }
    }

    await atomicWriteFile(targetHub, candidateBytes);

    const meta: HubVersionRecord = {
      version: input.version,
      protocolVersion: AT_SERIES_HUB_PROTOCOL_VERSION,
      writtenByPluginId: input.pluginId,
      writtenByPluginVersion: input.pluginVersion,
      writtenAt: Date.now(),
      bundleSha256: candidateSha
    };
    try {
      await atomicWriteFile(targetMeta, JSON.stringify(meta, null, 2));
    } catch (err) {
      // hub.js is already the new bundle, so the surviving record would claim a
      // hash nothing on disk has. Drop it and let the next sync rebuild both.
      await fs.rm(targetMeta, { force: true }).catch(() => undefined);
      throw err;
    }

    return { updated: true, activeVersion: input.version };
  });
}

async function withHubSyncLock<T>(
  dir: string,
  run: () => Promise<T>
): Promise<T> {
  const lockPath = path.join(dir, LOCK_FILENAME);
  await acquireLock(lockPath);
  try {
    return await run();
  } finally {
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

async function acquireLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
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

    if (await stealIfStale(lockPath)) {
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${LOCK_ACQUIRE_TIMEOUT_MS}ms waiting for the hub sync lock at ${lockPath}`
      );
    }
    await delay(LOCK_RETRY_MS);
  }
}

/**
 * Renaming the lock away is the atomic part: whichever caller wins the rename
 * removes it, and everyone else sees ENOENT and loops back to a plain create.
 */
async function stealIfStale(lockPath: string): Promise<boolean> {
  const acquiredAt = await readLockAcquiredAt(lockPath);
  if (acquiredAt !== undefined && Date.now() - acquiredAt <= LOCK_STALE_MS) {
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

/** `undefined` when hub.js is absent, which can never equal a recorded hash. */
async function onDiskSha256(hubPath: string): Promise<string | undefined> {
  try {
    const bytes = await fs.readFile(hubPath);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

/**
 * Unreadable or structurally invalid metadata is reported as "no active hub"
 * so the caller falls through to the first-write path and heals it. Throwing
 * here would wedge hub sync permanently for every plugin on the machine.
 */
async function readActiveVersion(
  metaPath: string
): Promise<HubVersionRecord | undefined> {
  let text: string;
  try {
    text = await fs.readFile(metaPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return asHubVersionRecord(parsed);
}

function asHubVersionRecord(value: unknown): HubVersionRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Partial<Record<keyof HubVersionRecord, unknown>>;
  // Only the two fields the election actually reads are required; the rest are
  // provenance and must not be able to invalidate an otherwise usable record.
  if (
    typeof candidate.version !== 'string' ||
    semver.valid(candidate.version) === null ||
    typeof candidate.bundleSha256 !== 'string' ||
    candidate.bundleSha256.length === 0
  ) {
    return undefined;
  }

  return {
    version: candidate.version,
    protocolVersion:
      typeof candidate.protocolVersion === 'number'
        ? candidate.protocolVersion
        : AT_SERIES_HUB_PROTOCOL_VERSION,
    writtenByPluginId:
      typeof candidate.writtenByPluginId === 'string'
        ? candidate.writtenByPluginId
        : 'unknown',
    writtenByPluginVersion:
      typeof candidate.writtenByPluginVersion === 'string'
        ? candidate.writtenByPluginVersion
        : 'unknown',
    writtenAt:
      typeof candidate.writtenAt === 'number' ? candidate.writtenAt : 0,
    bundleSha256: candidate.bundleSha256
  };
}
