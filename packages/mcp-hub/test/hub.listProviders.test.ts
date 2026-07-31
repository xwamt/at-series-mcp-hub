import { describe, it, expect } from 'vitest';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';
import type { HealthyBridge } from '../src/hub/aggregate';
import { buildListProvidersResult } from '../src/hub/listProviders';

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
    Pick<BridgeRegistryRecord, 'bridgeId' | 'pluginId'>
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    pluginDisplayName: overrides.pluginDisplayName ?? overrides.pluginId,
    pluginVersion: '1.0.0',
    hostApp: 'cursor',
    port: 1000,
    token: 'secret-token-must-not-leak',
    pid: 1,
    updatedAt: 100,
    tools: [],
    ...overrides
  };
}

function healthy(opts: {
  bridgeId: string;
  pluginId: string;
  pluginDisplayName?: string;
  pluginVersion?: string;
  tools: ToolCatalogEntry[];
  connectedTargets?: number;
  updatedAt?: number;
  port?: number;
}): HealthyBridge {
  return {
    record: record({
      bridgeId: opts.bridgeId,
      pluginId: opts.pluginId,
      pluginDisplayName: opts.pluginDisplayName,
      pluginVersion: opts.pluginVersion,
      updatedAt: opts.updatedAt ?? 100,
      port: opts.port ?? 1000,
      tools: opts.tools
    }),
    tools: opts.tools,
    connectedTargets: opts.connectedTargets ?? 1
  };
}

describe('buildListProvidersResult', () => {
  it('groups two plugins and never includes tokens', () => {
    const result = buildListProvidersResult({
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      healthy: [
        healthy({
          bridgeId: 'term-1',
          pluginId: 'at.terminal',
          pluginDisplayName: 'AT Terminal',
          pluginVersion: '0.2.17',
          tools: [tool('list_ssh_servers')],
          connectedTargets: 2,
          port: 53123,
          updatedAt: 1720000000000
        }),
        healthy({
          bridgeId: 'js-1',
          pluginId: 'at.jumpserver',
          pluginDisplayName: 'AT JumpServer Terminal',
          pluginVersion: '0.1.5',
          tools: [tool('jumpserver_list_assets')],
          connectedTargets: 1,
          port: 53124,
          updatedAt: 1720000001000
        })
      ],
      conflicts: []
    });

    expect(result.hostApp).toBe('cursor');
    expect(result.hubVersion).toBe('0.1.0');
    expect(result.protocolVersion).toBe(2);
    expect(result.ignoredUnscopedBridgeCount).toBe(0);

    expect(result.providers.map((p) => p.pluginId).sort()).toEqual([
      'at.jumpserver',
      'at.terminal'
    ]);

    const terminal = result.providers.find((p) => p.pluginId === 'at.terminal')!;
    expect(terminal.pluginDisplayName).toBe('AT Terminal');
    expect(terminal.pluginVersion).toBe('0.2.17');
    expect(terminal.tools).toEqual(['list_ssh_servers']);
    expect(terminal.conflicts).toEqual([]);
    expect(terminal.bridges).toEqual([
      {
        bridgeId: 'term-1',
        status: 'healthy',
        connectedTargets: 2,
        toolCount: 1,
        updatedAt: 1720000000000,
        port: 53123
      }
    ]);

    const jumpserver = result.providers.find(
      (p) => p.pluginId === 'at.jumpserver'
    )!;
    expect(jumpserver.tools).toEqual(['jumpserver_list_assets']);
    expect(jumpserver.bridges[0]?.status).toBe('healthy');

    const json = JSON.stringify(result);
    expect(json).not.toContain('secret-token-must-not-leak');
    expect(json).not.toMatch(/"token"/);
  });

  it('includes conflict tool names on winner and loser providers', () => {
    const result = buildListProvidersResult({
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      healthy: [
        healthy({
          bridgeId: 'high',
          pluginId: 'plugin.high',
          tools: [tool('shared_tool')]
        }),
        healthy({
          bridgeId: 'low',
          pluginId: 'plugin.low',
          tools: [tool('shared_tool'), tool('only_low')]
        })
      ],
      conflicts: [
        {
          name: 'shared_tool',
          winnerPluginId: 'plugin.high',
          loserPluginIds: ['plugin.low']
        }
      ]
    });

    const high = result.providers.find((p) => p.pluginId === 'plugin.high')!;
    const low = result.providers.find((p) => p.pluginId === 'plugin.low')!;
    expect(high.conflicts).toEqual(['shared_tool']);
    expect(low.conflicts).toEqual(['shared_tool']);
    expect(high.tools).toEqual(['shared_tool']);
    expect(low.tools.sort()).toEqual(['only_low', 'shared_tool']);
  });

  it('counts ignoredUnscopedBridgeCount when provided', () => {
    const result = buildListProvidersResult({
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      healthy: [],
      conflicts: [],
      ignoredUnscopedBridgeCount: 3
    });

    expect(result.ignoredUnscopedBridgeCount).toBe(3);
    expect(result.providers).toEqual([]);
  });

  it('marks unhealthy and hubTooOld bridges', () => {
    const result = buildListProvidersResult({
      hostApp: 'cursor',
      hubVersion: '0.1.0',
      healthy: [
        healthy({
          bridgeId: 'ok',
          pluginId: 'at.terminal',
          pluginDisplayName: 'AT Terminal',
          tools: [tool('list_ssh_servers')]
        })
      ],
      unhealthy: [
        {
          record: record({
            bridgeId: 'down',
            pluginId: 'at.terminal',
            pluginDisplayName: 'AT Terminal',
            port: 53125,
            updatedAt: 50,
            tools: [tool('list_ssh_servers')]
          }),
          status: 'unhealthy'
        },
        {
          record: record({
            bridgeId: 'future',
            pluginId: 'at.jumpserver',
            pluginDisplayName: 'AT JumpServer Terminal',
            pluginVersion: '9.0.0',
            protocolVersion: 99,
            port: 53126,
            updatedAt: 200,
            tools: [tool('jumpserver_list_assets')]
          }),
          status: 'hubTooOld'
        }
      ],
      conflicts: []
    });

    const terminal = result.providers.find((p) => p.pluginId === 'at.terminal')!;
    expect(terminal.bridges.map((b) => b.bridgeId).sort()).toEqual([
      'down',
      'ok'
    ]);
    expect(terminal.bridges.find((b) => b.bridgeId === 'ok')?.status).toBe(
      'healthy'
    );
    expect(terminal.bridges.find((b) => b.bridgeId === 'down')).toMatchObject({
      bridgeId: 'down',
      status: 'unhealthy',
      port: 53125,
      updatedAt: 50,
      toolCount: 1
    });

    const jumpserver = result.providers.find(
      (p) => p.pluginId === 'at.jumpserver'
    )!;
    expect(jumpserver.bridges).toEqual([
      expect.objectContaining({
        bridgeId: 'future',
        status: 'hubTooOld',
        port: 53126,
        toolCount: 1
      })
    ]);
    expect(jumpserver.tools).toEqual(['jumpserver_list_assets']);
  });
});
