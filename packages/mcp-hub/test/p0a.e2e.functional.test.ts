/**
 * P0a end-to-end functional verification (fixture Bridges, no real IDE plugins).
 * Covers Hub discovery → aggregate → invoke → watch → installer → hub election
 * in one integrated scenario against a temp ~/.at-series home.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHubRuntime } from '../src/hub/server';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { syncHubBundle } from '../src/publisher/HubBundleSync';
import {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig,
  defaultAutoApproveToolNames
} from '../src/installer/index';
import {
  MCP_SERVER_DISPLAY_NAME,
  AT_SERIES_HOST_APP_ENV,
  HUB_BUILTIN_TOOL_NAMES
} from '../src/protocol/index';
import { hubJsPath, hubVersionPath } from '../src/protocol/paths';
import { startFakeBridge, type FakeBridgeHandle } from './fixtures/fakeBridge';

const ping = {
  name: 'example_ping',
  title: 'Ping',
  description: 'ping',
  risk: 'read' as const,
  inputSchema: { type: 'object', properties: {} }
};
const run = {
  name: 'example_run',
  title: 'Run',
  description: 'run',
  risk: 'exec' as const,
  inputSchema: {
    type: 'object',
    properties: { command: { type: 'string' } },
    required: ['command']
  }
};
const jsList = {
  name: 'jumpserver_list_assets',
  title: 'List',
  description: 'list',
  risk: 'read' as const,
  inputSchema: { type: 'object', properties: {} }
};

describe('P0a e2e functional', () => {
  let home: string;
  let workspace: string;
  let terminal: FakeBridgeHandle;
  let jumpserver: FakeBridgeHandle;
  let pubTerminal: FsBridgePublisher;
  let pubJs: FsBridgePublisher;
  let hubJsSource: string;

  beforeAll(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-e2e-'));
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-ws-'));
    hubJsSource = path.resolve(__dirname, '../dist/hub.js');
    await fs.access(hubJsSource);

    terminal = await startFakeBridge({
      bridgeId: 'bridge-terminal',
      pluginId: 'at.terminal',
      pluginDisplayName: 'AT Terminal',
      hostApp: 'cursor',
      tools: [ping, run],
      onInvoke: (req) => {
        if (req.name === 'example_ping') {
          return { ok: true, name: req.name, result: { pong: true } };
        }
        return {
          status: 422,
          body: {
            error: { code: 'VALIDATION_ERROR', message: 'bad args' }
          }
        };
      }
    });

    jumpserver = await startFakeBridge({
      bridgeId: 'bridge-js',
      pluginId: 'at.jumpserver',
      pluginDisplayName: 'AT JumpServer',
      hostApp: 'cursor',
      tools: [jsList]
    });

    pubTerminal = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-terminal',
      hostApp: 'cursor'
    });
    pubJs = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-js',
      hostApp: 'cursor'
    });

    const now = Date.now();
    await pubTerminal.publish({
      protocolVersion: 1,
      bridgeId: 'bridge-terminal',
      pluginId: 'at.terminal',
      pluginDisplayName: 'AT Terminal',
      pluginVersion: '0.2.17',
      hostApp: 'cursor',
      port: terminal.port,
      token: terminal.token,
      pid: process.pid,
      updatedAt: now,
      tools: [ping, run],
      capabilities: { connectedTargets: 2 }
    });
    await pubJs.publish({
      protocolVersion: 1,
      bridgeId: 'bridge-js',
      pluginId: 'at.jumpserver',
      pluginDisplayName: 'AT JumpServer',
      pluginVersion: '0.1.3',
      hostApp: 'cursor',
      port: jumpserver.port,
      token: jumpserver.token,
      pid: process.pid,
      updatedAt: now,
      tools: [jsList],
      capabilities: { connectedTargets: 1 }
    });
  }, 30_000);

  afterAll(async () => {
    await pubTerminal?.unpublish().catch(() => undefined);
    await pubJs?.unpublish().catch(() => undefined);
    await terminal?.close();
    await jumpserver?.close();
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('aggregates both plugins, routes invoke, maps errors, lists providers without tokens', async () => {
    const changed: string[] = [];
    const runtime = await createHubRuntime({
      home,
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      onToolsListChanged: () => changed.push('x')
    });

    try {
      const tools = await runtime.listToolsForMcp();
      const names = tools.map((t) => t.name).sort();
      expect(names).toContain('at_list_providers');
      expect(names).toContain('example_ping');
      expect(names).toContain('example_run');
      expect(names).toContain('jumpserver_list_assets');

      const pingResult = await runtime.callTool('example_ping', {});
      expect(pingResult.isError).toBeFalsy();
      // Hub surfaces Bridge invoke `result` as JSON text (not the full {ok,name,result} envelope).
      expect(JSON.parse(pingResult.content[0].text)).toEqual({ pong: true });

      const bad = await runtime.callTool('example_run', {});
      expect(bad.isError).toBe(true);
      expect(JSON.parse(bad.content[0].text).error.code).toBe('VALIDATION_ERROR');

      const providers = await runtime.callTool('at_list_providers', {});
      const body = JSON.parse(providers.content[0].text);
      expect(body.hostApp).toBe('cursor');
      expect(body.providers.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(body)).not.toMatch(/"token"/);

      // kiro isolation
      const kiroRuntime = await createHubRuntime({
        home,
        hostApp: 'kiro',
        hubVersion: '0.1.0'
      });
      try {
        const kiroTools = await kiroRuntime.listToolsForMcp();
        expect(kiroTools.map((t) => t.name)).toEqual([...HUB_BUILTIN_TOOL_NAMES]);
      } finally {
        await kiroRuntime.close();
      }
    } finally {
      await runtime.close();
    }
  }, 30_000);

  it('watch drops tools after unpublish and notifies list_changed', async () => {
    const notify = { n: 0 };
    const runtime = await createHubRuntime({
      home,
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      onToolsListChanged: () => {
        notify.n += 1;
      }
    });

    try {
      await runtime.listToolsForMcp();
      const before = notify.n;
      await pubJs.unpublish();

      let dropped = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const tools = await runtime.listToolsForMcp();
        if (!tools.some((t) => t.name === 'jumpserver_list_assets')) {
          dropped = true;
          break;
        }
      }
      expect(dropped).toBe(true);
      expect(notify.n).toBeGreaterThan(before);
    } finally {
      await runtime.close();
      // republish for later tests if needed — recreate js bridge publish
      await pubJs.publish({
        protocolVersion: 1,
        bridgeId: 'bridge-js',
        pluginId: 'at.jumpserver',
        pluginDisplayName: 'AT JumpServer',
        pluginVersion: '0.1.3',
        hostApp: 'cursor',
        port: jumpserver.port,
        token: jumpserver.token,
        pid: process.pid,
        updatedAt: Date.now(),
        tools: [jsList],
        capabilities: { connectedTargets: 1 }
      });
    }
  }, 45_000);

  it('hub bundle election + installer Cursor/Kiro/Continue migrate and uninstall', async () => {
    const candidate = path.join(home, 'candidate-hub.js');
    await fs.writeFile(candidate, await fs.readFile(hubJsSource));

    const sync1 = await syncHubBundle({
      version: '0.1.0',
      bundlePath: candidate,
      pluginId: 'at.terminal',
      pluginVersion: '0.2.17',
      home
    });
    expect(sync1.updated).toBe(true);
    expect(sync1.activeVersion).toBe('0.1.0');
    await fs.access(hubJsPath(home));
    const meta = JSON.parse(await fs.readFile(hubVersionPath(home), 'utf8'));
    expect(meta.version).toBe('0.1.0');
    expect(meta.bundleSha256).toMatch(/^[a-f0-9]{64}$/);

    const lower = await syncHubBundle({
      version: '0.0.9',
      bundlePath: candidate,
      pluginId: 'at.jumpserver',
      pluginVersion: '0.1.3',
      home
    });
    expect(lower.updated).toBe(false);
    expect(lower.activeVersion).toBe('0.1.0');

    // seed legacy + third-party
    const cursorDir = path.join(home, '.cursor');
    await fs.mkdir(cursorDir, { recursive: true });
    await fs.writeFile(
      path.join(cursorDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'AT Terminal': { command: 'node', args: ['/old/mcp-server.js'] },
          'other-server': { command: 'npx', args: ['foo'] }
        }
      }),
      'utf8'
    );

    const hubAbs = hubJsPath(home).replace(/\\/g, '/');
    // Helper may still list read tools; installer itself writes meta-only.
    const auto = defaultAutoApproveToolNames({
      registryTools: [ping, run, jsList]
    });
    expect(auto).toContain('at_list_providers');
    expect(auto).toContain('example_ping');
    expect(auto).toContain('jumpserver_list_assets');
    expect(auto).not.toContain('example_run');

    const c1 = await ensureAtSeriesMcpConfig({
      target: 'cursor',
      hostApp: 'cursor',
      hubJsAbsolutePath: hubAbs,
      home,
      registryTools: [ping, run, jsList]
    });
    expect(c1.updated).toBe(true);
    const cursorCfg = JSON.parse(
      await fs.readFile(path.join(cursorDir, 'mcp.json'), 'utf8')
    );
    expect(cursorCfg.mcpServers[MCP_SERVER_DISPLAY_NAME].env[AT_SERIES_HOST_APP_ENV]).toBe(
      'cursor'
    );
    expect(
      cursorCfg.mcpServers[MCP_SERVER_DISPLAY_NAME].env.AT_SERIES_TOOL_SELECTION_IDLE_MS
    ).toBe('0');
    expect(cursorCfg.mcpServers[MCP_SERVER_DISPLAY_NAME].autoApprove).toEqual([
      'at_list_providers',
      'at_search_tools',
      'at_get_tool',
      'at_select_tools',
      'at_clear_tool_selection'
    ]);
    expect(cursorCfg.mcpServers[MCP_SERVER_DISPLAY_NAME].autoApprove).not.toContain(
      'example_ping'
    );
    expect(cursorCfg.mcpServers['AT Terminal']).toBeUndefined();
    expect(cursorCfg.mcpServers['other-server']).toBeDefined();

    const c2 = await ensureAtSeriesMcpConfig({
      target: 'cursor',
      hostApp: 'cursor',
      hubJsAbsolutePath: hubAbs,
      home,
      registryTools: [ping, run, jsList]
    });
    expect(c2.updated).toBe(false);

    await ensureAtSeriesMcpConfig({
      target: 'kiro',
      hostApp: 'kiro',
      hubJsAbsolutePath: hubAbs,
      home,
      registryTools: [ping]
    });
    const kiroCfg = JSON.parse(
      await fs.readFile(path.join(home, '.kiro', 'settings', 'mcp.json'), 'utf8')
    );
    expect(kiroCfg.mcpServers[MCP_SERVER_DISPLAY_NAME]).toBeDefined();

    await ensureAtSeriesMcpConfig({
      target: 'continue',
      hostApp: 'continue',
      hubJsAbsolutePath: hubAbs,
      home,
      workspaceFolder: workspace,
      registryTools: [ping]
    });
    await fs.access(
      path.join(workspace, '.continue', 'mcpServers', 'at-series.yaml')
    );

    const un = await uninstallAtSeriesMcpConfig({
      target: 'cursor',
      home
    });
    expect(un.removed).toBe(true);
    const after = JSON.parse(
      await fs.readFile(path.join(cursorDir, 'mcp.json'), 'utf8')
    );
    expect(after.mcpServers[MCP_SERVER_DISPLAY_NAME]).toBeUndefined();
    expect(after.mcpServers['other-server']).toBeDefined();
  }, 30_000);
});
