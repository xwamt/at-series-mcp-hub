import {
  AT_SERIES_HOST_APP_ENV,
  AT_SERIES_TOOL_DISCOVERY_ENV,
  AT_SERIES_TOOL_DISCOVERY_THRESHOLD_ENV,
  AT_SERIES_TOOL_SELECTION_IDLE_MS_ENV,
  AT_SERIES_TOOL_SELECTION_MAX_CALLS_ENV,
  DEFAULT_TOOL_DISCOVERY_THRESHOLD,
  HUB_BUILTIN_TOOL_NAMES,
  MCP_SERVER_DISPLAY_NAME,
  type HostApp,
  type ToolCatalogEntry
} from '../protocol/index';
import { normalizeMcpPath } from './migrate';

/** Installer-written progressive discovery defaults (JSON/YAML env values are strings). */
export const INSTALLER_TOOL_DISCOVERY_DEFAULT = 'auto';
export const INSTALLER_TOOL_DISCOVERY_THRESHOLD_DEFAULT = String(
  DEFAULT_TOOL_DISCOVERY_THRESHOLD
);
/** `0` disables idle auto-clear — Cursor workaround for tools/list gate after select. */
export const INSTALLER_TOOL_SELECTION_IDLE_MS_DEFAULT = '0';
export const INSTALLER_TOOL_SELECTION_MAX_CALLS_DEFAULT = '0';

export type AtSeriesMcpServerEnv = {
  [AT_SERIES_HOST_APP_ENV]: string;
  [AT_SERIES_TOOL_DISCOVERY_ENV]: string;
  [AT_SERIES_TOOL_DISCOVERY_THRESHOLD_ENV]: string;
  [AT_SERIES_TOOL_SELECTION_IDLE_MS_ENV]: string;
  [AT_SERIES_TOOL_SELECTION_MAX_CALLS_ENV]: string;
};

export type AtSeriesMcpServerConfig = {
  command: 'node';
  args: [string];
  env: AtSeriesMcpServerEnv;
  autoApprove: string[];
};

export function buildInstallerAtSeriesEnv(hostApp: HostApp): AtSeriesMcpServerEnv {
  return {
    [AT_SERIES_HOST_APP_ENV]: String(hostApp),
    [AT_SERIES_TOOL_DISCOVERY_ENV]: INSTALLER_TOOL_DISCOVERY_DEFAULT,
    [AT_SERIES_TOOL_DISCOVERY_THRESHOLD_ENV]:
      INSTALLER_TOOL_DISCOVERY_THRESHOLD_DEFAULT,
    [AT_SERIES_TOOL_SELECTION_IDLE_MS_ENV]:
      INSTALLER_TOOL_SELECTION_IDLE_MS_DEFAULT,
    [AT_SERIES_TOOL_SELECTION_MAX_CALLS_ENV]:
      INSTALLER_TOOL_SELECTION_MAX_CALLS_DEFAULT
  };
}

/**
 * Canonical `AT Series` MCP server entry for IDE installers.
 * autoApprove is Hub meta-tools only. `registryTools` is ignored (kept for call-site compat).
 */
export function buildAtSeriesMcpServerConfig(input: {
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  /** @deprecated Ignored — installer no longer auto-approves business tools. */
  registryTools?: ToolCatalogEntry[];
}): AtSeriesMcpServerConfig {
  void input.registryTools;
  return {
    command: 'node',
    args: [normalizeMcpPath(input.hubJsAbsolutePath)],
    env: buildInstallerAtSeriesEnv(input.hostApp),
    autoApprove: [...HUB_BUILTIN_TOOL_NAMES]
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
  for (const [key, value] of Object.entries(desired.env)) {
    if (env[key] !== value) {
      return false;
    }
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
