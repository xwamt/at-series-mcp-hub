import os from 'node:os';
import path from 'node:path';
import {
  AT_SERIES_ROOT_DIRNAME,
  AT_SERIES_BRIDGES_DIRNAME,
  AT_SERIES_MCP_DIRNAME,
  AT_SERIES_HUB_FILENAME,
  AT_SERIES_HUB_VERSION_FILENAME
} from './index';

export function atSeriesRootDir(home = os.homedir()): string {
  return path.join(home, AT_SERIES_ROOT_DIRNAME);
}

export function bridgesDirForHostApp(
  hostApp: string,
  home = os.homedir()
): string {
  return path.join(atSeriesRootDir(home), AT_SERIES_BRIDGES_DIRNAME, hostApp);
}

export function bridgeRecordPath(
  hostApp: string,
  bridgeId: string,
  home = os.homedir()
): string {
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
