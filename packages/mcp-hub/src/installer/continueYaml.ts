import fs from 'node:fs/promises';
import path from 'node:path';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import {
  MCP_SERVER_DISPLAY_NAME,
  type HostApp,
  type ToolCatalogEntry
} from '../protocol/index';
import {
  buildAtSeriesMcpServerConfig,
  isSameAtSeriesMcpServerConfig,
  type AtSeriesMcpServerConfig
} from './serverConfig';
import { LEGACY_CONTINUE_YAML_FILENAMES } from './migrate';
import { atomicWriteFile, backupFileOnce } from '../fs/atomicWrite';
import { mcpConfigBackupPath, withMcpConfigLock } from './jsonConfigFile';

export function continueMcpConfigPath(workspaceFolder: string): string {
  return path.join(workspaceFolder, '.continue', 'mcpServers', 'at-series.yaml');
}

type ContinueYamlDoc = {
  name: string;
  version: string;
  schema: string;
  mcpServers: Array<
    AtSeriesMcpServerConfig & {
      name: string;
    }
  >;
};

function buildContinueDoc(server: AtSeriesMcpServerConfig): ContinueYamlDoc {
  return {
    name: MCP_SERVER_DISPLAY_NAME,
    version: '0.0.1',
    schema: 'v1',
    mcpServers: [
      {
        name: MCP_SERVER_DISPLAY_NAME,
        ...server
      }
    ]
  };
}

function parseContinueDoc(text: string): ContinueYamlDoc | undefined {
  try {
    const parsed = yamlLoad(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as ContinueYamlDoc;
  } catch {
    return undefined;
  }
}

function isSameContinueDoc(
  existing: ContinueYamlDoc | undefined,
  desired: ContinueYamlDoc
): boolean {
  if (!existing) {
    return false;
  }
  if (existing.name !== desired.name) {
    return false;
  }
  const existingServer = existing.mcpServers?.[0];
  const desiredServer = desired.mcpServers[0];
  if (!existingServer || existingServer.name !== desiredServer.name) {
    return false;
  }
  return isSameAtSeriesMcpServerConfig(existingServer, {
    command: desiredServer.command,
    args: desiredServer.args,
    env: desiredServer.env,
    autoApprove: desiredServer.autoApprove
  });
}

async function legacyContinueYamlsPresent(dir: string): Promise<boolean> {
  for (const name of LEGACY_CONTINUE_YAML_FILENAMES) {
    try {
      await fs.access(path.join(dir, name));
      return true;
    } catch {
      // Absent, which is the expected steady state.
    }
  }
  return false;
}

async function removeLegacyContinueYamls(dir: string): Promise<void> {
  for (const name of LEGACY_CONTINUE_YAML_FILENAMES) {
    const p = path.join(dir, name);
    try {
      await fs.unlink(p);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export async function ensureContinueMcpConfig(input: {
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  workspaceFolder: string;
  registryTools?: ToolCatalogEntry[];
}): Promise<{ updated: boolean }> {
  const target = continueMcpConfigPath(input.workspaceFolder);
  const dir = path.dirname(target);

  return withMcpConfigLock(target, async () => {
    const legacyPresent = await legacyContinueYamlsPresent(dir);
    const desiredServer = buildAtSeriesMcpServerConfig({
      hostApp: input.hostApp,
      hubJsAbsolutePath: input.hubJsAbsolutePath,
      registryTools: input.registryTools
    });
    const desiredDoc = buildContinueDoc(desiredServer);

    let existingText: string | undefined;
    try {
      existingText = await fs.readFile(target, 'utf8');
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      if (code !== 'ENOENT') {
        throw error;
      }
    }

    const existingDoc = existingText ? parseContinueDoc(existingText) : undefined;
    if (!legacyPresent && isSameContinueDoc(existingDoc, desiredDoc)) {
      return { updated: false };
    }

    const text = yamlDump(desiredDoc, {
      lineWidth: 120,
      noRefs: true
    });

    if (existingText !== undefined) {
      await backupFileOnce(target, mcpConfigBackupPath(target));
    }
    await atomicWriteFile(target, text, { mode: 'preserve' });

    // Only once the replacement is on disk. Unlinking first would leave the
    // user with neither config if the write then failed.
    await removeLegacyContinueYamls(dir);
    return { updated: true };
  });
}

export async function uninstallContinueMcpConfig(input: {
  workspaceFolder: string;
}): Promise<{ removed: boolean }> {
  const target = continueMcpConfigPath(input.workspaceFolder);
  try {
    await fs.unlink(target);
    return { removed: true };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    if (code === 'ENOENT') {
      return { removed: false };
    }
    throw error;
  }
}
