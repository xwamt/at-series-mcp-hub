import { describe, it, expect } from 'vitest';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';
import {
  aggregateTools,
  orderBridgesForTool,
  pickBridgeForTool,
  scoreBridge,
  type HealthyBridge
} from '../src/hub/aggregate';

function tool(name: string): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} desc`,
    risk: 'read',
    inputSchema: { type: 'object' }
  };
}

function record(
  overrides: Partial<BridgeRegistryRecord> &
    Pick<BridgeRegistryRecord, 'bridgeId' | 'pluginId' | 'updatedAt'>
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    pluginDisplayName: overrides.pluginId,
    pluginVersion: '1.0.0',
    hostApp: 'cursor',
    port: 1000,
    token: 't'.repeat(32),
    pid: 1,
    tools: [],
    ...overrides
  };
}

function bridge(opts: {
  bridgeId: string;
  pluginId: string;
  tools: ToolCatalogEntry[];
  connectedTargets: number;
  updatedAt: number;
}): HealthyBridge {
  return {
    record: record({
      bridgeId: opts.bridgeId,
      pluginId: opts.pluginId,
      updatedAt: opts.updatedAt
    }),
    tools: opts.tools,
    connectedTargets: opts.connectedTargets
  };
}

describe('pickBridgeForTool / scoreBridge', () => {
  it('prefers higher connectedTargets', () => {
    const bridges = [
      bridge({
        bridgeId: 'low',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 1,
        updatedAt: 999
      }),
      bridge({
        bridgeId: 'high',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 4,
        updatedAt: 1
      })
    ];
    const catalog = aggregateTools(bridges);
    const picked = pickBridgeForTool('list_ssh_servers', catalog, bridges);
    expect(picked?.record.bridgeId).toBe('high');
    expect(scoreBridge(bridges[1])[0]).toBeGreaterThan(scoreBridge(bridges[0])[0]);
  });

  it('tie-breaks with newer updatedAt when connectedTargets equal', () => {
    const bridges = [
      bridge({
        bridgeId: 'old',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 2,
        updatedAt: 10
      }),
      bridge({
        bridgeId: 'new',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 2,
        updatedAt: 200
      })
    ];
    const catalog = aggregateTools(bridges);
    const picked = pickBridgeForTool('list_ssh_servers', catalog, bridges);
    expect(picked?.record.bridgeId).toBe('new');
  });

  it('orderBridgesForTool returns preferred bridge first', () => {
    const bridges = [
      bridge({
        bridgeId: 'mid',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 2,
        updatedAt: 50
      }),
      bridge({
        bridgeId: 'best',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 5,
        updatedAt: 10
      }),
      bridge({
        bridgeId: 'worst',
        pluginId: 'at.terminal',
        tools: [tool('list_ssh_servers')],
        connectedTargets: 0,
        updatedAt: 999
      })
    ];
    const ordered = orderBridgesForTool('list_ssh_servers', bridges);
    expect(ordered.map((b) => b.record.bridgeId)).toEqual([
      'best',
      'mid',
      'worst'
    ]);
  });
});
