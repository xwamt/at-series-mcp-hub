import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig,
  buildInstallerAtSeriesEnv
} from '../src/installer/index';
import { MCP_SERVER_DISPLAY_NAME, HUB_BUILTIN_TOOL_NAMES } from '../src/protocol/index';

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
      env: buildInstallerAtSeriesEnv('continue'),
      autoApprove: [...HUB_BUILTIN_TOOL_NAMES]
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

  it('keeps the legacy files when the new config cannot be written', async () => {
    const dir = path.join(workspace, '.continue', 'mcpServers');
    await fs.mkdir(dir, { recursive: true });
    const legacy = path.join(dir, 'at-terminal.yaml');
    await fs.writeFile(legacy, 'name: old\n', 'utf8');

    // A directory where the config belongs makes the write fail deterministically.
    await fs.mkdir(path.join(dir, 'at-series.yaml'), { recursive: true });

    await expect(
      ensureAtSeriesMcpConfig({
        target: 'continue',
        hostApp: 'continue',
        hubJsAbsolutePath: hubJs,
        workspaceFolder: workspace,
        registryTools: []
      })
    ).rejects.toThrow();

    // Removing the old entry before the replacement lands would leave the user
    // with no AT Series config at all.
    await expect(fs.access(legacy)).resolves.toBeUndefined();
  });

  it('backs the previous config up once before replacing it', async () => {
    const dir = path.join(workspace, '.continue', 'mcpServers');
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, 'at-series.yaml');
    await fs.writeFile(target, 'name: hand written\n', 'utf8');

    await ensureAtSeriesMcpConfig({
      target: 'continue',
      hostApp: 'continue',
      hubJsAbsolutePath: hubJs,
      workspaceFolder: workspace,
      registryTools: []
    });

    const backup = `${target}.at-series.bak`;
    expect(await fs.readFile(backup, 'utf8')).toBe('name: hand written\n');

    // A second pass must not overwrite the only copy that predates us.
    await fs.writeFile(hubJs, 'module.exports = { changed: true };\n', 'utf8');
    await ensureAtSeriesMcpConfig({
      target: 'continue',
      hostApp: 'continue',
      hubJsAbsolutePath: path.join(workspace, 'hub2.js'),
      workspaceFolder: workspace,
      registryTools: []
    });
    expect(await fs.readFile(backup, 'utf8')).toBe('name: hand written\n');
  });

  it('serialises concurrent writers so no update is lost', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ensureAtSeriesMcpConfig({
          target: 'continue',
          hostApp: 'continue',
          hubJsAbsolutePath: hubJs,
          workspaceFolder: workspace,
          registryTools: []
        })
      )
    );

    // Exactly one writer sees a change; the rest observe the settled file.
    expect(results.filter((r) => r.updated)).toHaveLength(1);

    const target = path.join(workspace, '.continue', 'mcpServers', 'at-series.yaml');
    const doc = yamlLoad(await fs.readFile(target, 'utf8')) as { name: string };
    expect(doc.name).toBe(MCP_SERVER_DISPLAY_NAME);
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
