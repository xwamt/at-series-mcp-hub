import { describe, expect, it } from 'vitest';
import { detectHostApp, slugifyHostAppId } from '../src/protocol/detectHostApp';

describe('detectHostApp', () => {
  it('prefers ~/.{product}/extensions over other signals', () => {
    expect(
      detectHostApp({
        extensionPath: 'C:/Users/alan/.kiro/extensions/local.at-terminal-mcp-0.2.10',
        appName: 'Cursor'
      })
    ).toBe('kiro');
    expect(
      detectHostApp({
        extensionPath: 'C:/Users/alan/.cursor/extensions/local.at-terminal-mcp-0.2.10'
      })
    ).toBe('cursor');
  });

  it('derives hostApp from unknown VS Code fork extension dirs', () => {
    expect(
      detectHostApp({
        extensionPath:
          'C:/Users/alan/.joycode-editor/extensions/local.at-jumpserver-terminal-0.1.5',
        appName: 'JoyCode',
        uriScheme: 'vscode'
      })
    ).toBe('joycode-editor');
    expect(
      detectHostApp({
        extensionPath: 'C:/Users/alan/.antigravity/extensions/local.at-grafana-0.1.0'
      })
    ).toBe('antigravity');
  });

  it('detects canonical hosts from appName / uriScheme / appRoot', () => {
    expect(detectHostApp({ appName: 'Kiro' })).toBe('kiro');
    expect(detectHostApp({ appName: 'Cursor', uriScheme: 'cursor' })).toBe('cursor');
    expect(detectHostApp({ appName: 'Visual Studio Code', uriScheme: 'vscode' })).toBe(
      'vscode'
    );
    expect(detectHostApp({ uriScheme: 'vscode' })).toBe('vscode');
    expect(detectHostApp({ appName: 'Qoder' })).toBe('qoder');
    expect(detectHostApp({ appRoot: 'C:/Program Files/Windsurf' })).toBe('windsurf');
    expect(detectHostApp({ uriScheme: 'continue' })).toBe('continue');
  });

  it('slugifies unrecognized appName instead of collapsing to unknown', () => {
    expect(detectHostApp({ appName: 'Some Other IDE' })).toBe('some-other-ide');
    expect(detectHostApp({ uriScheme: 'joycode' })).toBe('joycode');
  });

  it('returns unknown only when no usable signal exists', () => {
    expect(detectHostApp({})).toBe('unknown');
    expect(detectHostApp({ appName: '   ' })).toBe('unknown');
  });
});

describe('slugifyHostAppId', () => {
  it('normalizes product ids for directory names', () => {
    expect(slugifyHostAppId('JoyCode Editor')).toBe('joycode-editor');
    expect(slugifyHostAppId('...')).toBeUndefined();
  });
});
