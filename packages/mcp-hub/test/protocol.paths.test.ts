import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  atSeriesRootDir,
  bridgesDirForHostApp,
  bridgeRecordPath,
  hubJsPath,
  hubVersionPath
} from '../src/protocol/paths';

describe('paths', () => {
  it('roots under homedir/.at-series', () => {
    const root = atSeriesRootDir();
    expect(root).toBe(path.join(os.homedir(), '.at-series'));
  });

  it('scopes bridges by hostApp and bridgeId', () => {
    expect(bridgesDirForHostApp('cursor')).toBe(
      path.join(os.homedir(), '.at-series', 'bridges', 'cursor')
    );
    expect(bridgeRecordPath('cursor', 'abc')).toBe(
      path.join(os.homedir(), '.at-series', 'bridges', 'cursor', 'abc.json')
    );
  });

  it('points hub artifacts under mcp/', () => {
    expect(hubJsPath()).toBe(path.join(os.homedir(), '.at-series', 'mcp', 'hub.js'));
    expect(hubVersionPath()).toBe(
      path.join(os.homedir(), '.at-series', 'mcp', 'hub-version.json')
    );
  });
});
