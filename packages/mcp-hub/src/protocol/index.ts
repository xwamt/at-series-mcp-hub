/**
 * AT Series Hub Protocol v1 — typed contracts.
 * Normative prose: docs/protocol/v1.md
 *
 * This package intentionally has no vscode dependency.
 */

export const AT_SERIES_PROTOCOL_VERSION = 1 as const;

export const AT_SERIES_ROOT_DIRNAME = '.at-series';
export const AT_SERIES_MCP_DIRNAME = 'mcp';
export const AT_SERIES_BRIDGES_DIRNAME = 'bridges';
export const AT_SERIES_HUB_FILENAME = 'hub.js';
export const AT_SERIES_HUB_VERSION_FILENAME = 'hub-version.json';

/** Env var injected into IDE MCP server config. */
export const AT_SERIES_HOST_APP_ENV = 'AT_SERIES_HOST_APP';

/** Primary auth header Hub -> Bridge. */
export const AT_SERIES_TOKEN_HEADER = 'x-at-series-token';

/** Legacy headers Bridges may accept during migration. */
export const AT_SERIES_LEGACY_TOKEN_HEADERS = [
  'x-at-terminal-token',
  'x-at-jumpserver-terminal-token'
] as const;

export const BRIDGE_HOST = '127.0.0.1';
export const BRIDGE_MAX_BODY_BYTES = 2 * 1024 * 1024;

export const MCP_SERVER_DISPLAY_NAME = 'AT Series';

export const HUB_BUILTIN_TOOL_NAMES = ['at_list_providers'] as const;

export type HostApp =
  | 'vscode'
  | 'cursor'
  | 'kiro'
  | 'qoder'
  | 'windsurf'
  | 'continue'
  | 'unknown'
  | (string & {});

export type ToolRisk = 'read' | 'write' | 'exec';

export type BridgeErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'USER_CANCELLED'
  | 'INTERNAL_ERROR'
  | 'UNAVAILABLE';

/** JSON Schema object used as MCP tool inputSchema. */
export type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaObject;
  [key: string]: unknown;
};

export interface ToolCatalogEntry {
  name: string;
  title: string;
  description: string;
  risk: ToolRisk;
  inputSchema: JsonSchemaObject;
}

export interface BridgeEndpoints {
  health: string;
  tools: string;
  invoke: string;
}

export const DEFAULT_BRIDGE_ENDPOINTS: BridgeEndpoints = {
  health: '/health',
  tools: '/tools',
  invoke: '/invoke'
};

export interface BridgeRegistryRecord {
  protocolVersion: typeof AT_SERIES_PROTOCOL_VERSION | number;
  bridgeId: string;
  pluginId: string;
  pluginDisplayName: string;
  pluginVersion: string;
  hostApp: HostApp;
  port: number;
  token: string;
  pid: number;
  updatedAt: number;
  endpoints?: Partial<BridgeEndpoints>;
  tools: ToolCatalogEntry[];
  capabilities?: {
    connectedTargets?: number;
    [key: string]: unknown;
  };
}

export interface HubVersionRecord {
  version: string;
  protocolVersion: number;
  writtenByPluginId: string;
  writtenByPluginVersion: string;
  writtenAt: number;
  bundleSha256: string;
}

export interface BridgeErrorBody {
  error: {
    code: BridgeErrorCode | string;
    message: string;
    details?: unknown;
  };
}

export interface BridgeHealthResponse {
  ok: true;
  protocolVersion: number;
  bridgeId: string;
  pluginId: string;
  pluginDisplayName: string;
  pluginVersion: string;
  hostApp: HostApp;
  pid: number;
  updatedAt: number;
  connectedTargets?: number;
  toolCount?: number;
}

export interface BridgeToolsResponse {
  protocolVersion: number;
  tools: ToolCatalogEntry[];
}

export interface BridgeInvokeRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface BridgeInvokeSuccess {
  ok: true;
  name: string;
  result: unknown;
}

export type BridgeInvokeResponse = BridgeInvokeSuccess | BridgeErrorBody;

export interface ListProvidersResult {
  hostApp: HostApp;
  hubVersion: string;
  protocolVersion: number;
  providers: Array<{
    pluginId: string;
    pluginDisplayName: string;
    pluginVersion?: string;
    bridges: Array<{
      bridgeId: string;
      status: 'healthy' | 'unhealthy' | 'hubTooOld' | 'conflict';
      connectedTargets?: number;
      toolCount?: number;
      updatedAt?: number;
      port?: number;
    }>;
    tools: string[];
    conflicts: string[];
  }>;
  ignoredUnscopedBridgeCount: number;
}

export interface BridgePublisher {
  publish(record: BridgeRegistryRecord): Promise<void>;
  updateTools(tools: ToolCatalogEntry[]): Promise<void>;
  heartbeat(patch?: {
    updatedAt?: number;
    capabilities?: BridgeRegistryRecord['capabilities'];
  }): Promise<void>;
  unpublish(): Promise<void>;
}

export interface HubBundleSync {
  syncHubBundle(input: {
    version: string;
    bundlePath: string;
    pluginId: string;
    pluginVersion: string;
  }): Promise<{ updated: boolean; activeVersion: string }>;
}

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isToolRisk(value: unknown): value is ToolRisk {
  return value === 'read' || value === 'write' || value === 'exec';
}

/** Missing risk is treated as exec (fail closed). */
export function normalizeToolRisk(value: unknown): ToolRisk {
  return isToolRisk(value) ? value : 'exec';
}

export function isAutoApproveRisk(risk: ToolRisk): boolean {
  return risk === 'read';
}

export function resolveBridgeEndpoints(
  record: Pick<BridgeRegistryRecord, 'endpoints'>
): BridgeEndpoints {
  return {
    health: record.endpoints?.health ?? DEFAULT_BRIDGE_ENDPOINTS.health,
    tools: record.endpoints?.tools ?? DEFAULT_BRIDGE_ENDPOINTS.tools,
    invoke: record.endpoints?.invoke ?? DEFAULT_BRIDGE_ENDPOINTS.invoke
  };
}
