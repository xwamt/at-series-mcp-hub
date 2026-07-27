import os from 'node:os';
import path from 'node:path';
import type { HostApp, ToolCatalogEntry } from '../protocol/index';
import {
  ensureJsonIdeMcpConfig,
  uninstallJsonIdeMcpConfig
} from './cursor';

export function kiroMcpConfigPath(home = os.homedir()): string {
  return path.join(home, '.kiro', 'settings', 'mcp.json');
}

export async function ensureKiroMcpConfig(input: {
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  home?: string;
  registryTools?: ToolCatalogEntry[];
}): Promise<{ updated: boolean }> {
  return ensureJsonIdeMcpConfig({
    configPath: kiroMcpConfigPath(input.home),
    hostApp: input.hostApp,
    hubJsAbsolutePath: input.hubJsAbsolutePath,
    registryTools: input.registryTools
  });
}

export async function uninstallKiroMcpConfig(input: {
  home?: string;
}): Promise<{ removed: boolean }> {
  return uninstallJsonIdeMcpConfig({
    configPath: kiroMcpConfigPath(input.home)
  });
}
