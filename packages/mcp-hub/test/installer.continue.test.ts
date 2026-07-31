import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig
} from '../src/installer/index';
import { MCP_SERVER_DISPLAY_NAME, AT_SERIES_HOST_APP_ENV } from '../src/protocol/index';

describe('ensureAtSeriesMcpConfig (continue)', () => {
  let workspace: string;
  let hubJs: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-continue-'));
    hubJs = path.join(workspace, 'hub.js');
    await fs.writeFile(hubJs, 'module.exports = {};\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('writes at-series.yaml and removes legacy continue yaml files', async () => {
    const dir = path.join(workspace, '.continue', 'mcpServers');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'at-terminal.yaml'), 'name: old\n', 'utf8');
    await fs.writeFile(
      path.join(dir, 'at-jumpserver-terminal.yaml'),
      'name: old-js\n',
      'utf8'
    );

    const first = await ensureAtSeriesMcpConfig({
      target: 'continue',
      hostApp: 'continue',
      hubJsAbsolutePath: hubJs,
      workspaceFolder: workspace,
      registryTools: []
    });
    expect(first).toEqual({ updated: true });

    const target = path.join(dir, 'at-series.yaml');
    const doc = yamlLoad(await fs.readFile(target, 'utf8')) as {
      name: string;
      mcpServers: Array<{
        name: string;
        command: string;
        args: string[];
        env: Record<string, string>;
        autoApprove: string[];
      }>;
    };
    expect(doc.name).toBe(MCP_SERVER_DISPLAY_NAME);
    expect(doc.mcpServers[0]).toMatchObject({
      name: MCP_SERVER_DISPLAY_NAME,
      command: 'node',
      args: [hubJs.replace(/\\/g, '/')],
      env: { [AT_SERIES_HOST_APP_ENV]: 'continue' },
      autoApprove: [
        'at_list_providers',
        'at_search_tools',
        'at_get_tool',
        'at_select_tools',
        'at_clear_tool_selection'
      ]
    });

    await expect(fs.access(path.join(dir, 'at-terminal.yaml'))).rejects.toThrow();
    await expect(
      fs.access(path.join(dir, 'at-jumpserver-terminal.yaml'))
    ).rejects.toThrow();

    const second = await ensureAtSeriesMcpConfig({
      target: 'continue',
      hostApp: 'continue',
      hubJsAbsolutePath: hubJs,
      workspaceFolder: workspace,
      registryTools: []
    });
    expect(second).toEqual({ updated: false });
  });

  it('uninstall removes at-series.yaml only', async () => {
    const dir = path.join(workspace, '.continue', 'mcpServers');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'at-series.yaml'), 'name: AT Series\n', 'utf8');
    await fs.writeFile(path.join(dir, 'other.yaml'), 'name: other\n', 'utf8');

    const result = await uninstallAtSeriesMcpConfig({
      target: 'continue',
      workspaceFolder: workspace
    });
    expect(result).toEqual({ removed: true });

    await expect(fs.access(path.join(dir, 'at-series.yaml'))).rejects.toThrow();
    await expect(fs.access(path.join(dir, 'other.yaml'))).resolves.toBeUndefined();
  });
});
