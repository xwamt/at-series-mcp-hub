import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  BridgeHttpError,
  bridgeGetHealth,
  bridgeGetTools,
  bridgeInvoke
} from '../bridgeClient/http';
import type {
  HostApp,
  ListProvidersResult,
  ToolCatalogEntry,
  ToolDiscoveryMode
} from '../protocol/index';
import {
  AT_SERIES_TOOL_DISCOVERY_ENV,
  AT_SERIES_TOOL_DISCOVERY_THRESHOLD_ENV,
  AT_SERIES_TOOL_SELECTION_IDLE_MS_ENV,
  AT_SERIES_TOOL_SELECTION_MAX_CALLS_ENV
} from '../protocol/index';
import { listBridgeRecords } from '../registry/read';
import {
  watchBridgeRegistry,
  type WatchBridgeRegistryHandle
} from '../registry/watch';
import {
  aggregateTools,
  orderBridgesForTool,
  type AggregatedCatalog,
  type HealthyBridge
} from './aggregate';
import {
  buildListProvidersResult,
  type UnhealthyBridgeInput
} from './listProviders';
import {
  buildToolsByPluginId,
  computeExposedBusinessTools,
  META_TOOL_NAMES,
  parseToolDiscoveryMode,
  parseToolDiscoveryThreshold,
  parseToolSelectionIdleMs,
  parseToolSelectionMaxCalls,
  resolveSelectTools,
  searchTools,
  shouldAutoClearSelection,
  type CatalogToolRef,
  type SelectToolsArgs
} from './discovery';

const META_TOOL_DESCRIPTION =
  'Use search → select → list_changed → first-class call to discover tools. Selection filters tools/list only; it is not an ACL. Selection auto-clears after idle TTL or call budget (see protocol v2).';

const HUB_META_TOOLS: ToolCatalogEntry[] = [
  {
    name: 'at_list_providers',
    title: 'List AT Series providers',
    description: `List registered AT Series plugin bridges and their tools for this IDE host. ${META_TOOL_DESCRIPTION}`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'at_search_tools',
    title: 'Search AT Series tools',
    description: `Search the current winning AT Series tool catalog. ${META_TOOL_DESCRIPTION}`,
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        pluginId: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['query']
    }
  },
  {
    name: 'at_get_tool',
    title: 'Get AT Series tool',
    description: `Get a full catalog entry for a current winning AT Series tool. ${META_TOOL_DESCRIPTION}`,
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  },
  {
    name: 'at_select_tools',
    title: 'Select AT Series tools',
    description: `Select catalog tools or providers for tools/list exposure. ${META_TOOL_DESCRIPTION}`,
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        pluginIds: { type: 'array', items: { type: 'string' } },
        names: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['replace', 'add'] }
      }
    }
  },
  {
    name: 'at_clear_tool_selection',
    title: 'Clear AT Series tool selection',
    description: `Clear selected tools from progressive tools/list exposure. ${META_TOOL_DESCRIPTION}`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  }
];

/** Periodic re-health interval (protocol §8.4: unhealthy 3–5s, healthy ≤15s). */
const HEALTH_REFRESH_INTERVAL_MS = 5000;

export type HubRuntime = {
  refreshCatalog: () => Promise<
    AggregatedCatalog & { providers: ListProvidersResult }
  >;
  listToolsForMcp: () => Promise<ToolCatalogEntry[]>;
  callTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
  getServer?: () => McpServer;
  close: () => Promise<void>;
};

function catalogToolsFingerprint(tools: ToolCatalogEntry[]): string {
  return tools
    .map((t) => t.name)
    .sort()
    .join('\0');
}

function connectedTargetsForBridge(
  health: { connectedTargets?: number } | undefined,
  record: HealthyBridge['record']
): number {
  if (typeof health?.connectedTargets === 'number') {
    return health.connectedTargets;
  }
  if (typeof record.capabilities?.connectedTargets === 'number') {
    return record.capabilities.connectedTargets;
  }
  return 0;
}

function errorText(code: string, message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: { code, message } })
      }
    ],
    isError: true
  };
}

export async function createHubRuntime(options: {
  home?: string;
  hostApp: string;
  hubVersion: string;
  discoveryMode?: ToolDiscoveryMode;
  discoveryThreshold?: number;
  /** Override AT_SERIES_TOOL_SELECTION_IDLE_MS (tests). `0` disables. */
  selectionIdleMs?: number;
  /** Override AT_SERIES_TOOL_SELECTION_MAX_CALLS (tests). `0` disables. */
  selectionMaxCalls?: number;
  /** Invoked when the aggregated tool-name set changes (after baseline). */
  onToolsListChanged?: () => void;
}): Promise<HubRuntime> {
  const hostApp = options.hostApp as HostApp;
  const discoveryMode = parseToolDiscoveryMode(
    options.discoveryMode ?? process.env[AT_SERIES_TOOL_DISCOVERY_ENV]
  );
  const discoveryThreshold = parseToolDiscoveryThreshold(
    String(
      options.discoveryThreshold ??
        process.env[AT_SERIES_TOOL_DISCOVERY_THRESHOLD_ENV] ??
        ''
    )
  );
  const selectionIdleMs = parseToolSelectionIdleMs(
    options.selectionIdleMs ?? process.env[AT_SERIES_TOOL_SELECTION_IDLE_MS_ENV]
  );
  const selectionMaxCalls = parseToolSelectionMaxCalls(
    options.selectionMaxCalls ??
      process.env[AT_SERIES_TOOL_SELECTION_MAX_CALLS_ENV]
  );
  let healthyBridges: HealthyBridge[] = [];
  let unhealthyBridges: UnhealthyBridgeInput[] = [];
  let catalog: AggregatedCatalog = {
    tools: [],
    winners: new Map(),
    conflicts: []
  };
  let providersResult: ListProvidersResult = buildListProvidersResult({
    hostApp,
    hubVersion: options.hubVersion,
    healthy: [],
    unhealthy: [],
    conflicts: []
  });
  /** `undefined` until the first successful refresh establishes a baseline. */
  let toolsFingerprint: string | undefined;
  let selectedToolNames = new Set<string>();
  let lastSelectionActivityAt: number | undefined;
  let businessCallsSinceSelect = 0;
  let closed = false;
  let registryWatch: WatchBridgeRegistryHandle | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;

  /** Shared in-flight refresh; coalesces concurrent callers onto one trailing pass. */
  let refreshShared:
    | Promise<AggregatedCatalog & { providers: ListProvidersResult }>
    | undefined;
  let refreshQueued = false;

  function catalogToolRefs(): CatalogToolRef[] {
    return catalog.tools.flatMap((entry) => {
      const winner = catalog.winners.get(entry.name);
      return winner ? [{ entry, pluginId: winner.pluginId }] : [];
    });
  }

  function exposedBusinessTools(): ToolCatalogEntry[] {
    return computeExposedBusinessTools({
      mode: discoveryMode,
      threshold: discoveryThreshold,
      businessTools: catalog.tools,
      selectedNames: selectedToolNames
    });
  }

  function exposedToolsFingerprint(): string {
    return catalogToolsFingerprint([...exposedBusinessTools(), ...HUB_META_TOOLS]);
  }

  function notifyExposedToolsChanged(): void {
    const nextFingerprint = exposedToolsFingerprint();
    if (toolsFingerprint === undefined) {
      toolsFingerprint = nextFingerprint;
      return;
    }
    if (nextFingerprint === toolsFingerprint) {
      return;
    }
    toolsFingerprint = nextFingerprint;
    try {
      options.onToolsListChanged?.();
    } catch {
      // Notification failures must not break catalog updates.
    }
  }

  function touchSelectionActivity(): void {
    lastSelectionActivityAt = Date.now();
  }

  function clearSelection(reason: 'manual' | 'idle' | 'max_calls' | 'reconcile'): void {
    if (selectedToolNames.size === 0) {
      return;
    }
    selectedToolNames.clear();
    businessCallsSinceSelect = 0;
    lastSelectionActivityAt = undefined;
    notifyExposedToolsChanged();
    void reason;
  }

  function maybeAutoClearSelection(now = Date.now()): 'idle' | 'max_calls' | null {
    const reason = shouldAutoClearSelection({
      selectedCount: selectedToolNames.size,
      idleMs: selectionIdleMs,
      maxCalls: selectionMaxCalls,
      businessCallsSinceSelect,
      lastActivityAt: lastSelectionActivityAt,
      now
    });
    if (reason) {
      clearSelection(reason);
    }
    return reason;
  }

  async function refreshCatalogOnce(): Promise<
    AggregatedCatalog & { providers: ListProvidersResult }
  > {
    const records = await listBridgeRecords({
      hostApp: options.hostApp,
      home: options.home
    });

    const nextHealthy: HealthyBridge[] = [];
    const nextUnhealthy: UnhealthyBridgeInput[] = [];

    for (const record of records) {
      try {
        const health = await bridgeGetHealth(record);
        let tools = record.tools;
        try {
          const toolsResponse = await bridgeGetTools(record);
          tools = toolsResponse.tools;
        } catch {
          // Fall back to registry snapshot when live catalog fetch fails.
        }
        // Hub builtins are reserved: they never become Bridge routing winners.
        tools = tools.filter(({ name }) => !META_TOOL_NAMES.has(name));

        nextHealthy.push({
          record,
          tools,
          connectedTargets: connectedTargetsForBridge(health, record)
        });
      } catch {
        nextUnhealthy.push({ record, status: 'unhealthy' });
      }
    }

    healthyBridges = nextHealthy;
    unhealthyBridges = nextUnhealthy;
    catalog = aggregateTools(healthyBridges);
    providersResult = buildListProvidersResult({
      hostApp,
      hubVersion: options.hubVersion,
      healthy: healthyBridges,
      unhealthy: unhealthyBridges,
      conflicts: catalog.conflicts
    });
    const winnerNames = new Set(catalog.winners.keys());
    selectedToolNames = new Set(
      [...selectedToolNames].filter((name) => winnerNames.has(name))
    );
    if (selectedToolNames.size === 0) {
      businessCallsSinceSelect = 0;
      lastSelectionActivityAt = undefined;
    }
    maybeAutoClearSelection();
    notifyExposedToolsChanged();

    return { ...catalog, providers: providersResult };
  }

  async function refreshCatalog(): Promise<
    AggregatedCatalog & { providers: ListProvidersResult }
  > {
    refreshQueued = true;
    if (!refreshShared) {
      refreshShared = (async () => {
        let result!: AggregatedCatalog & { providers: ListProvidersResult };
        try {
          while (refreshQueued) {
            refreshQueued = false;
            result = await refreshCatalogOnce();
          }
          return result;
        } finally {
          refreshShared = undefined;
        }
      })();
    }
    return refreshShared;
  }

  async function listToolsForMcp(): Promise<ToolCatalogEntry[]> {
    await refreshCatalog();
    maybeAutoClearSelection();
    return [...exposedBusinessTools(), ...HUB_META_TOOLS];
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    await refreshCatalog();
    maybeAutoClearSelection();

    if (name === 'at_list_providers') {
      touchSelectionActivity();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(providersResult, null, 2)
          }
        ]
      };
    }

    if (name === 'at_search_tools') {
      touchSelectionActivity();
      const query = args.query;
      if (typeof query !== 'string' || query.trim() === '') {
        return errorText('VALIDATION_ERROR', 'query must be a non-empty string');
      }
      if (
        args.pluginId !== undefined &&
        (typeof args.pluginId !== 'string' || args.pluginId.trim() === '')
      ) {
        return errorText('VALIDATION_ERROR', 'pluginId must be a non-empty string');
      }
      if (
        args.limit !== undefined &&
        (typeof args.limit !== 'number' || !Number.isFinite(args.limit))
      ) {
        return errorText('VALIDATION_ERROR', 'limit must be a finite number');
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              searchTools(catalogToolRefs(), {
                query,
                pluginId: args.pluginId as string | undefined,
                limit: (args.limit as number | undefined) ?? 20
              })
            )
          }
        ]
      };
    }

    if (name === 'at_get_tool') {
      touchSelectionActivity();
      if (typeof args.name !== 'string' || args.name.trim() === '') {
        return errorText('VALIDATION_ERROR', 'name must be a non-empty string');
      }
      const ref = catalogToolRefs().find(({ entry }) => entry.name === args.name);
      if (!ref) {
        return errorText('NOT_FOUND', `Unknown tool: ${args.name}`);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...ref.entry, pluginId: ref.pluginId })
          }
        ]
      };
    }

    if (name === 'at_select_tools') {
      const selectionArgs: SelectToolsArgs = {
        pluginIds: args.pluginIds as string[] | undefined,
        names: args.names as string[] | undefined,
        mode: args.mode as string | undefined
      };
      if (
        (selectionArgs.pluginIds !== undefined &&
          (!Array.isArray(selectionArgs.pluginIds) ||
            selectionArgs.pluginIds.some(
              (pluginId) =>
                typeof pluginId !== 'string' || pluginId.trim() === ''
            ))) ||
        (selectionArgs.names !== undefined &&
          (!Array.isArray(selectionArgs.names) ||
            selectionArgs.names.some(
              (toolName) => typeof toolName !== 'string' || toolName.trim() === ''
            )))
      ) {
        return errorText(
          'VALIDATION_ERROR',
          'pluginIds and names must contain only non-empty strings'
        );
      }
      if (
        selectionArgs.mode !== undefined &&
        selectionArgs.mode !== 'add' &&
        selectionArgs.mode !== 'replace'
      ) {
        return errorText(
          'VALIDATION_ERROR',
          'mode must be either "add" or "replace"'
        );
      }
      if (
        (selectionArgs.pluginIds?.length ?? 0) === 0 &&
        (selectionArgs.names?.length ?? 0) === 0
      ) {
        return errorText(
          'VALIDATION_ERROR',
          'at_select_tools requires pluginIds and/or names'
        );
      }
      const refs = catalogToolRefs();
      const result = resolveSelectTools({
        args: selectionArgs,
        previousSelected: selectedToolNames,
        toolsByPluginId: buildToolsByPluginId(refs),
        allToolNames: new Set(refs.map(({ entry }) => entry.name))
      });
      selectedToolNames = new Set(result.selected);
      businessCallsSinceSelect = 0;
      touchSelectionActivity();
      const exposedBusinessToolCount = exposedBusinessTools().length;
      notifyExposedToolsChanged();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...result, exposedBusinessToolCount })
          }
        ]
      };
    }

    if (name === 'at_clear_tool_selection') {
      clearSelection('manual');
      return {
        content: [{ type: 'text', text: JSON.stringify({ selected: [] }) }]
      };
    }

    const winner = catalog.winners.get(name);
    if (!winner) {
      return errorText('NOT_FOUND', `Unknown tool: ${name}`);
    }

    businessCallsSinceSelect += 1;
    touchSelectionActivity();

    const ordered = orderBridgesForTool(name, winner.bridges);
    if (ordered.length === 0) {
      maybeAutoClearSelection();
      return errorText('NOT_FOUND', `No healthy bridge for tool: ${name}`);
    }

    const maxAttempts = Math.min(ordered.length, 2);
    let lastTransportError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const bridge = ordered[attempt]!;
      try {
        const response = await bridgeInvoke(bridge.record, {
          name,
          arguments: args
        });

        if ('error' in response) {
          maybeAutoClearSelection();
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
            isError: true
          };
        }

        maybeAutoClearSelection();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.result)
            }
          ]
        };
      } catch (err) {
        lastTransportError = err;
      }
    }

    maybeAutoClearSelection();

    if (lastTransportError instanceof BridgeHttpError) {
      return errorText(lastTransportError.code, lastTransportError.message);
    }

    const message =
      lastTransportError instanceof Error
        ? lastTransportError.message
        : 'Bridge invoke failed';
    return errorText('UNAVAILABLE', message);
  }

  async function close(): Promise<void> {
    closed = true;
    registryWatch?.close();
    registryWatch = undefined;
    if (healthTimer !== undefined) {
      clearInterval(healthTimer);
      healthTimer = undefined;
    }
  }

  // Establish fingerprint baseline before watch/timers so startup is quiet.
  await refreshCatalog();

  registryWatch = watchBridgeRegistry({
    hostApp: options.hostApp,
    home: options.home,
    onChange: () => {
      if (closed) {
        return;
      }
      void refreshCatalog();
    }
  });

  healthTimer = setInterval(() => {
    if (closed) {
      return;
    }
    void refreshCatalog();
  }, HEALTH_REFRESH_INTERVAL_MS);
  // Allow process exit while the timer is the only live handle (tests / short runs).
  healthTimer.unref?.();

  return {
    refreshCatalog,
    listToolsForMcp,
    callTool,
    close
  };
}
