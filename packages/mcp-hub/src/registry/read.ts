import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AT_SERIES_BRIDGE_PROTOCOL_VERSION,
  isBridgeEndpointPath,
  isBridgePort,
  PLUGIN_ID_PATTERN,
  TOOL_NAME_PATTERN,
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
 * `endpoints` is the only field a record can use to steer where the Hub sends
 * an authenticated POST. Anything but a conformant path override invalidates
 * the whole record rather than being silently dropped, so a writer cannot
 * smuggle a target past the Hub by making the rest of the record look healthy.
 */
function hasValidEndpoints(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const endpoints = value as Record<string, unknown>;
  for (const key of ['health', 'tools', 'invoke'] as const) {
    if (endpoints[key] !== undefined && !isBridgeEndpointPath(endpoints[key])) {
      return false;
    }
  }
  return true;
}

/** Catalog entries must at least carry a protocol §4.4 conformant name. */
function hasValidToolNames(tools: unknown[]): boolean {
  return tools.every((tool) => {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
      return false;
    }
    const name = (tool as Record<string, unknown>).name;
    return typeof name === 'string' && TOOL_NAME_PATTERN.test(name);
  });
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
  if (!isNonEmptyString(raw.pluginId) || !PLUGIN_ID_PATTERN.test(raw.pluginId)) {
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
  if (!isBridgePort(raw.port)) {
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
  if (!hasValidEndpoints(raw.endpoints)) {
    return null;
  }
  if (!Array.isArray(raw.tools) || !hasValidToolNames(raw.tools)) {
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
