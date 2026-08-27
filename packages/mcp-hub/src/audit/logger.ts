import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from '../fs/atomicWrite';
import { describeError, hubLog } from '../hub/logger';
import {
  AT_SERIES_AUDIT_LOG_ENV,
  AT_SERIES_AUDIT_MAX_FIELD_BYTES_ENV,
  AT_SERIES_AUDIT_RETENTION_DAYS_ENV,
  DEFAULT_AUDIT_MAX_FIELD_BYTES,
  DEFAULT_AUDIT_RETENTION_DAYS
} from '../protocol/index';
import {
  agentOpsLogPath,
  atSeriesRootDir,
  logsDir,
  logsDirForHostApp
} from '../protocol/paths';
import { sanitizeForAudit, sanitizePreview } from './sanitize';
import type { AuditRecord } from './types';

const MAX_QUEUED = 100;
const FILE_MODE = 0o600;

export type AuditLoggerOptions = {
  enabled: boolean;
  home: string;
  hostApp: string;
  pid: number;
  retentionDays?: number;
  maxFieldBytes?: number;
  now?: () => Date;
};

export function parseAuditLogEnabled(raw: unknown): boolean {
  if (raw === undefined || raw === null) {
    return true;
  }
  const value = String(raw).trim().toLowerCase();
  if (value === '') {
    return true;
  }
  return value !== 'false' && value !== '0' && value !== 'off';
}

export function parseAuditRetentionDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_AUDIT_RETENTION_DAYS;
}

export function parseAuditMaxFieldBytes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(n) || n < 256 || n > 65536) {
    return DEFAULT_AUDIT_MAX_FIELD_BYTES;
  }
  return n;
}

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addLocalDays(dateStr: string, delta: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dt = new Date(year!, month! - 1, day!);
  dt.setDate(dt.getDate() + delta);
  return localDateStr(dt);
}

export class AuditLogger {
  readonly maxFieldBytes: number;
  private readonly enabled: boolean;
  private readonly home: string;
  private readonly hostApp: string;
  private readonly pid: number;
  private readonly retentionDays: number;
  private readonly now: () => Date;
  private chain: Promise<void> = Promise.resolve();
  private queued = 0;
  private stream: fs.WriteStream | undefined;
  private streamDate: string | undefined;
  private warnedDrop = false;
  private closed = false;
  private dead = false;

  constructor(options: AuditLoggerOptions) {
    this.enabled = options.enabled;
    this.home = options.home;
    this.hostApp = options.hostApp;
    this.pid = options.pid;
    this.retentionDays = options.retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
    this.maxFieldBytes = options.maxFieldBytes ?? DEFAULT_AUDIT_MAX_FIELD_BYTES;
    this.now = options.now ?? (() => new Date());
  }

  static fromEnv(input: {
    home: string;
    hostApp: string;
    pid?: number;
    now?: () => Date;
  }): AuditLogger {
    return new AuditLogger({
      enabled: parseAuditLogEnabled(process.env[AT_SERIES_AUDIT_LOG_ENV]),
      home: input.home,
      hostApp: input.hostApp,
      pid: input.pid ?? process.pid,
      retentionDays: parseAuditRetentionDays(
        process.env[AT_SERIES_AUDIT_RETENTION_DAYS_ENV]
      ),
      maxFieldBytes: parseAuditMaxFieldBytes(
        process.env[AT_SERIES_AUDIT_MAX_FIELD_BYTES_ENV]
      ),
      now: input.now
    });
  }

  log(record: AuditRecord): void {
    if (!this.enabled || this.closed || this.dead) {
      return;
    }
    if (this.queued >= MAX_QUEUED) {
      if (!this.warnedDrop) {
        this.warnedDrop = true;
        hubLog.warn('audit log queue full; dropping records');
      }
      return;
    }
    this.queued += 1;
    this.chain = this.chain
      .then(() => this.writeOne(record))
      .catch((err) => {
        hubLog.error(`audit log write failed: ${describeError(err)}`);
      })
      .finally(() => {
        this.queued -= 1;
      });
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
    await this.endCurrentStream();
  }

  async flush(): Promise<void> {
    try {
      await this.chain;
    } catch {
      // writeOne errors are already reported on the chain.
    }
  }

  private async writeOne(record: AuditRecord): Promise<void> {
    if (this.dead) {
      return;
    }
    // Redaction runs on the async write path (v1 §3.4): it must complete
    // before the line is appended, and must never touch the caller's record
    // (callers may still hold the raw args reference).
    const sanitized = this.sanitizeRecord(record);
    const dateStr = localDateStr(this.now());
    if (this.stream && this.streamDate !== dateStr) {
      await this.endCurrentStream();
      this.warnedDrop = false;
    }
    if (!this.stream) {
      try {
        await this.openStream(dateStr);
      } catch (err) {
        this.dead = true;
        hubLog.error(`audit log unavailable: ${describeError(err)}`);
        return;
      }
      void this.cleanupExpired().catch((err) => {
        hubLog.error(`audit log cleanup failed: ${describeError(err)}`);
      });
    }
    await this.writeLine(`${JSON.stringify(sanitized)}\n`);
  }

  private sanitizeRecord(record: AuditRecord): AuditRecord {
    const sanitized: AuditRecord = {
      ...record,
      params: sanitizeForAudit(record.params, this.maxFieldBytes) as Record<
        string,
        unknown
      >,
      responseSummary: {
        isError: record.responseSummary.isError,
        preview: sanitizePreview(
          record.responseSummary.preview,
          this.maxFieldBytes
        )
      }
    };
    if (record.error) {
      sanitized.error = {
        code: record.error.code,
        message: sanitizePreview(record.error.message, this.maxFieldBytes)
      };
    }
    return sanitized;
  }

  private async openStream(dateStr: string): Promise<void> {
    await ensureDir(atSeriesRootDir(this.home));
    await ensureDir(logsDir(this.home));
    await ensureDir(logsDirForHostApp(this.hostApp, this.home));
    const filePath = agentOpsLogPath(
      this.hostApp,
      dateStr,
      this.pid,
      this.home
    );
    this.stream = fs.createWriteStream(filePath, {
      flags: 'a',
      mode: FILE_MODE
    });
    this.streamDate = dateStr;
  }

  private writeLine(line: string): Promise<void> {
    const stream = this.stream;
    if (!stream) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      stream.write(line, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private endCurrentStream(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    this.streamDate = undefined;
    if (!stream) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      stream.end(() => resolve());
    });
  }

  private async cleanupExpired(): Promise<void> {
    const dir = logsDirForHostApp(this.hostApp, this.home);
    let names: string[];
    try {
      names = await fsp.readdir(dir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return;
      }
      throw err;
    }
    const cutoff = addLocalDays(localDateStr(this.now()), -this.retentionDays);
    for (const name of names) {
      const match = /^agent-ops-(\d{4}-\d{2}-\d{2})-\d+\.jsonl$/.exec(name);
      if (!match) {
        continue;
      }
      if (match[1]! < cutoff) {
        await fsp.unlink(path.join(dir, name)).catch(() => undefined);
      }
    }
  }
}
