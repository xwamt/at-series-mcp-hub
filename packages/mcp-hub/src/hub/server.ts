import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuditLogger } from '../audit/logger';
import type { AuditRecord, AuditStatus } from '../audit/types';
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
  ToolDiscoveryMode,
  ToolRisk
} from '../protocol/index';
import {
  AT_SERIES_TOOL_DISCOVERY_ENV,
  AT_SERIES_TOOL_DISCOVERY_THRESHOLD_ENV,
  AT_SERIES_TOOL_SELECTION_IDLE_MS_ENV,
  AT_SERIES_TOOL_SELECTION_MAX_CALLS_ENV,
  normalizeToolRisk
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
import { describeError, hubLog } from './logger';
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
  'Selection filters tools/list only; it is not an ACL.';

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

/** `tools/list` reuses memory when a refresh completed within this window (v1 §8.4, D12). */
const LIST_REFRESH_TTL_MS = 2000;
/** On-demand passes skip bridges whose last probe failure is newer than this (v1 §8.4). */
const UNHEALTHY_BACKOFF_MS = 4000;
/** Timer passes skip re-probing a healthy bridge probed successfully within this window (v1 §8.4). */
const HEALTHY_REPROBE_MS = 15_000;
/** Registry records whose `updatedAt` is older than this are stale (v1 §5): no HTTP. */
const STALE_RECORD_MS = 90_000;
/** Selected names missing from the winner set are retained this long (v2 §4). */
const SELECTION_WINNER_GRACE_MS = 15_000;
/** Periodic tick (v1 §8.4: failed bridges every tick; healthy gated by HEALTHY_REPROBE_MS). */
const SCHEDULED_TICK_MS = 5000;

/** What triggered a catalog refresh; decides which bridges get an HTTP probe. */
export type HubRefreshReason = 'startup' | 'timer' | 'watch' | 'demand';

/**
 * Coalesced callers share one trailing pass; the strongest queued reason wins
 * so a watch-driven full probe is never downgraded by a concurrent timer tick.
 */
const REFRESH_REASON_RANK: Record<HubRefreshReason, number> = {
  timer: 0,
  demand: 1,
  startup: 2,
  watch: 2
};

export type HubRuntime = {
  refreshCatalog: (options?: { reason?: HubRefreshReason }) => Promise<
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

type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function auditErrorFromResult(
  result: CallToolResult
): { code: string; message: string } | undefined {
  if (result.isError !== true) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(result.content[0]?.text ?? '');
    const err =
      parsed && typeof parsed === 'object'
        ? (parsed as { error?: { code?: unknown; message?: unknown } }).error
        : undefined;
    if (
      err &&
      typeof err.code === 'string' &&
      typeof err.message === 'string'
    ) {
      // Raw message on purpose: redaction runs on the async audit write path
      // (AuditLogger), never on the MCP response path (v1 §3.4).
      return { code: err.code, message: err.message };
    }
  } catch {
    // Fall through to a generic error.
  }
  return { code: 'INTERNAL_ERROR', message: 'Tool call failed' };
}

function auditStatusFromResult(result: CallToolResult): AuditStatus {
  const err = auditErrorFromResult(result);
  if (result.isError !== true) {
    return 'success';
  }
  switch (err?.code) {
    case 'USER_CANCELLED':
      return 'cancelled';
    case 'NOT_FOUND':
      return 'not_found';
    case 'VALIDATION_ERROR':
      return 'validation_error';
    case 'UNAVAILABLE':
      return 'unavailable';
    default:
      return 'error';
  }
}

/**
 * v1 §8.3.6: NOT_FOUND — or a VALIDATION_ERROR shaped like "this window does
 * not own that tool/target" — from one bridge SHOULD be retried on the next
 * same-pluginId bridge. Every other structured error (USER_CANCELLED, real
 * argument validation, ...) is final and returns immediately.
 */
function shouldFailoverOnBridgeError(error: {
  code: string;
  message: string;
}): boolean {
  if (error.code === 'NOT_FOUND') {
    return true;
  }
  if (error.code !== 'VALIDATION_ERROR') {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('unknown tool') ||
    message.includes('unknown target') ||
    message.includes('target unknown') ||
    message.includes('target-unknown') ||
    message.includes('no such tool') ||
    message.includes('no such target') ||
    message.includes('not found')
  );
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
  /** Override the 15s selection winner grace window (tests). */
  selectionWinnerGraceMs?: number;
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
  const selectionWinnerGraceMs =
    options.selectionWinnerGraceMs ?? SELECTION_WINNER_GRACE_MS;
  const auditLogger = AuditLogger.fromEnv({
    home: options.home ?? os.homedir(),
    hostApp: options.hostApp
  });
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
  /** Selected name → when it first went missing from the winner set (v2 §4 grace). */
  const selectedMissingSince = new Map<string, number>();
  let lastSelectionActivityAt: number | undefined;
  let businessCallsSinceSelect = 0;
  let closed = false;
  let registryWatch: WatchBridgeRegistryHandle | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;

  /** Unix ms of the last completed refresh pass; `0` until the baseline lands. */
  let lastSuccessRefreshAt = 0;
  /** bridgeId → last successful /health probe (drives HEALTHY_REPROBE_MS skips). */
  const lastSuccessAt = new Map<string, number>();
  /** bridgeId → last probe/invoke transport failure (drives UNHEALTHY_BACKOFF_MS skips). */
  const lastFailureAt = new Map<string, number>();

  /** Shared in-flight refresh; coalesces concurrent callers onto one trailing pass. */
  let refreshShared:
    | Promise<AggregatedCatalog & { providers: ListProvidersResult }>
    | undefined;
  let queuedReason: HubRefreshReason | undefined;

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
    selectedMissingSince.clear();
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

  /**
   * v2 §4 grace: a selected name that lost its winner is retained for
   * `selectionWinnerGraceMs` of continuous absence. tools/list only ever
   * exposes `selected ∩ current winners`, so retention never leaks a dead
   * tool; when the winner returns inside the window it is exposed again
   * without a new at_select_tools.
   */
  function reconcileSelection(now: number): void {
    const winnerNames = new Set(catalog.winners.keys());
    for (const name of [...selectedToolNames]) {
      if (winnerNames.has(name)) {
        selectedMissingSince.delete(name);
        continue;
      }
      const since = selectedMissingSince.get(name) ?? now;
      if (now - since >= selectionWinnerGraceMs) {
        selectedToolNames.delete(name);
        selectedMissingSince.delete(name);
      } else {
        selectedMissingSince.set(name, since);
      }
    }
    for (const name of [...selectedMissingSince.keys()]) {
      if (!selectedToolNames.has(name)) {
        selectedMissingSince.delete(name);
      }
    }
    if (selectedToolNames.size === 0) {
      businessCallsSinceSelect = 0;
      lastSelectionActivityAt = undefined;
    }
  }

  /** Re-derive catalog / providers / selection / fingerprint from bridge state. */
  function rebuildDerivedState(now: number): void {
    catalog = aggregateTools(healthyBridges);
    providersResult = buildListProvidersResult({
      hostApp,
      hubVersion: options.hubVersion,
      healthy: healthyBridges,
      unhealthy: unhealthyBridges,
      conflicts: catalog.conflicts
    });
    reconcileSelection(now);
    notifyExposedToolsChanged();
  }

  /**
   * v1 §8.3.5: an invoke transport failure demotes the bridge in memory
   * immediately — the next tools/list and at_list_providers see it unhealthy
   * without waiting for the periodic re-probe.
   */
  function demoteBridgeAfterTransportFailure(failed: HealthyBridge): void {
    const now = Date.now();
    lastFailureAt.set(failed.record.bridgeId, now);
    const index = healthyBridges.findIndex(
      (b) => b.record.bridgeId === failed.record.bridgeId
    );
    if (index === -1) {
      return; // A concurrent refresh already rebuilt the pool.
    }
    healthyBridges = [
      ...healthyBridges.slice(0, index),
      ...healthyBridges.slice(index + 1)
    ];
    unhealthyBridges = [
      ...unhealthyBridges,
      { record: failed.record, status: 'unhealthy' }
    ];
    rebuildDerivedState(now);
  }

  async function refreshCatalogOnce(reason: HubRefreshReason): Promise<
    AggregatedCatalog & { providers: ListProvidersResult }
  > {
    const records = await listBridgeRecords({
      hostApp: options.hostApp,
      home: options.home
    });
    const passStartedAt = Date.now();
    const cachedHealthy = new Map(
      healthyBridges.map((bridge) => [bridge.record.bridgeId, bridge])
    );

    type ProbeResult =
      | { kind: 'healthy'; entry: HealthyBridge }
      | { kind: 'unhealthy'; entry: UnhealthyBridgeInput };

    // Safe to Promise.all: each probe converts its own failure into
    // `unhealthy`, so no element can reject.
    const probes = await Promise.all(
      records.map(async (record): Promise<ProbeResult> => {
        const bridgeId = record.bridgeId;

        // v1 §5: three missed heartbeats — no HTTP, listed unhealthy, no tools.
        if (passStartedAt - record.updatedAt > STALE_RECORD_MS) {
          return { kind: 'unhealthy', entry: { record, status: 'unhealthy' } };
        }

        const lastFailure = lastFailureAt.get(bridgeId);
        const lastSuccess = lastSuccessAt.get(bridgeId);

        // Negative cache (v1 §8.4): an on-demand pass must not re-pay a probe
        // timeout for a bridge that just failed; the timer still re-probes it.
        if (
          reason === 'demand' &&
          lastFailure !== undefined &&
          passStartedAt - lastFailure < UNHEALTHY_BACKOFF_MS
        ) {
          const cached = cachedHealthy.get(bridgeId);
          return cached
            ? { kind: 'healthy', entry: { ...cached, record } }
            : { kind: 'unhealthy', entry: { record, status: 'unhealthy' } };
        }

        // Timer passes skip healthy bridges probed successfully within 15s
        // (v1 §8.4) — the 5s tick then only costs HTTP for failed bridges.
        if (
          reason === 'timer' &&
          lastSuccess !== undefined &&
          passStartedAt - lastSuccess < HEALTHY_REPROBE_MS &&
          (lastFailure === undefined || lastFailure <= lastSuccess)
        ) {
          const cached = cachedHealthy.get(bridgeId);
          if (cached) {
            return { kind: 'healthy', entry: { ...cached, record } };
          }
          // No memory snapshot to reuse — fall through to a real probe.
        }

        // v1 §8.2: health and tools go out concurrently for one bridge; the
        // tools bytes are adopted only when health succeeded.
        const [healthOutcome, toolsOutcome] = await Promise.allSettled([
          bridgeGetHealth(record),
          bridgeGetTools(record)
        ]);

        if (healthOutcome.status === 'rejected') {
          lastFailureAt.set(bridgeId, Date.now());
          return { kind: 'unhealthy', entry: { record, status: 'unhealthy' } };
        }
        lastSuccessAt.set(bridgeId, Date.now());
        lastFailureAt.delete(bridgeId);

        let tools =
          toolsOutcome.status === 'fulfilled'
            ? toolsOutcome.value.tools
            : record.tools;
        // Hub builtins are reserved: they never become Bridge routing winners.
        tools = tools.filter(({ name }) => !META_TOOL_NAMES.has(name));

        return {
          kind: 'healthy',
          entry: {
            record,
            tools,
            connectedTargets: connectedTargetsForBridge(
              healthOutcome.value,
              record
            )
          }
        };
      })
    );

    // Rebuild in registry order, not completion order: aggregateTools uses
    // this ordering to break conflict ties, so a race here would make the
    // exposed tool set flap between refreshes.
    const nextHealthy: HealthyBridge[] = [];
    const nextUnhealthy: UnhealthyBridgeInput[] = [];
    for (const probe of probes) {
      if (probe.kind === 'healthy') {
        nextHealthy.push(probe.entry);
      } else {
        nextUnhealthy.push(probe.entry);
      }
    }

    healthyBridges = nextHealthy;
    unhealthyBridges = nextUnhealthy;

    // Probe history for unregistered bridges is dead weight; drop it.
    const liveIds = new Set(records.map((record) => record.bridgeId));
    for (const id of [...lastSuccessAt.keys()]) {
      if (!liveIds.has(id)) {
        lastSuccessAt.delete(id);
      }
    }
    for (const id of [...lastFailureAt.keys()]) {
      if (!liveIds.has(id)) {
        lastFailureAt.delete(id);
      }
    }

    rebuildDerivedState(Date.now());
    maybeAutoClearSelection();

    // Any completed pass refreshes the tools/list TTL: skip/reuse decisions
    // above still reflected the registry read, and watch deletions arrive as
    // full-probe 'watch' passes anyway.
    lastSuccessRefreshAt = Date.now();

    return { ...catalog, providers: providersResult };
  }

  async function refreshCatalog(refreshOptions?: {
    reason?: HubRefreshReason;
  }): Promise<AggregatedCatalog & { providers: ListProvidersResult }> {
    const reason = refreshOptions?.reason ?? 'demand';
    if (
      queuedReason === undefined ||
      REFRESH_REASON_RANK[reason] > REFRESH_REASON_RANK[queuedReason]
    ) {
      queuedReason = reason;
    }
    if (!refreshShared) {
      refreshShared = (async () => {
        let result!: AggregatedCatalog & { providers: ListProvidersResult };
        try {
          while (queuedReason !== undefined) {
            const passReason = queuedReason;
            queuedReason = undefined;
            try {
              result = await refreshCatalogOnce(passReason);
            } catch (err) {
              // A broken registry read must not kill the Hub process. Keep the
              // previous catalog so already-discovered tools stay routable.
              hubLog.error(`catalog refresh failed: ${describeError(err)}`);
              result = { ...catalog, providers: providersResult };
            }
          }
          return result;
        } finally {
          refreshShared = undefined;
        }
      })();
    }
    return refreshShared;
  }

  /**
   * Cold start only (v1 §8.1): the silent background baseline may still be in
   * flight; awaiting it keeps the very first list/call correct. After the
   * first completed pass this is a no-op.
   */
  async function awaitBaseline(): Promise<void> {
    if (lastSuccessRefreshAt !== 0) {
      return;
    }
    await (refreshShared ?? refreshCatalog({ reason: 'demand' }));
  }

  async function listToolsForMcp(): Promise<ToolCatalogEntry[]> {
    maybeAutoClearSelection();
    if (refreshShared) {
      // v1 §8.4: pending FS events / an in-flight pass must be visible to
      // this list, so a just-deleted registry file cannot resurrect tools.
      await refreshShared;
    } else if (
      lastSuccessRefreshAt === 0 ||
      Date.now() - lastSuccessRefreshAt > LIST_REFRESH_TTL_MS
    ) {
      await refreshCatalog({ reason: 'demand' });
    }
    maybeAutoClearSelection();
    return [...exposedBusinessTools(), ...HUB_META_TOOLS];
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> {
    maybeAutoClearSelection();
    await awaitBaseline();

    if (name === 'at_list_providers') {
      touchSelectionActivity();
      return {
        content: [
          {
            type: 'text',
            // Compact JSON (v2 §3.1): pretty-printing only inflated the
            // context every provider listing pays for.
            text: JSON.stringify(providersResult)
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
      for (const missing of [...selectedMissingSince.keys()]) {
        if (!selectedToolNames.has(missing)) {
          selectedMissingSince.delete(missing);
        }
      }
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

    const started = Date.now();
    const traceId = `at-trace-${randomUUID()}`;
    let attemptCount = 0;
    let lastBridgeId: string | undefined;
    let pluginId: string | undefined;
    let risk: ToolRisk | undefined;
    let result: CallToolResult | undefined;

    try {
      // v1 §8.3.1: route from memory; one on-demand refresh only on a miss.
      let winner = catalog.winners.get(name);
      if (!winner) {
        await refreshCatalog({ reason: 'demand' });
        winner = catalog.winners.get(name);
      }
      if (!winner) {
        result = errorText('NOT_FOUND', `Unknown tool: ${name}`);
        return result;
      }
      pluginId = winner.pluginId;
      const entry = catalog.tools.find((tool) => tool.name === name);
      risk = normalizeToolRisk(entry?.risk);

      businessCallsSinceSelect += 1;
      touchSelectionActivity();

      const ordered = orderBridgesForTool(name, winner.bridges);
      if (ordered.length === 0) {
        result = errorText('NOT_FOUND', `No healthy bridge for tool: ${name}`);
        return result;
      }

      const maxAttempts = Math.min(ordered.length, 2);
      let lastTransportError: unknown;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const bridge = ordered[attempt]!;
        attemptCount += 1;
        lastBridgeId = bridge.record.bridgeId;
        try {
          const response = await bridgeInvoke(bridge.record, {
            name,
            arguments: args
          });

          if ('error' in response) {
            if (
              attempt < maxAttempts - 1 &&
              shouldFailoverOnBridgeError(response.error)
            ) {
              continue;
            }
            result = {
              content: [{ type: 'text', text: JSON.stringify(response) }],
              isError: true
            };
            return result;
          }

          result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.result)
              }
            ]
          };
          return result;
        } catch (err) {
          lastTransportError = err;
          demoteBridgeAfterTransportFailure(bridge);
        }
      }

      if (lastTransportError instanceof BridgeHttpError) {
        result = errorText(lastTransportError.code, lastTransportError.message);
        return result;
      }

      const message =
        lastTransportError instanceof Error
          ? lastTransportError.message
          : 'Bridge invoke failed';
      result = errorText('UNAVAILABLE', message);
      return result;
    } finally {
      // Completion counts as selection activity even after a long
      // confirmation dialog (v2 §4.1); evaluate auto-clear only after it.
      touchSelectionActivity();
      maybeAutoClearSelection();

      const finished =
        result ?? errorText('INTERNAL_ERROR', 'Tool call failed');
      const error = auditErrorFromResult(finished);
      const record: AuditRecord = {
        traceId,
        timestamp: new Date().toISOString(),
        hostApp: options.hostApp,
        hubPid: process.pid,
        pluginId,
        bridgeId: lastBridgeId,
        toolName: name,
        risk,
        attemptCount,
        durationMs: Math.max(0, Date.now() - started),
        status: auditStatusFromResult(finished),
        error,
        // Raw values on purpose: redaction and truncation run on the async
        // audit write path inside AuditLogger, never on the MCP response
        // path (v1 §3.4).
        params: args,
        responseSummary: {
          isError: finished.isError === true,
          preview: finished.content[0]?.text ?? ''
        }
      };
      try {
        auditLogger.log(record);
      } catch (err) {
        hubLog.error(`audit log failed: ${describeError(err)}`);
      }
    }
  }

  async function close(): Promise<void> {
    closed = true;
    registryWatch?.close();
    registryWatch = undefined;
    if (healthTimer !== undefined) {
      clearInterval(healthTimer);
      healthTimer = undefined;
    }
    await auditLogger.close();
  }

  try {
    registryWatch = watchBridgeRegistry({
      hostApp: options.hostApp,
      home: options.home,
      onChange: () => {
        if (closed) {
          return;
        }
        void refreshCatalog({ reason: 'watch' }).catch((err) => {
          hubLog.error(`registry watch refresh failed: ${describeError(err)}`);
        });
      }
    });
  } catch (err) {
    // Installing the watch touches the filesystem too, so the same broken
    // registry path that fails a read can fail here. The health timer below
    // still drives refreshes; losing live change events is not fatal.
    hubLog.error(`registry watch unavailable: ${describeError(err)}`);
  }

  healthTimer = setInterval(() => {
    if (closed) {
      return;
    }
    void refreshCatalog({ reason: 'timer' }).catch((err) => {
      hubLog.error(`scheduled refresh failed: ${describeError(err)}`);
    });
  }, SCHEDULED_TICK_MS);
  // Allow process exit while the timer is the only live handle (tests / short runs).
  healthTimer.unref?.();

  // Silent background baseline (v1 §8.1): MCP initialize must never wait on
  // Bridge HTTP. The first list/call awaits this in-flight pass instead.
  void refreshCatalog({ reason: 'startup' }).catch((err) => {
    hubLog.error(`startup refresh failed: ${describeError(err)}`);
  });

  return {
    refreshCatalog,
    listToolsForMcp,
    callTool,
    close
  };
}
