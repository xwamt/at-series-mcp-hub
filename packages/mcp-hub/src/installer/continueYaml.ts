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

async function removeLegacyContinueYamls(dir: string): Promise<boolean> {
  let removed = false;
  for (const name of LEGACY_CONTINUE_YAML_FILENAMES) {
    const p = path.join(dir, name);
    try {
      await fs.unlink(p);
      removed = true;
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
  return removed;
}

export async function ensureContinueMcpConfig(input: {
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  workspaceFolder: string;
  registryTools?: ToolCatalogEntry[];
}): Promise<{ updated: boolean }> {
  const target = continueMcpConfigPath(input.workspaceFolder);
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });

  const legacyRemoved = await removeLegacyContinueYamls(dir);
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
  if (!legacyRemoved && isSameContinueDoc(existingDoc, desiredDoc)) {
    return { updated: false };
  }

  const text = yamlDump(desiredDoc, {
    lineWidth: 120,
    noRefs: true
  });
  await fs.writeFile(target, text, 'utf8');
  return { updated: true };
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
