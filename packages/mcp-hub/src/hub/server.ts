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
  ToolCatalogEntry
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

const AT_LIST_PROVIDERS_TOOL: ToolCatalogEntry = {
  name: 'at_list_providers',
  title: 'List AT Series providers',
  description:
    'List registered AT Series plugin bridges and their tools for this IDE host.',
  risk: 'read',
  inputSchema: { type: 'object', properties: {} }
};

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
  /** Invoked when the aggregated tool-name set changes (after baseline). */
  onToolsListChanged?: () => void;
}): Promise<HubRuntime> {
  const hostApp = options.hostApp as HostApp;
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
  let closed = false;
  let registryWatch: WatchBridgeRegistryHandle | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;

  /** Shared in-flight refresh; coalesces concurrent callers onto one trailing pass. */
  let refreshShared:
    | Promise<AggregatedCatalog & { providers: ListProvidersResult }>
    | undefined;
  let refreshQueued = false;

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

    const nextFingerprint = catalogToolsFingerprint(catalog.tools);
    if (toolsFingerprint === undefined) {
      toolsFingerprint = nextFingerprint;
    } else if (nextFingerprint !== toolsFingerprint) {
      toolsFingerprint = nextFingerprint;
      try {
        options.onToolsListChanged?.();
      } catch {
        // Notification failures must not break catalog refresh.
      }
    }

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
    return [...catalog.tools, AT_LIST_PROVIDERS_TOOL];
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    await refreshCatalog();

    if (name === 'at_list_providers') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(providersResult, null, 2)
          }
        ]
      };
    }

    const winner = catalog.winners.get(name);
    if (!winner) {
      return errorText('NOT_FOUND', `Unknown tool: ${name}`);
    }

    const ordered = orderBridgesForTool(name, winner.bridges);
    if (ordered.length === 0) {
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
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
            isError: true
          };
        }

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
