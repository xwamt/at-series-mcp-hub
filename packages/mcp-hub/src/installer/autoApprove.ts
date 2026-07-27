import {
  HUB_BUILTIN_TOOL_NAMES,
  isAutoApproveRisk,
  normalizeToolRisk,
  type ToolCatalogEntry
} from '../protocol/index';

/**
 * Default MCP autoApprove list: builtins (e.g. at_list_providers) plus
 * registry tools whose normalized risk is `read`.
 * Missing/invalid risk fails closed via normalizeToolRisk → exec.
 */
export function defaultAutoApproveToolNames(input: {
  builtin?: string[];
  registryTools: ToolCatalogEntry[];
}): string[] {
  const builtins = input.builtin ?? [...HUB_BUILTIN_TOOL_NAMES];
  const reads = input.registryTools
    .filter((t) => isAutoApproveRisk(normalizeToolRisk(t.risk)))
    .map((t) => t.name);
  return [...builtins, ...reads];
}
