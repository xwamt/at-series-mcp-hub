import os from 'node:os';
import path from 'node:path';
import {
  MCP_SERVER_DISPLAY_NAME,
  type HostApp,
  type ToolCatalogEntry
} from '../protocol/index';
import {
  buildAtSeriesMcpServerConfig,
  isSameAtSeriesMcpServerConfig
} from './serverConfig';
import {
  readJsonConfigDocument,
  withMcpConfigLock,
  writeJsonConfigDocument
} from './jsonConfigFile';
import { stripLegacyAtMcpServers } from './migrate';

export function cursorMcpConfigPath(home = os.homedir()): string {
  return path.join(home, '.cursor', 'mcp.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMcpServers(config: Record<string, unknown>): Record<string, unknown> {
  return isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
}

function sameMcpServerKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) {
    return false;
  }
  return ak.every((k, i) => k === bk[i]);
}

/**
 * Ensure Cursor-style JSON MCP config (`~/.cursor/mcp.json`).
 * Shared by Cursor and Kiro (same document shape).
 */
export async function ensureJsonIdeMcpConfig(input: {
  configPath: string;
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  registryTools?: ToolCatalogEntry[];
}): Promise<{ updated: boolean }> {
  return withMcpConfigLock(input.configPath, async () => {
    const document = await readJsonConfigDocument(input.configPath);
    const before = readMcpServers(document.config);
    const stripped = stripLegacyAtMcpServers(before);
    const desired = buildAtSeriesMcpServerConfig({
      hostApp: input.hostApp,
      hubJsAbsolutePath: input.hubJsAbsolutePath,
      registryTools: input.registryTools
    });

    const existing = stripped[MCP_SERVER_DISPLAY_NAME];
    const legacyRemoved = !sameMcpServerKeys(before, stripped);
    const entrySame = isSameAtSeriesMcpServerConfig(existing, desired);

    if (
      !legacyRemoved &&
      entrySame &&
      Object.prototype.hasOwnProperty.call(stripped, MCP_SERVER_DISPLAY_NAME)
    ) {
      return { updated: false };
    }

    const nextServers: Record<string, unknown> = {
      ...stripped,
      [MCP_SERVER_DISPLAY_NAME]: desired
    };
    const nextConfig: Record<string, unknown> = {
      ...document.config,
      mcpServers: nextServers
    };

    await writeJsonConfigDocument({
      configPath: input.configPath,
      config: nextConfig,
      existed: document.raw !== undefined
    });
    return { updated: true };
  });
}

export async function uninstallJsonIdeMcpConfig(input: {
  configPath: string;
}): Promise<{ removed: boolean }> {
  return withMcpConfigLock(input.configPath, async () => {
    const document = await readJsonConfigDocument(input.configPath);
    const servers = readMcpServers(document.config);
    if (
      !Object.prototype.hasOwnProperty.call(servers, MCP_SERVER_DISPLAY_NAME)
    ) {
      return { removed: false };
    }
    delete servers[MCP_SERVER_DISPLAY_NAME];
    const nextConfig: Record<string, unknown> = {
      ...document.config,
      mcpServers: servers
    };

    await writeJsonConfigDocument({
      configPath: input.configPath,
      config: nextConfig,
      existed: document.raw !== undefined
    });
    return { removed: true };
  });
}

export async function ensureCursorMcpConfig(input: {
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  home?: string;
  registryTools?: ToolCatalogEntry[];
}): Promise<{ updated: boolean }> {
  return ensureJsonIdeMcpConfig({
    configPath: cursorMcpConfigPath(input.home),
    hostApp: input.hostApp,
    hubJsAbsolutePath: input.hubJsAbsolutePath,
    registryTools: input.registryTools
  });
}

export async function uninstallCursorMcpConfig(input: {
  home?: string;
}): Promise<{ removed: boolean }> {
  return uninstallJsonIdeMcpConfig({
    configPath: cursorMcpConfigPath(input.home)
  });
}
