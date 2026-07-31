import {
  HUB_BUILTIN_TOOL_NAMES,
  isAutoApproveRisk,
  normalizeToolRisk,
  type ToolCatalogEntry
} from '../protocol/index';

/**
 * Optional helper for building an autoApprove list: Hub builtins plus
 * registry tools whose normalized risk is `read`.
 *
 * IDE installers do **not** use this for business tools — they write
 * Hub meta-tools only via `buildAtSeriesMcpServerConfig`.
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
