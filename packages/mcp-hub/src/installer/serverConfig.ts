import {
  AT_SERIES_HOST_APP_ENV,
  MCP_SERVER_DISPLAY_NAME,
  type HostApp,
  type ToolCatalogEntry
} from '../protocol/index';
import { defaultAutoApproveToolNames } from './autoApprove';
import { normalizeMcpPath } from './migrate';

export type AtSeriesMcpServerConfig = {
  command: 'node';
  args: [string];
  env: { [AT_SERIES_HOST_APP_ENV]: string };
  autoApprove: string[];
};

export function buildAtSeriesMcpServerConfig(input: {
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  registryTools?: ToolCatalogEntry[];
}): AtSeriesMcpServerConfig {
  return {
    command: 'node',
    args: [normalizeMcpPath(input.hubJsAbsolutePath)],
    env: { [AT_SERIES_HOST_APP_ENV]: String(input.hostApp) },
    autoApprove: defaultAutoApproveToolNames({
      registryTools: input.registryTools ?? []
    })
  };
}

export function isSameAtSeriesMcpServerConfig(
  existing: unknown,
  desired: AtSeriesMcpServerConfig
): boolean {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return false;
  }
  const rec = existing as Record<string, unknown>;
  if (rec.command !== desired.command) {
    return false;
  }
  if (
    !Array.isArray(rec.args) ||
    rec.args.length !== 1 ||
    rec.args[0] !== desired.args[0]
  ) {
    return false;
  }
  if (!rec.env || typeof rec.env !== 'object' || Array.isArray(rec.env)) {
    return false;
  }
  const env = rec.env as Record<string, unknown>;
  if (env[AT_SERIES_HOST_APP_ENV] !== desired.env[AT_SERIES_HOST_APP_ENV]) {
    return false;
  }
  if (!Array.isArray(rec.autoApprove)) {
    return false;
  }
  const autoApprove = rec.autoApprove as unknown[];
  if (autoApprove.length !== desired.autoApprove.length) {
    return false;
  }
  return desired.autoApprove.every((name, i) => autoApprove[i] === name);
}

export { MCP_SERVER_DISPLAY_NAME };
