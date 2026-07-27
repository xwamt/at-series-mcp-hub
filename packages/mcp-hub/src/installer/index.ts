import type { HostApp, ToolCatalogEntry } from '../protocol/index';
import { defaultAutoApproveToolNames } from './autoApprove';
import {
  ensureCursorMcpConfig,
  uninstallCursorMcpConfig,
  cursorMcpConfigPath
} from './cursor';
import {
  ensureKiroMcpConfig,
  uninstallKiroMcpConfig,
  kiroMcpConfigPath
} from './kiro';
import {
  ensureContinueMcpConfig,
  uninstallContinueMcpConfig,
  continueMcpConfigPath
} from './continueYaml';
import {
  stripLegacyAtMcpServers,
  isLegacyAtMcpServerEntry,
  LEGACY_AT_MCP_SERVER_NAMES,
  LEGACY_CONTINUE_YAML_FILENAMES,
  normalizeMcpPath
} from './migrate';

export type McpInstallerTarget = 'cursor' | 'kiro' | 'continue';

export type EnsureAtSeriesMcpConfigInput = {
  target: McpInstallerTarget;
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  home?: string;
  /** Required when target is `continue`. */
  workspaceFolder?: string;
  registryTools?: ToolCatalogEntry[];
};

export type UninstallAtSeriesMcpConfigInput = {
  target: McpInstallerTarget;
  home?: string;
  /** Required when target is `continue`. */
  workspaceFolder?: string;
};

/**
 * Write/repair the single `AT Series` MCP server entry for Cursor, Kiro, or Continue.
 * Migrates legacy AT Terminal / JumpServer entries first. Idempotent.
 */
export async function ensureAtSeriesMcpConfig(
  input: EnsureAtSeriesMcpConfigInput
): Promise<{ updated: boolean }> {
  switch (input.target) {
    case 'cursor':
      return ensureCursorMcpConfig({
        hostApp: input.hostApp,
        hubJsAbsolutePath: input.hubJsAbsolutePath,
        home: input.home,
        registryTools: input.registryTools
      });
    case 'kiro':
      return ensureKiroMcpConfig({
        hostApp: input.hostApp,
        hubJsAbsolutePath: input.hubJsAbsolutePath,
        home: input.home,
        registryTools: input.registryTools
      });
    case 'continue': {
      if (!input.workspaceFolder) {
        throw new Error(
          'workspaceFolder is required when ensuring Continue MCP config'
        );
      }
      return ensureContinueMcpConfig({
        hostApp: input.hostApp,
        hubJsAbsolutePath: input.hubJsAbsolutePath,
        workspaceFolder: input.workspaceFolder,
        registryTools: input.registryTools
      });
    }
    default: {
      const _exhaustive: never = input.target;
      throw new Error(`Unsupported MCP installer target: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Remove only the `AT Series` MCP entry (or Continue `at-series.yaml`).
 * Does not touch third-party servers or hub.js.
 */
export async function uninstallAtSeriesMcpConfig(
  input: UninstallAtSeriesMcpConfigInput
): Promise<{ removed: boolean }> {
  switch (input.target) {
    case 'cursor':
      return uninstallCursorMcpConfig({ home: input.home });
    case 'kiro':
      return uninstallKiroMcpConfig({ home: input.home });
    case 'continue': {
      if (!input.workspaceFolder) {
        throw new Error(
          'workspaceFolder is required when uninstalling Continue MCP config'
        );
      }
      return uninstallContinueMcpConfig({
        workspaceFolder: input.workspaceFolder
      });
    }
    default: {
      const _exhaustive: never = input.target;
      throw new Error(`Unsupported MCP installer target: ${String(_exhaustive)}`);
    }
  }
}

export {
  defaultAutoApproveToolNames,
  stripLegacyAtMcpServers,
  isLegacyAtMcpServerEntry,
  LEGACY_AT_MCP_SERVER_NAMES,
  LEGACY_CONTINUE_YAML_FILENAMES,
  normalizeMcpPath,
  cursorMcpConfigPath,
  kiroMcpConfigPath,
  continueMcpConfigPath,
  ensureCursorMcpConfig,
  uninstallCursorMcpConfig,
  ensureKiroMcpConfig,
  uninstallKiroMcpConfig,
  ensureContinueMcpConfig,
  uninstallContinueMcpConfig
};
