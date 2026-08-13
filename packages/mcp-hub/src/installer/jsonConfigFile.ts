import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteFile, backupFileOnce, ensureDir } from '../fs/atomicWrite';
import { withFileLock } from '../fs/fileLock';

/** Snapshot of the config as it looked before AT Series first touched it. */
export function mcpConfigBackupPath(configPath: string): string {
  return `${configPath}.at-series.bak`;
}

/** Hidden sibling so an IDE scanning the directory does not mistake it for config. */
export function mcpConfigLockPath(configPath: string): string {
  return path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.at-series.lock`
  );
}

/**
 * Thrown instead of a bare `SyntaxError` so the plugin surfacing this can tell
 * the user which file to look at and why. The IDEs accept `//` comments and
 * trailing commas in these files; `JSON.parse` does not, and that mismatch is
 * by far the most common reason a hand-maintained config stops updating.
 */
export class McpConfigParseError extends Error {
  readonly configPath: string;

  constructor(configPath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `${configPath} is not valid JSON, so the AT Series MCP entry was left ` +
        `unchanged. Comments and trailing commas are the usual cause: the IDE ` +
        `tolerates them here, this installer does not. Parser reported: ${detail}`
    );
    this.name = 'McpConfigParseError';
    this.configPath = configPath;
    this.cause = cause;
  }
}

/** Whitespace conventions of a document the user maintains by hand. */
export type JsonConfigFormat = {
  indent: string;
  eol: string;
  trailingNewline: boolean;
};

export type JsonConfigDocument = {
  config: Record<string, unknown>;
  format: JsonConfigFormat;
  /** Exact bytes on disk; absent when the file does not exist yet. */
  raw?: string;
};

const DEFAULT_FORMAT: JsonConfigFormat = {
  indent: '  ',
  eol: '\n',
  trailingNewline: true
};

/**
 * Serialise a read-modify-write on an IDE MCP config.
 *
 * All three AT Series plugins activate on IDE startup and all three repair the
 * same `mcpServers` map. Without this, each one reads the map, edits its own
 * copy, and the last writer silently reverts the others.
 */
export async function withMcpConfigLock<T>(
  configPath: string,
  run: () => Promise<T>
): Promise<T> {
  await ensureDir(path.dirname(configPath), { mode: 'preserve' });
  return withFileLock(mcpConfigLockPath(configPath), run);
}

export async function readJsonConfigDocument(
  configPath: string
): Promise<JsonConfigDocument> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { config: {}, format: DEFAULT_FORMAT };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(raw));
  } catch (error) {
    throw new McpConfigParseError(configPath, error);
  }
  return {
    config: isRecord(parsed) ? parsed : {},
    format: formatOf(raw),
    raw
  };
}

/**
 * Back the file up once, then replace it atomically.
 *
 * Callers must already hold {@link withMcpConfigLock}: the document handed in
 * here was derived from a read that must not be superseded before it lands.
 */
export async function writeJsonConfigDocument(input: {
  configPath: string;
  config: Record<string, unknown>;
  format: JsonConfigFormat;
  existed: boolean;
}): Promise<void> {
  if (input.existed) {
    await backupFileOnce(input.configPath, mcpConfigBackupPath(input.configPath));
  }
  await atomicWriteFile(input.configPath, serialize(input.config, input.format), {
    mode: 'preserve'
  });
}

/**
 * Key order survives for free — object spread and `JSON.stringify` both keep
 * insertion order — but whitespace does not, so carry it across explicitly.
 * Comments cannot survive `JSON.parse`; a config that has them is rejected
 * before it ever reaches this function.
 */
function serialize(
  config: Record<string, unknown>,
  format: JsonConfigFormat
): string {
  const body = JSON.stringify(config, null, format.indent);
  const text = format.trailingNewline ? `${body}\n` : body;
  return format.eol === '\n' ? text : text.replace(/\n/g, format.eol);
}

function formatOf(raw: string): JsonConfigFormat {
  // The first indented line of a JSON object is always one level deep.
  const indent = /\n([ \t]+)\S/.exec(raw)?.[1];
  return {
    indent: indent ?? DEFAULT_FORMAT.indent,
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    trailingNewline: /\n$/.test(raw)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}
