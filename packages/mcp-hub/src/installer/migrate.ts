import { MCP_SERVER_DISPLAY_NAME } from '../protocol/index';

/** Legacy IDE MCP server keys written by per-plugin installers. */
export const LEGACY_AT_MCP_SERVER_NAMES = [
  'AT Terminal',
  'AT JumpServer Terminal'
] as const;

const LEGACY_NAME_SET = new Set<string>(LEGACY_AT_MCP_SERVER_NAMES);

/** Path hints that identify AT Terminal / JumpServer per-plugin mcp-server.js. */
const AT_MCP_SERVER_PATH_HINT =
  /(?:^|[\\/])(?:local\.)?(?:at[-.]terminal|at[-.]jumpserver(?:[-.]terminal)?|jumpserver[-.]?(?:terminal|plugins)?)(?:[\\/\-_.]|$)/i;

export function normalizeMcpPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Detect legacy AT Series MCP entries by known server name or AT-style
 * `mcp-server.js` args. Never treats `AT Series` as legacy.
 */
export function isLegacyAtMcpServerEntry(key: string, value: unknown): boolean {
  if (key === MCP_SERVER_DISPLAY_NAME) {
    return false;
  }
  if (LEGACY_NAME_SET.has(key)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (value.command !== 'node') {
    return false;
  }
  if (!Array.isArray(value.args)) {
    return false;
  }
  return value.args.some((arg) => {
    if (typeof arg !== 'string') {
      return false;
    }
    const normalized = normalizeMcpPath(arg);
    if (!normalized.endsWith('/mcp-server.js') && !normalized.endsWith('mcp-server.js')) {
      return false;
    }
    return AT_MCP_SERVER_PATH_HINT.test(normalized);
  });
}

/**
 * Strip legacy AT Terminal / JumpServer MCP entries from an mcpServers map.
 * Preserves unrelated third-party keys and the current `AT Series` entry.
 */
export function stripLegacyAtMcpServers(
  mcpServers: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mcpServers)) {
    if (isLegacyAtMcpServerEntry(key, value)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Continue YAML filenames previously written by per-plugin installers. */
export const LEGACY_CONTINUE_YAML_FILENAMES = [
  'at-terminal.yaml',
  'at-jumpserver-terminal.yaml'
] as const;
