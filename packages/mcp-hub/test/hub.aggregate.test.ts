import { describe, it, expect } from 'vitest';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';
import {
  aggregateTools,
  type HealthyBridge
} from '../src/hub/aggregate';

function tool(name: string, overrides: Partial<ToolCatalogEntry> = {}): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} desc`,
    risk: 'read',
    inputSchema: { type: 'object' },
    ...overrides
  };
}

function record(
  overrides: Partial<BridgeRegistryRecord> &
    Pick<BridgeRegistryRecord, 'bridgeId' | 'pluginId'>
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    pluginDisplayName: overrides.pluginId,
    pluginVersion: '1.0.0',
    hostApp: 'cursor',
    port: 1000,
    token: 't'.repeat(32),
    pid: 1,
    updatedAt: 100,
    tools: [],
    ...overrides
  };
}

function bridge(opts: {
  bridgeId: string;
  pluginId: string;
  tools: ToolCatalogEntry[];
  connectedTargets: number;
  updatedAt?: number;
}): HealthyBridge {
  return {
    record: record({
      bridgeId: opts.bridgeId,
      pluginId: opts.pluginId,
      updatedAt: opts.updatedAt ?? 100
    }),
    tools: opts.tools,
    connectedTargets: opts.connectedTargets
  };
}

describe('aggregateTools', () => {
  it('includes tools from two pluginIds with disjoint names', () => {
    const catalog = aggregateTools([
      bridge({
        bridgeId: 'a',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 1
      }),
      bridge({
        bridgeId: 'b',
        pluginId: 'at.jumpserver',
        tools: [tool('jumpserver_list_assets')],
        connectedTargets: 1
      })
    ]);

    const names = catalog.tools.map((t) => t.name).sort();
    expect(names).toEqual(['jumpserver_list_assets', 'list_ssh_servers']);
    expect(catalog.conflicts).toEqual([]);
    expect(catalog.winners.get('list_ssh_servers')?.pluginId).toBe('at.terminal');
    expect(catalog.winners.get('jumpserver_list_assets')?.pluginId).toBe(
      'at.jumpserver'
    );
  });

  it('collapses same pluginId same tool across two bridges into one MCP tool', () => {
    const catalog = aggregateTools([
      bridge({
        bridgeId: 'a1',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 1,
        updatedAt: 10
      }),
      bridge({
        bridgeId: 'a2',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 2,
        updatedAt: 20
      })
    ]);

    expect(catalog.tools).toHaveLength(1);
    expect(catalog.tools[0].name).toBe('list_ssh_servers');
    expect(catalog.conflicts).toEqual([]);
    const winner = catalog.winners.get('list_ssh_servers');
    expect(winner?.pluginId).toBe('at.terminal');
    expect(winner?.bridges).toHaveLength(2);
  });

  it('keeps one winner across pluginIds on name conflict and reports losers', () => {
    const catalog = aggregateTools([
      bridge({
        bridgeId: 'low',
        pluginId: 'plugin.low',
        tools: [tool('shared_tool', { title: 'from-low' })],
        connectedTargets: 1,
        updatedAt: 50
      }),
      bridge({
        bridgeId: 'high',
        pluginId: 'plugin.high',
        tools: [tool('shared_tool', { title: 'from-high' })],
        connectedTargets: 5,
        updatedAt: 10
      })
    ]);

    expect(catalog.tools).toHaveLength(1);
    expect(catalog.tools[0].name).toBe('shared_tool');
    expect(catalog.tools[0].title).toBe('from-high');
    expect(catalog.winners.get('shared_tool')?.pluginId).toBe('plugin.high');
    expect(catalog.conflicts).toEqual([
      {
        name: 'shared_tool',
        winnerPluginId: 'plugin.high',
        loserPluginIds: ['plugin.low']
      }
    ]);
  });
});
