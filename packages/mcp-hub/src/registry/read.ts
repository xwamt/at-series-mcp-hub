import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AT_SERIES_BRIDGE_PROTOCOL_VERSION,
  type BridgeRegistryRecord,
  type HostApp
} from '../protocol/index';
import { bridgesDirForHostApp } from '../protocol/paths';

export interface ListBridgeRecordsOptions {
  hostApp: HostApp | string;
  home?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Parse and validate a registry JSON value per protocol §5.2.
 * Returns null when the value is not a usable v1 BridgeRegistryRecord.
 */
export function parseBridgeRegistryRecord(
  value: unknown,
  expectedHostApp?: string
): BridgeRegistryRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  if (raw.protocolVersion !== AT_SERIES_BRIDGE_PROTOCOL_VERSION) {
    return null;
  }
  if (!isNonEmptyString(raw.bridgeId)) {
    return null;
  }
  if (!isNonEmptyString(raw.pluginId)) {
    return null;
  }
  if (!isNonEmptyString(raw.pluginDisplayName)) {
    return null;
  }
  if (!isNonEmptyString(raw.pluginVersion)) {
    return null;
  }
  if (!isNonEmptyString(raw.hostApp)) {
    return null;
  }
  if (expectedHostApp !== undefined && raw.hostApp !== expectedHostApp) {
    return null;
  }
  if (!isFiniteNumber(raw.port)) {
    return null;
  }
  if (!isNonEmptyString(raw.token)) {
    return null;
  }
  if (!isFiniteNumber(raw.pid)) {
    return null;
  }
  if (!isFiniteNumber(raw.updatedAt)) {
    return null;
  }
  if (!Array.isArray(raw.tools)) {
    return null;
  }

  return raw as unknown as BridgeRegistryRecord;
}

/**
 * List validated Bridge registry records for a single hostApp.
 * Missing directory → []. Invalid / mismatched files are skipped.
 */
export async function listBridgeRecords(
  options: ListBridgeRecordsOptions
): Promise<BridgeRegistryRecord[]> {
  const { hostApp, home } = options;
  const dir = bridgesDirForHostApp(hostApp, home);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const records: BridgeRegistryRecord[] = [];

  for (const name of entries) {
    if (path.extname(name).toLowerCase() !== '.json') {
      continue;
    }

    const filePath = path.join(dir, name);
    let text: string;
    try {
      text = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    const record = parseBridgeRegistryRecord(parsed, hostApp);
    if (record) {
      records.push(record);
    }
  }

  return records;
}
