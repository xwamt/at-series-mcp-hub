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
  if (active) {
    if (!semver.valid(active.version)) {
      throw new Error(`invalid active hub semver: ${active.version}`);
    }
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

async function readActiveVersion(
  metaPath: string
): Promise<HubVersionRecord | undefined> {
  try {
    const text = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(text) as HubVersionRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}
