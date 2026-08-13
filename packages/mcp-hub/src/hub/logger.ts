/**
 * stdout belongs to the JSON-RPC transport, so all diagnostics go to stderr.
 * MCP clients surface stderr in their server logs.
 */
const LEVELS = ['silent', 'error', 'warn', 'info'] as const;
export type LogLevel = (typeof LEVELS)[number];

function resolveLevel(): LogLevel {
  const raw = process.env.AT_SERIES_LOG_LEVEL?.toLowerCase();
  return (LEVELS as readonly string[]).includes(raw ?? '')
    ? (raw as LogLevel)
    : 'warn';
}

function enabled(level: Exclude<LogLevel, 'silent'>): boolean {
  return LEVELS.indexOf(level) <= LEVELS.indexOf(resolveLevel());
}

function emit(level: Exclude<LogLevel, 'silent'>, message: string): void {
  if (!enabled(level)) return;
  process.stderr.write(`[at-series-hub] ${level}: ${message}\n`);
}

export const hubLog = {
  error: (message: string) => emit('error', message),
  warn: (message: string) => emit('warn', message),
  info: (message: string) => emit('info', message)
};

/** Never let a bridge token reach a log line. */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/([?&]token=|"token"\s*:\s*")[^&"\s]+/gi, '$1[REDACTED]');
}
