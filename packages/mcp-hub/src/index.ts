/**
 * Public API for `@at-series/mcp-hub`.
 *
 * Plugin authors typically need: protocol types, FsBridgePublisher, syncHubBundle,
 * ensureAtSeriesMcpConfig / uninstallAtSeriesMcpConfig, and detectHostApp.
 * Do not pass defaultAutoApproveToolNames into the installer — autoApprove is Hub meta only.
 * Normative contract: docs/protocol/v1.md
 */

// --- protocol (types, constants, path helpers) ---
export * from './protocol/index';
export * from './protocol/paths';
export { createBridgeToken, timingSafeEqualToken } from './protocol/token';

// --- registry ---
export {
  listBridgeRecords,
  parseBridgeRegistryRecord,
  type ListBridgeRecordsOptions
} from './registry/read';
export {
  watchBridgeRegistry,
  type WatchBridgeRegistryHandle,
  type WatchBridgeRegistryOptions
} from './registry/watch';

// --- publisher / hub bundle election ---
export { FsBridgePublisher } from './publisher/BridgePublisher';
export { syncHubBundle } from './publisher/HubBundleSync';

// --- bridge HTTP client (Hub -> Bridge) ---
export {
  BridgeHttpError,
  bridgeGetHealth,
  bridgeGetTools,
  bridgeInvoke,
  type BridgeClientRecord,
  type BridgeRequestOptions
} from './bridgeClient/http';

// --- hub runtime / aggregation ---
export {
  aggregateTools,
  orderBridgesForTool,
  pickBridgeForTool,
  scoreBridge,
  type AggregatedCatalog,
  type HealthyBridge
} from './hub/aggregate';
export {
  buildListProvidersResult,
  type UnhealthyBridgeInput
} from './hub/listProviders';
export { createHubRuntime, type HubRuntime } from './hub/server';

// --- MCP config installer ---
export {
  defaultAutoApproveToolNames,
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig,
  stripLegacyAtMcpServers,
  isLegacyAtMcpServerEntry,
  LEGACY_AT_MCP_SERVER_NAMES,
  LEGACY_CONTINUE_YAML_FILENAMES,
  normalizeMcpPath,
  cursorMcpConfigPath,
  kiroMcpConfigPath,
  continueMcpConfigPath,
  buildAtSeriesMcpServerConfig,
  buildInstallerAtSeriesEnv,
  isSameAtSeriesMcpServerConfig,
  INSTALLER_TOOL_DISCOVERY_DEFAULT,
  INSTALLER_TOOL_DISCOVERY_THRESHOLD_DEFAULT,
  INSTALLER_TOOL_SELECTION_IDLE_MS_DEFAULT,
  INSTALLER_TOOL_SELECTION_MAX_CALLS_DEFAULT,
  type McpInstallerTarget,
  type EnsureAtSeriesMcpConfigInput,
  type UninstallAtSeriesMcpConfigInput,
  type AtSeriesMcpServerConfig,
  type AtSeriesMcpServerEnv
} from './installer/index';
