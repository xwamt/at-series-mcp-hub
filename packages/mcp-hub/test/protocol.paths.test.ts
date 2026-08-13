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

const VALID_SLUGS = [
  'cursor',
  'vscode',
  'at-terminal',
  'joycode-editor',
  '550e8400-e29b-41d4-a716-446655440000',
  'bridge.1_a',
  '0',
  'a'.repeat(64)
];

const INVALID_SLUGS = [
  '',
  '..',
  '.',
  '../evil',
  '../../../.cursor/mcp',
  'a/b',
  'a\\b',
  'has space',
  'Cursor',
  'CAFEBABE-0000-4000-8000-000000000000',
  '.hidden',
  '-leading',
  '_leading',
  'a'.repeat(65),
  'nul\u0000byte',
  'caf\u00e9'
];

describe('bridgesDirForHostApp hostApp assertion', () => {
  it.each(VALID_SLUGS)('accepts hostApp %p', (hostApp) => {
    expect(bridgesDirForHostApp(hostApp, '/home/u')).toBe(
      path.join('/home/u', '.at-series', 'bridges', hostApp)
    );
  });

  it.each(INVALID_SLUGS)('rejects hostApp %p', (hostApp) => {
    expect(() => bridgesDirForHostApp(hostApp, '/home/u')).toThrow(/hostApp/);
  });
});

describe('bridgeRecordPath bridgeId assertion', () => {
  it.each(VALID_SLUGS)('accepts bridgeId %p', (bridgeId) => {
    expect(bridgeRecordPath('cursor', bridgeId, '/home/u')).toBe(
      path.join('/home/u', '.at-series', 'bridges', 'cursor', `${bridgeId}.json`)
    );
  });

  it.each(INVALID_SLUGS)('rejects bridgeId %p', (bridgeId) => {
    expect(() => bridgeRecordPath('cursor', bridgeId, '/home/u')).toThrow(/bridgeId/);
  });

  it('refuses to resolve a traversal bridgeId onto the user MCP config', () => {
    const wouldBe = path.join(
      '/home/u',
      '.at-series',
      'bridges',
      'cursor',
      '../../../.cursor/mcp.json'
    );
    expect(wouldBe).toBe(path.join('/home/u', '.cursor', 'mcp.json'));
    expect(() =>
      bridgeRecordPath('cursor', '../../../.cursor/mcp', '/home/u')
    ).toThrow(/bridgeId/);
  });

  it('still validates hostApp when resolving a record path', () => {
    expect(() => bridgeRecordPath('..', 'bridge-a', '/home/u')).toThrow(/hostApp/);
  });
});
