import {
  DEFAULT_TOOL_DISCOVERY_THRESHOLD,
  DEFAULT_TOOL_SELECTION_IDLE_MS,
  DEFAULT_TOOL_SELECTION_MAX_CALLS,
  HUB_BUILTIN_TOOL_NAMES,
  type SelectToolsResult,
  type ToolCatalogEntry,
  type ToolDiscoveryMode,
  type ToolSearchHit
} from '../protocol/index';

export const META_TOOL_NAMES = new Set<string>(HUB_BUILTIN_TOOL_NAMES);

export type CatalogToolRef = {
  entry: ToolCatalogEntry;
  pluginId: string;
};

export type SelectToolsArgs = {
  pluginIds?: string[];
  names?: string[];
  mode?: string;
};

export type SelectToolsMode = 'replace' | 'add';

export type SelectToolsResolution = SelectToolsResult & {
  mode: SelectToolsMode;
};

export function parseToolDiscoveryMode(raw: unknown): ToolDiscoveryMode {
  return raw === 'auto' || raw === 'always' || raw === 'off' ? raw : 'auto';
}

export function parseToolDiscoveryThreshold(raw: unknown): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return DEFAULT_TOOL_DISCOVERY_THRESHOLD;
  }

  const threshold = Number(raw);
  return Number.isInteger(threshold) && threshold >= 0
    ? threshold
    : DEFAULT_TOOL_DISCOVERY_THRESHOLD;
}

/** Parse idle TTL ms. Empty/invalid → default; explicit `0` disables. */
export function parseToolSelectionIdleMs(raw: unknown): number {
  if (raw === undefined || raw === null) {
    return DEFAULT_TOOL_SELECTION_IDLE_MS;
  }
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0
      ? raw
      : DEFAULT_TOOL_SELECTION_IDLE_MS;
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return DEFAULT_TOOL_SELECTION_IDLE_MS;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_TOOL_SELECTION_IDLE_MS;
}

/** Parse max business calls. Empty/invalid → default; explicit `0` disables. */
export function parseToolSelectionMaxCalls(raw: unknown): number {
  if (raw === undefined || raw === null) {
    return DEFAULT_TOOL_SELECTION_MAX_CALLS;
  }
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0
      ? raw
      : DEFAULT_TOOL_SELECTION_MAX_CALLS;
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return DEFAULT_TOOL_SELECTION_MAX_CALLS;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_TOOL_SELECTION_MAX_CALLS;
}

export function shouldAutoClearSelection(input: {
  selectedCount: number;
  idleMs: number;
  maxCalls: number;
  businessCallsSinceSelect: number;
  lastActivityAt: number | undefined;
  now: number;
}): 'idle' | 'max_calls' | null {
  if (input.selectedCount === 0) {
    return null;
  }
  if (
    input.maxCalls > 0 &&
    input.businessCallsSinceSelect >= input.maxCalls
  ) {
    return 'max_calls';
  }
  if (
    input.idleMs > 0 &&
    input.lastActivityAt !== undefined &&
    input.now - input.lastActivityAt >= input.idleMs
  ) {
    return 'idle';
  }
  return null;
}

export function searchTools(
  catalog: CatalogToolRef[],
  options: { query: string; pluginId?: string; limit: number }
): ToolSearchHit[] {
  const query = options.query.toLowerCase();
  const limit = Number.isFinite(options.limit)
    ? Math.min(50, Math.max(1, options.limit))
    : 1;

  return catalog
    .filter(
      ({ entry, pluginId }) =>
        (options.pluginId === undefined || pluginId === options.pluginId) &&
        [entry.name, entry.title, entry.description].some((value) =>
          value.toLowerCase().includes(query)
        )
    )
    .slice(0, limit)
    .map(({ entry, pluginId }) => ({
      name: entry.name,
      title: entry.title,
      description: entry.description,
      risk: entry.risk,
      pluginId
    }));
}

export function buildToolsByPluginId(
  refs: CatalogToolRef[]
): Map<string, string[]> {
  const toolsByPluginId = new Map<string, string[]>();

  for (const { entry, pluginId } of refs) {
    const names = toolsByPluginId.get(pluginId) ?? [];
    if (!names.includes(entry.name)) {
      names.push(entry.name);
      toolsByPluginId.set(pluginId, names);
    }
  }

  return toolsByPluginId;
}

export function resolveSelectTools(input: {
  args: SelectToolsArgs;
  previousSelected: Iterable<string>;
  toolsByPluginId: ReadonlyMap<string, readonly string[]>;
  allToolNames: ReadonlySet<string>;
}): SelectToolsResolution {
  const mode: SelectToolsMode = input.args.mode === 'add' ? 'add' : 'replace';
  const previous = new Set(input.previousSelected);
  const pluginIds = input.args.pluginIds ?? [];
  const names = input.args.names ?? [];

  if (pluginIds.length === 0 && names.length === 0) {
    return selectionResult(previous, [], [], mode);
  }

  const selected = mode === 'add' ? previous : new Set<string>();
  const unknownPluginIds: string[] = [];
  const unknownNames: string[] = [];

  for (const pluginId of pluginIds) {
    const toolNames = input.toolsByPluginId.get(pluginId);
    if (!toolNames) {
      unknownPluginIds.push(pluginId);
      continue;
    }
    for (const name of toolNames) {
      selected.add(name);
    }
  }

  for (const name of names) {
    if (input.allToolNames.has(name)) {
      selected.add(name);
    } else {
      unknownNames.push(name);
    }
  }

  return selectionResult(selected, unknownNames, unknownPluginIds, mode);
}

export function computeExposedBusinessTools(input: {
  mode: ToolDiscoveryMode;
  threshold: number;
  businessTools: ToolCatalogEntry[];
  selectedNames: ReadonlySet<string>;
}): ToolCatalogEntry[] {
  const progressive =
    input.mode === 'always' ||
    (input.mode === 'auto' && input.businessTools.length > input.threshold);

  return progressive
    ? input.businessTools.filter((tool) => input.selectedNames.has(tool.name))
    : input.businessTools;
}

function selectionResult(
  selected: ReadonlySet<string>,
  unknownNames: string[],
  unknownPluginIds: string[],
  mode: SelectToolsMode
): SelectToolsResolution {
  const selectedNames = [...selected];
  return {
    selected: selectedNames,
    unknownNames,
    unknownPluginIds,
    exposedBusinessToolCount: selectedNames.length,
    mode
  };
}
