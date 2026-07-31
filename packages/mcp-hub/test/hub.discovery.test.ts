import { describe, expect, it } from 'vitest';
import type { ToolCatalogEntry } from '../src/protocol/index';
import {
  buildToolsByPluginId,
  computeExposedBusinessTools,
  META_TOOL_NAMES,
  parseToolDiscoveryMode,
  parseToolDiscoveryThreshold,
  resolveSelectTools,
  searchTools,
  type CatalogToolRef
} from '../src/hub/discovery';

function tool(
  name: string,
  overrides: Partial<ToolCatalogEntry> = {}
): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} description`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    ...overrides
  };
}

describe('parseToolDiscoveryMode', () => {
  it('defaults invalid or missing values to auto', () => {
    expect(parseToolDiscoveryMode(undefined)).toBe('auto');
    expect(parseToolDiscoveryMode('nope')).toBe('auto');
  });

  it.each(['auto', 'always', 'off'] as const)(
    'accepts %s',
    (mode) => {
      expect(parseToolDiscoveryMode(mode)).toBe(mode);
    }
  );
});

describe('parseToolDiscoveryThreshold', () => {
  it('uses the default for missing or invalid values', () => {
    expect(parseToolDiscoveryThreshold(undefined)).toBe(20);
    expect(parseToolDiscoveryThreshold('-1')).toBe(20);
    expect(parseToolDiscoveryThreshold('1.5')).toBe(20);
    expect(parseToolDiscoveryThreshold('nope')).toBe(20);
  });

  it('accepts non-negative integers', () => {
    expect(parseToolDiscoveryThreshold('0')).toBe(0);
    expect(parseToolDiscoveryThreshold('5')).toBe(5);
  });
});

describe('searchTools', () => {
  const catalog: CatalogToolRef[] = [
    {
      entry: tool('list_ssh_servers', {
        title: 'SSH servers',
        description: 'List remote hosts'
      }),
      pluginId: 'at.terminal'
    },
    {
      entry: tool('jumpserver_list_assets', {
        title: 'JumpServer assets',
        description: 'Find managed assets'
      }),
      pluginId: 'at.jumpserver'
    },
    {
      entry: tool('grafana_instances', {
        title: 'Observability',
        description: 'List Grafana instances'
      }),
      pluginId: 'at.grafana'
    }
  ];

  it('matches names, titles, and descriptions case-insensitively', () => {
    expect(
      searchTools(catalog, { query: 'ssh', limit: 20 }).map((hit) => hit.name)
    ).toEqual(['list_ssh_servers']);
    expect(
      searchTools(catalog, { query: 'JUMPSERVER', limit: 20 }).map(
        (hit) => hit.name
      )
    ).toEqual(['jumpserver_list_assets']);
    expect(
      searchTools(catalog, { query: 'grafana', limit: 20 }).map(
        (hit) => hit.name
      )
    ).toEqual(['grafana_instances']);
  });

  it('filters by plugin and omits input schemas', () => {
    const hits = searchTools(catalog, {
      query: 'list',
      pluginId: 'at.terminal',
      limit: 20
    });

    expect(hits).toEqual([
      {
        name: 'list_ssh_servers',
        title: 'SSH servers',
        description: 'List remote hosts',
        risk: 'read',
        pluginId: 'at.terminal'
      }
    ]);
    expect(hits[0]).not.toHaveProperty('inputSchema');
  });

  it('clamps the result limit between one and fifty', () => {
    expect(searchTools(catalog, { query: '', limit: 0 })).toHaveLength(1);
    expect(searchTools(catalog, { query: '', limit: Number.NaN })).toHaveLength(
      1
    );
    expect(searchTools(catalog, { query: '', limit: 100 })).toHaveLength(3);
  });
});

describe('buildToolsByPluginId', () => {
  it('groups winner tools by plugin ID', () => {
    const grouped = buildToolsByPluginId([
      { entry: tool('list_ssh_servers'), pluginId: 'at.terminal' },
      { entry: tool('run_remote_command'), pluginId: 'at.terminal' },
      { entry: tool('grafana_instances'), pluginId: 'at.grafana' }
    ]);

    expect(grouped).toEqual(
      new Map([
        ['at.terminal', ['list_ssh_servers', 'run_remote_command']],
        ['at.grafana', ['grafana_instances']]
      ])
    );
  });
});

describe('resolveSelectTools', () => {
  const toolsByPluginId = new Map<string, string[]>([
    ['at.terminal', ['list_ssh_servers', 'run_remote_command']],
    ['at.grafana', ['grafana_instances']]
  ]);
  const allToolNames = new Set([
    'list_ssh_servers',
    'run_remote_command',
    'grafana_instances'
  ]);

  it('replaces the selection with all tools for selected plugins and explicit names', () => {
    const result = resolveSelectTools({
      args: {
        pluginIds: ['at.terminal'],
        names: ['grafana_instances'],
        mode: 'replace'
      },
      previousSelected: ['list_ssh_servers'],
      toolsByPluginId,
      allToolNames
    });

    expect(result).toEqual({
      selected: [
        'list_ssh_servers',
        'run_remote_command',
        'grafana_instances'
      ],
      unknownNames: [],
      unknownPluginIds: [],
      exposedBusinessToolCount: 3,
      mode: 'replace'
    });
  });

  it('reports unknown names and plugin IDs while retaining valid additions', () => {
    const result = resolveSelectTools({
      args: {
        pluginIds: ['at.terminal', 'missing.plugin'],
        names: ['grafana_instances', 'not_a_tool'],
        mode: 'add'
      },
      previousSelected: ['list_ssh_servers'],
      toolsByPluginId,
      allToolNames
    });

    expect(result).toEqual({
      selected: [
        'list_ssh_servers',
        'run_remote_command',
        'grafana_instances'
      ],
      unknownNames: ['not_a_tool'],
      unknownPluginIds: ['missing.plugin'],
      exposedBusinessToolCount: 3,
      mode: 'add'
    });
  });

  it('clears replace-mode selection when every request is unknown', () => {
    const result = resolveSelectTools({
      args: { names: ['not_a_tool'], mode: 'replace' },
      previousSelected: ['list_ssh_servers'],
      toolsByPluginId,
      allToolNames
    });

    expect(result.selected).toEqual([]);
    expect(result.unknownNames).toEqual(['not_a_tool']);
    expect(result.mode).toBe('replace');
  });

  it('keeps prior selection for add mode when every request is unknown', () => {
    const result = resolveSelectTools({
      args: { pluginIds: ['missing.plugin'], mode: 'add' },
      previousSelected: ['list_ssh_servers'],
      toolsByPluginId,
      allToolNames
    });

    expect(result.selected).toEqual(['list_ssh_servers']);
    expect(result.unknownPluginIds).toEqual(['missing.plugin']);
    expect(result.mode).toBe('add');
  });
});

describe('computeExposedBusinessTools', () => {
  const businessTools = [tool('a'), tool('b'), tool('c')];

  it('exposes all business tools outside progressive mode', () => {
    expect(
      computeExposedBusinessTools({
        mode: 'off',
        threshold: 0,
        businessTools,
        selectedNames: new Set()
      })
    ).toEqual(businessTools);
    expect(
      computeExposedBusinessTools({
        mode: 'auto',
        threshold: 3,
        businessTools,
        selectedNames: new Set()
      })
    ).toEqual(businessTools);
  });

  it('filters selected names in progressive mode', () => {
    expect(
      computeExposedBusinessTools({
        mode: 'always',
        threshold: 20,
        businessTools,
        selectedNames: new Set(['b'])
      }).map((entry) => entry.name)
    ).toEqual(['b']);
    expect(
      computeExposedBusinessTools({
        mode: 'auto',
        threshold: 2,
        businessTools,
        selectedNames: new Set()
      })
    ).toEqual([]);
  });
});

describe('META_TOOL_NAMES', () => {
  it('contains exactly the Hub builtins', () => {
    expect(META_TOOL_NAMES.has('at_search_tools')).toBe(true);
    expect(META_TOOL_NAMES.has('list_ssh_servers')).toBe(false);
  });
});
