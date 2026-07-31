import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HUB_BUILTIN_TOOL_NAMES, type ToolCatalogEntry } from '../src/protocol/index';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import { createHubRuntime, type HubRuntime } from '../src/hub/server';
import { startFakeBridge, type FakeBridgeHandle } from './fixtures/fakeBridge';

function tool(name: string): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} description`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  };
}

describe('createHubRuntime progressive tool exposure', () => {
  let home: string;
  let bridge: FakeBridgeHandle | undefined;
  let runtime: HubRuntime | undefined;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-progressive-'));
  });

  afterEach(async () => {
    await runtime?.close();
    await bridge?.close();
    await fs.rm(home, { recursive: true, force: true });
  });

  async function publishBridge(
    tools: ToolCatalogEntry[],
    pluginId = 'at.terminal'
  ): Promise<void> {
    bridge = await startFakeBridge({ bridgeId: 'bridge-1', pluginId, tools });
    const publisher = new FsBridgePublisher({
      home,
      bridgeId: 'bridge-1',
      hostApp: 'cursor'
    });
    await publisher.publish({
      protocolVersion: 1,
      bridgeId: 'bridge-1',
      pluginId,
      pluginDisplayName: pluginId,
      pluginVersion: '0.1.0',
      hostApp: 'cursor',
      port: bridge.port,
      token: bridge.token,
      pid: process.pid,
      updatedAt: Date.now(),
      tools
    });
  }

  async function start(options: {
    discoveryMode: 'auto' | 'always' | 'off';
    discoveryThreshold?: number;
    onToolsListChanged?: () => void;
  }): Promise<HubRuntime> {
    runtime = await createHubRuntime({
      home,
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      ...options
    });
    return runtime;
  }

  it('always mode with no selection exposes only meta tools', async () => {
    await publishBridge([tool('list_ssh_servers')]);
    const hub = await start({ discoveryMode: 'always' });

    expect((await hub.listToolsForMcp()).map((entry) => entry.name).sort()).toEqual(
      [...HUB_BUILTIN_TOOL_NAMES].sort()
    );
  });

  it('selecting a plugin exposes its tools and notifies list_changed', async () => {
    await publishBridge([tool('list_ssh_servers')]);
    let notifications = 0;
    const hub = await start({
      discoveryMode: 'always',
      onToolsListChanged: () => {
        notifications++;
      }
    });

    const result = await hub.callTool('at_select_tools', {
      pluginIds: ['at.terminal']
    });

    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      selected: ['list_ssh_servers'],
      exposedBusinessToolCount: 1
    });
    expect((await hub.listToolsForMcp()).map((entry) => entry.name).sort()).toEqual(
      [...HUB_BUILTIN_TOOL_NAMES, 'list_ssh_servers'].sort()
    );
    expect(notifications).toBe(1);
  });

  it('clearing selection returns to meta tools only', async () => {
    await publishBridge([tool('list_ssh_servers')]);
    const hub = await start({ discoveryMode: 'always' });
    await hub.callTool('at_select_tools', { names: ['list_ssh_servers'] });

    const result = await hub.callTool('at_clear_tool_selection', {});

    expect(JSON.parse(result.content[0]!.text)).toEqual({ selected: [] });
    expect((await hub.listToolsForMcp()).map((entry) => entry.name).sort()).toEqual(
      [...HUB_BUILTIN_TOOL_NAMES].sort()
    );
  });

  it('auto mode exposes the full catalog at its threshold', async () => {
    await publishBridge([tool('list_ssh_servers'), tool('get_ssh_server')]);
    const hub = await start({ discoveryMode: 'auto', discoveryThreshold: 20 });

    expect((await hub.listToolsForMcp()).map((entry) => entry.name).sort()).toEqual(
      [...HUB_BUILTIN_TOOL_NAMES, 'get_ssh_server', 'list_ssh_servers'].sort()
    );
  });

  it('auto mode hides catalog above its threshold until selected', async () => {
    await publishBridge([
      tool('get_ssh_server'),
      tool('list_ssh_servers'),
      tool('run_remote_command')
    ]);
    const hub = await start({ discoveryMode: 'auto', discoveryThreshold: 2 });

    expect((await hub.listToolsForMcp()).map((entry) => entry.name).sort()).toEqual(
      [...HUB_BUILTIN_TOOL_NAMES].sort()
    );
  });

  it('routes calls to a current winner even when it is unlisted', async () => {
    await publishBridge([tool('list_ssh_servers')]);
    const hub = await start({ discoveryMode: 'always' });

    const result = await hub.callTool('list_ssh_servers', { scope: 'all' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      echoed: { scope: 'all' }
    });
  });

  it('returns search hits and full catalog entry lookup', async () => {
    await publishBridge([tool('list_ssh_servers')]);
    const hub = await start({ discoveryMode: 'always' });

    const search = await hub.callTool('at_search_tools', {
      query: 'ssh',
      pluginId: 'at.terminal'
    });
    const lookup = await hub.callTool('at_get_tool', {
      name: 'list_ssh_servers'
    });

    expect(JSON.parse(search.content[0]!.text)).toEqual([
      expect.objectContaining({
        name: 'list_ssh_servers',
        pluginId: 'at.terminal'
      })
    ]);
    expect(JSON.parse(lookup.content[0]!.text)).toEqual({
      ...tool('list_ssh_servers'),
      pluginId: 'at.terminal'
    });
  });
});
