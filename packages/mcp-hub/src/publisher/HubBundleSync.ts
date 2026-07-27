import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import {
  AT_SERIES_PROTOCOL_VERSION,
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

  await fs.mkdir(mcpDir(home), { recursive: true });
  await atomicWriteBytes(targetHub, candidateBytes);

  const meta: HubVersionRecord = {
    version: input.version,
    protocolVersion: AT_SERIES_PROTOCOL_VERSION,
    writtenByPluginId: input.pluginId,
    writtenByPluginVersion: input.pluginVersion,
    writtenAt: Date.now(),
    bundleSha256: candidateSha
  };
  await atomicWriteText(targetMeta, JSON.stringify(meta, null, 2));

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

async function atomicWriteBytes(
  filePath: string,
  content: Buffer
): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await fs.writeFile(tmpPath, content);
  await tryChmod(tmpPath, 0o600);
  await fs.rename(tmpPath, filePath);
  await tryChmod(filePath, 0o600);
}

async function atomicWriteText(
  filePath: string,
  content: string
): Promise<void> {
  await atomicWriteBytes(filePath, Buffer.from(content, 'utf8'));
}

async function tryChmod(target: string, mode: number): Promise<void> {
  try {
    await fs.chmod(target, mode);
  } catch {
    // Windows and some filesystems: best-effort
  }
}
