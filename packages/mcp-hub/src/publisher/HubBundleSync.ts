import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import semver from 'semver';
import { atomicWriteFile, ensureDir } from '../fs/atomicWrite';
import {
  AT_SERIES_HUB_PROTOCOL_VERSION,
  type HubVersionRecord
} from '../protocol/index';
import { hubJsPath, hubVersionPath, mcpDir } from '../protocol/paths';

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
  const targetHub = hubJsPath(home);
  const targetMeta = hubVersionPath(home);

  const candidateBytes = await fs.readFile(input.bundlePath);
  const candidateSha = crypto
    .createHash('sha256')
    .update(candidateBytes)
    .digest('hex');

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

  await ensureDir(mcpDir(home));
  await atomicWriteFile(targetHub, candidateBytes);

  const meta: HubVersionRecord = {
    version: input.version,
    protocolVersion: AT_SERIES_HUB_PROTOCOL_VERSION,
    writtenByPluginId: input.pluginId,
    writtenByPluginVersion: input.pluginVersion,
    writtenAt: Date.now(),
    bundleSha256: candidateSha
  };
  await atomicWriteFile(targetMeta, JSON.stringify(meta, null, 2));

  return { updated: true, activeVersion: input.version };
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
