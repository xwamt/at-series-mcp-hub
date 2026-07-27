import { describe, it, expect } from 'vitest';
import { stripLegacyAtMcpServers } from '../src/installer/migrate';

describe('stripLegacyAtMcpServers', () => {
  it('removes AT Terminal and AT JumpServer Terminal, keeps third-party', () => {
    const result = stripLegacyAtMcpServers({
      'AT Terminal': {
        command: 'node',
        args: ['C:/ext/at-terminal/dist/mcp-server.js']
      },
      'AT JumpServer Terminal': {
        command: 'node',
        args: ['C:/ext/jumpserver/dist/mcp-server.js']
      },
      'other-server': {
        command: 'uvx',
        args: ['mcp-server-fetch']
      }
    });

    expect(result).toEqual({
      'other-server': {
        command: 'uvx',
        args: ['mcp-server-fetch']
      }
    });
  });

  it('removes AT-style mcp-server.js entries by heuristic, keeps unrelated mcp-server.js', () => {
    const result = stripLegacyAtMcpServers({
      staleAtTerminal: {
        command: 'node',
        args: [
          'C:/Users/alan/.vscode/extensions/local.at-terminal-0.2.10/dist/mcp-server.js'
        ]
      },
      thirdParty: {
        command: 'node',
        args: ['C:/tools/some-other-tool/dist/mcp-server.js']
      }
    });

    expect(result).toEqual({
      thirdParty: {
        command: 'node',
        args: ['C:/tools/some-other-tool/dist/mcp-server.js']
      }
    });
  });
});
