import os from 'node:os';
import path from 'node:path';
import {
  AT_SERIES_ROOT_DIRNAME,
  AT_SERIES_BRIDGES_DIRNAME,
  AT_SERIES_MCP_DIRNAME,
  AT_SERIES_HUB_FILENAME,
  AT_SERIES_HUB_VERSION_FILENAME,
  REGISTRY_PATH_SEGMENT_PATTERN
} from './index';

/**
 * Plugins pass these straight through from `vscode.env.appName` or a generated
 * id, so an unvalidated value lands wherever it points: `bridgeId` of
 * `../../../.cursor/mcp` would make `publish()` overwrite the user's MCP
 * config. Reject anything that is not a single path segment.
 */
function assertPathSegment(field: 'hostApp' | 'bridgeId', value: string): void {
  if (typeof value !== 'string' || !REGISTRY_PATH_SEGMENT_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${field} ${JSON.stringify(value)}: must match ${REGISTRY_PATH_SEGMENT_PATTERN.source}`
    );
  }
}

export function atSeriesRootDir(home = os.homedir()): string {
  return path.join(home, AT_SERIES_ROOT_DIRNAME);
}

export function bridgesDirForHostApp(
  hostApp: string,
  home = os.homedir()
): string {
  assertPathSegment('hostApp', hostApp);
  return path.join(atSeriesRootDir(home), AT_SERIES_BRIDGES_DIRNAME, hostApp);
}

export function bridgeRecordPath(
  hostApp: string,
  bridgeId: string,
  home = os.homedir()
): string {
  assertPathSegment('bridgeId', bridgeId);
  return path.join(bridgesDirForHostApp(hostApp, home), `${bridgeId}.json`);
}

export function mcpDir(home = os.homedir()): string {
  return path.join(atSeriesRootDir(home), AT_SERIES_MCP_DIRNAME);
}

export function hubJsPath(home = os.homedir()): string {
  return path.join(mcpDir(home), AT_SERIES_HUB_FILENAME);
}

export function hubVersionPath(home = os.homedir()): string {
  return path.join(mcpDir(home), AT_SERIES_HUB_VERSION_FILENAME);
}
