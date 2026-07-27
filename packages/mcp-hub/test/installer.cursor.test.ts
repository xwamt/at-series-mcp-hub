import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig
} from '../src/installer/index';
import { MCP_SERVER_DISPLAY_NAME, AT_SERIES_HOST_APP_ENV } from '../src/protocol/index';
import type { ToolCatalogEntry } from '../src/protocol/index';

const readTools: ToolCatalogEntry[] = [
  {
    name: 'list_ssh_servers',
    title: 'list_ssh_servers',
    description: 'list',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'run_remote_command',
    title: 'run_remote_command',
    description: 'exec',
    risk: 'exec',
    inputSchema: { type: 'object', properties: {} }
  }
];

describe('ensureAtSeriesMcpConfig (cursor)', () => {
  let home: string;
  let hubJs: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-installer-'));
    hubJs = path.join(home, '.at-series', 'mcp', 'hub.js');
    await fs.mkdir(path.dirname(hubJs), { recursive: true });
    await fs.writeFile(hubJs, 'module.exports = {};\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('writes AT Series with env + hub path and migrates old entries', async () => {
    const mcpPath = path.join(home, '.cursor', 'mcp.json');
    await fs.mkdir(path.dirname(mcpPath), { recursive: true });
    await fs.writeFile(
      mcpPath,
      JSON.stringify(
        {
          mcpServers: {
            'AT Terminal': {
              command: 'node',
              args: ['C:/old/at-terminal/dist/mcp-server.js']
            },
            'other-server': { command: 'uvx', args: ['mcp-server-fetch'] }
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const first = await ensureAtSeriesMcpConfig({
      target: 'cursor',
      hostApp: 'cursor',
      hubJsAbsolutePath: hubJs,
      home,
      registryTools: readTools
    });
    expect(first).toEqual({ updated: true });

    const parsed = JSON.parse(await fs.readFile(mcpPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers['AT Terminal']).toBeUndefined();
    expect(parsed.mcpServers['other-server']).toEqual({
      command: 'uvx',
      args: ['mcp-server-fetch']
    });
    expect(parsed.mcpServers[MCP_SERVER_DISPLAY_NAME]).toEqual({
      command: 'node',
      args: [hubJs.replace(/\\/g, '/')],
      env: { [AT_SERIES_HOST_APP_ENV]: 'cursor' },
      autoApprove: ['at_list_providers', 'list_ssh_servers']
    });

    const second = await ensureAtSeriesMcpConfig({
      target: 'cursor',
      hostApp: 'cursor',
      hubJsAbsolutePath: hubJs,
      home,
      registryTools: readTools
    });
    expect(second).toEqual({ updated: false });
  });

  it('uninstall removes AT Series only', async () => {
    const mcpPath = path.join(home, '.cursor', 'mcp.json');
    await fs.mkdir(path.dirname(mcpPath), { recursive: true });
    await fs.writeFile(
      mcpPath,
      JSON.stringify(
        {
          mcpServers: {
            [MCP_SERVER_DISPLAY_NAME]: {
              command: 'node',
              args: [hubJs.replace(/\\/g, '/')]
            },
            'other-server': { command: 'uvx', args: ['mcp-server-fetch'] }
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const result = await uninstallAtSeriesMcpConfig({
      target: 'cursor',
      home
    });
    expect(result).toEqual({ removed: true });

    const parsed = JSON.parse(await fs.readFile(mcpPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers[MCP_SERVER_DISPLAY_NAME]).toBeUndefined();
    expect(parsed.mcpServers['other-server']).toBeDefined();
  });
});

describe('ensureAtSeriesMcpConfig (kiro)', () => {
  let home: string;
  let hubJs: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-installer-kiro-'));
    hubJs = path.join(home, '.at-series', 'mcp', 'hub.js');
    await fs.mkdir(path.dirname(hubJs), { recursive: true });
    await fs.writeFile(hubJs, 'module.exports = {};\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('writes ~/.kiro/settings/mcp.json', async () => {
    const result = await ensureAtSeriesMcpConfig({
      target: 'kiro',
      hostApp: 'kiro',
      hubJsAbsolutePath: hubJs,
      home,
      registryTools: []
    });
    expect(result).toEqual({ updated: true });

    const mcpPath = path.join(home, '.kiro', 'settings', 'mcp.json');
    const parsed = JSON.parse(await fs.readFile(mcpPath, 'utf8')) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    expect(parsed.mcpServers[MCP_SERVER_DISPLAY_NAME]?.env?.[AT_SERIES_HOST_APP_ENV]).toBe(
      'kiro'
    );
  });
});
