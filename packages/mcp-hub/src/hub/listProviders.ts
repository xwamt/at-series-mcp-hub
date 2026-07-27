import {
  AT_SERIES_PROTOCOL_VERSION,
  type BridgeRegistryRecord,
  type HostApp,
  type ListProvidersResult
} from '../protocol/index';
import type { AggregatedCatalog, HealthyBridge } from './aggregate';

export type UnhealthyBridgeInput = {
  record: BridgeRegistryRecord;
  status?: 'unhealthy' | 'hubTooOld';
};

export function buildListProvidersResult(input: {
  hostApp: HostApp;
  hubVersion: string;
  healthy: HealthyBridge[];
  unhealthy?: UnhealthyBridgeInput[];
  conflicts: AggregatedCatalog['conflicts'];
  ignoredUnscopedBridgeCount?: number;
}): ListProvidersResult {
  type ProviderAcc = {
    pluginId: string;
    pluginDisplayName: string;
    pluginVersion?: string;
    bridges: ListProvidersResult['providers'][number]['bridges'];
    toolNames: Set<string>;
  };

  const byPlugin = new Map<string, ProviderAcc>();

  function ensureProvider(record: BridgeRegistryRecord): ProviderAcc {
    let acc = byPlugin.get(record.pluginId);
    if (!acc) {
      acc = {
        pluginId: record.pluginId,
        pluginDisplayName: record.pluginDisplayName,
        pluginVersion: record.pluginVersion,
        bridges: [],
        toolNames: new Set()
      };
      byPlugin.set(record.pluginId, acc);
    }
    return acc;
  }

  for (const bridge of input.healthy) {
    const acc = ensureProvider(bridge.record);
    acc.bridges.push({
      bridgeId: bridge.record.bridgeId,
      status: 'healthy',
      connectedTargets: bridge.connectedTargets,
      toolCount: bridge.tools.length,
      updatedAt: bridge.record.updatedAt,
      port: bridge.record.port
    });
    for (const t of bridge.tools) {
      acc.toolNames.add(t.name);
    }
  }

  for (const entry of input.unhealthy ?? []) {
    const status = entry.status ?? 'unhealthy';
    const acc = ensureProvider(entry.record);
    const tools = entry.record.tools ?? [];
    acc.bridges.push({
      bridgeId: entry.record.bridgeId,
      status,
      toolCount: tools.length,
      updatedAt: entry.record.updatedAt,
      port: entry.record.port,
      ...(typeof entry.record.capabilities?.connectedTargets === 'number'
        ? { connectedTargets: entry.record.capabilities.connectedTargets }
        : {})
    });
    for (const t of tools) {
      acc.toolNames.add(t.name);
    }
  }

  const providers = [...byPlugin.values()]
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId))
    .map((acc) => {
      const conflictNames = input.conflicts
        .filter(
          (c) =>
            c.winnerPluginId === acc.pluginId ||
            c.loserPluginIds.includes(acc.pluginId)
        )
        .map((c) => c.name)
        .sort();

      return {
        pluginId: acc.pluginId,
        pluginDisplayName: acc.pluginDisplayName,
        pluginVersion: acc.pluginVersion,
        bridges: acc.bridges,
        tools: [...acc.toolNames].sort(),
        conflicts: conflictNames
      };
    });

  return {
    hostApp: input.hostApp,
    hubVersion: input.hubVersion,
    protocolVersion: AT_SERIES_PROTOCOL_VERSION,
    providers,
    ignoredUnscopedBridgeCount: input.ignoredUnscopedBridgeCount ?? 0
  };
}
