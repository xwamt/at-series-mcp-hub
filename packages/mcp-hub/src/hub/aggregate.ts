import type {
  BridgeRegistryRecord,
  ToolCatalogEntry
} from '../protocol/index';

export type HealthyBridge = {
  record: BridgeRegistryRecord;
  /** Live catalog from GET /tools (or registry fallback). */
  tools: ToolCatalogEntry[];
  connectedTargets: number;
};

export type AggregatedCatalog = {
  /** Winning tools only — does NOT include at_list_providers (caller adds). */
  tools: ToolCatalogEntry[];
  /** toolName → winning pluginId + candidate bridges (same pluginId only). */
  winners: Map<string, { pluginId: string; bridges: HealthyBridge[] }>;
  conflicts: Array<{
    name: string;
    winnerPluginId: string;
    loserPluginIds: string[];
  }>;
};

/** Sort key: connectedTargets desc, then updatedAt desc. */
export function scoreBridge(b: HealthyBridge): [number, number] {
  return [b.connectedTargets, b.record.updatedAt];
}

function compareScoreDesc(a: HealthyBridge, b: HealthyBridge): number {
  const [aTargets, aUpdated] = scoreBridge(a);
  const [bTargets, bUpdated] = scoreBridge(b);
  if (bTargets !== aTargets) return bTargets - aTargets;
  return bUpdated - aUpdated;
}

function entryForTool(
  rankedBridges: HealthyBridge[],
  name: string
): ToolCatalogEntry | undefined {
  for (const b of rankedBridges) {
    const entry = b.tools.find((t) => t.name === name);
    if (entry) return entry;
  }
  return undefined;
}

/**
 * Aggregate healthy bridge catalogs per protocol §8.2:
 * collapse by (pluginId, name); cross-pluginId name conflicts resolved by
 * best-bridge (connectedTargets desc, updatedAt desc).
 */
export function aggregateTools(
  healthyBridges: HealthyBridge[]
): AggregatedCatalog {
  // pluginId → toolName → bridges that advertise it
  const byPlugin = new Map<
    string,
    Map<string, HealthyBridge[]>
  >();

  for (const bridge of healthyBridges) {
    const pluginId = bridge.record.pluginId;
    let toolMap = byPlugin.get(pluginId);
    if (!toolMap) {
      toolMap = new Map();
      byPlugin.set(pluginId, toolMap);
    }
    const seenNames = new Set<string>();
    for (const entry of bridge.tools) {
      if (seenNames.has(entry.name)) continue;
      seenNames.add(entry.name);
      const list = toolMap.get(entry.name) ?? [];
      list.push(bridge);
      toolMap.set(entry.name, list);
    }
  }

  // toolName → candidates from each pluginId
  const byName = new Map<
    string,
    Array<{ pluginId: string; bridges: HealthyBridge[] }>
  >();

  for (const [pluginId, toolMap] of byPlugin) {
    for (const [name, bridges] of toolMap) {
      const list = byName.get(name) ?? [];
      list.push({ pluginId, bridges });
      byName.set(name, list);
    }
  }

  const tools: ToolCatalogEntry[] = [];
  const winners = new Map<
    string,
    { pluginId: string; bridges: HealthyBridge[] }
  >();
  const conflicts: AggregatedCatalog['conflicts'] = [];

  // Each candidate's bridge list is sorted exactly once; the best bridge,
  // the winner's ordered bridge list, and the winning entry all reuse it.
  const rankedBridgesCache = new Map<HealthyBridge[], HealthyBridge[]>();
  const rankedBridgesOf = (bridges: HealthyBridge[]): HealthyBridge[] => {
    let ranked = rankedBridgesCache.get(bridges);
    if (!ranked) {
      ranked = [...bridges].sort(compareScoreDesc);
      rankedBridgesCache.set(bridges, ranked);
    }
    return ranked;
  };

  const names = [...byName.keys()].sort();
  for (const name of names) {
    const candidates = byName.get(name)!;
    // Rank pluginIds by their best bridge score
    const ranked = [...candidates].sort((a, b) =>
      compareScoreDesc(rankedBridgesOf(a.bridges)[0]!, rankedBridgesOf(b.bridges)[0]!)
    );
    const winner = ranked[0]!;
    const losers = ranked.slice(1);

    const winnerRanked = rankedBridgesOf(winner.bridges);
    winners.set(name, {
      pluginId: winner.pluginId,
      bridges: winnerRanked
    });

    const entry = entryForTool(winnerRanked, name);
    if (entry) tools.push(entry);

    if (losers.length > 0) {
      conflicts.push({
        name,
        winnerPluginId: winner.pluginId,
        loserPluginIds: losers.map((l) => l.pluginId)
      });
    }
  }

  return { tools, winners, conflicts };
}

/**
 * Rank healthy bridges that advertise `name` (same pluginId set),
 * preferred first — for failover (Task 9).
 */
export function orderBridgesForTool(
  name: string,
  bridges: HealthyBridge[]
): HealthyBridge[] {
  return bridges
    .filter((b) => b.tools.some((t) => t.name === name))
    .sort(compareScoreDesc);
}

/**
 * Pick the best healthy bridge for tool `name` under the winning pluginId.
 */
export function pickBridgeForTool(
  name: string,
  catalog: AggregatedCatalog,
  healthyBridges: HealthyBridge[]
): HealthyBridge | undefined {
  const winner = catalog.winners.get(name);
  if (!winner) return undefined;

  const candidates = healthyBridges.filter(
    (b) =>
      b.record.pluginId === winner.pluginId &&
      b.tools.some((t) => t.name === name)
  );
  if (candidates.length === 0) return undefined;
  return [...candidates].sort(compareScoreDesc)[0];
}
