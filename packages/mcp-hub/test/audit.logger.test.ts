import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogger } from '../src/audit/logger';
import type { AuditRecord } from '../src/audit/types';
import { agentOpsLogPath, logsDirForHostApp } from '../src/protocol/paths';

const isWindows = process.platform === 'win32';

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    traceId: 'at-trace-00000000-0000-0000-0000-000000000001',
    timestamp: '2026-08-19T01:00:00.000Z',
    hostApp: 'cursor',
    hubPid: 44102,
    toolName: 'run_remote_command',
    attemptCount: 1,
    durationMs: 10,
    status: 'success',
    params: { command: 'ls' },
    responseSummary: { isError: false, preview: '{}' },
    ...overrides
  };
}

async function modeOf(target: string): Promise<number> {
  return (await fs.stat(target)).mode & 0o777;
}

describe('AuditLogger', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-audit-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('writes one valid JSON object per line', async () => {
    const logger = new AuditLogger({
      enabled: true,
      home,
      hostApp: 'cursor',
      pid: 44102,
      now: () => new Date(2026, 7, 19, 12, 0, 0)
    });
    logger.log(record({ params: { command: 'echo\nnewline' } }));
    await logger.close();

    const file = agentOpsLogPath('cursor', '2026-08-19', 44102, home);
    const body = await fs.readFile(file, 'utf8');
    const lines = body.trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      toolName: 'run_remote_command',
      params: { command: 'echo\nnewline' }
    });
  });

  it('rotates to a new file when the local date changes', async () => {
    let current = new Date(2026, 7, 19, 23, 59, 0);
    const logger = new AuditLogger({
      enabled: true,
      home,
      hostApp: 'cursor',
      pid: 7,
      now: () => current
    });
    logger.log(record({ toolName: 'one' }));
    await logger.flush();
    current = new Date(2026, 7, 20, 0, 1, 0);
    logger.log(record({ toolName: 'two' }));
    await logger.close();

    const day1 = await fs.readFile(
      agentOpsLogPath('cursor', '2026-08-19', 7, home),
      'utf8'
    );
    const day2 = await fs.readFile(
      agentOpsLogPath('cursor', '2026-08-20', 7, home),
      'utf8'
    );
    expect(JSON.parse(day1.trim()).toolName).toBe('one');
    expect(JSON.parse(day2.trim()).toolName).toBe('two');
  });

  it('does not create files when disabled', async () => {
    const logger = new AuditLogger({
      enabled: false,
      home,
      hostApp: 'cursor',
      pid: 1,
      now: () => new Date(2026, 7, 19)
    });
    logger.log(record());
    await logger.close();
    await expect(fs.access(logsDirForHostApp('cursor', home))).rejects.toMatchObject(
      { code: 'ENOENT' }
    );
  });

  it('deletes log files whose filename date is older than retentionDays', async () => {
    const dir = logsDirForHostApp('cursor', home);
    await fs.mkdir(dir, { recursive: true });
    const stale = path.join(dir, 'agent-ops-2026-07-01-1.jsonl');
    const keep = path.join(dir, 'agent-ops-2026-08-10-1.jsonl');
    const junk = path.join(dir, 'notes.txt');
    await fs.writeFile(stale, '{}\n');
    await fs.writeFile(keep, '{}\n');
    await fs.writeFile(junk, 'keep me\n');

    const logger = new AuditLogger({
      enabled: true,
      home,
      hostApp: 'cursor',
      pid: 9,
      retentionDays: 30,
      now: () => new Date(2026, 7, 19, 12, 0, 0)
    });
    logger.log(record());
    await logger.close();

    await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(keep)).resolves.toBeUndefined();
    await expect(fs.access(junk)).resolves.toBeUndefined();
  });

  it.skipIf(isWindows)('creates the log file at 0600 and directories at 0700', async () => {
    const logger = new AuditLogger({
      enabled: true,
      home,
      hostApp: 'cursor',
      pid: 3,
      now: () => new Date(2026, 7, 19)
    });
    logger.log(record());
    await logger.close();

    const file = agentOpsLogPath('cursor', '2026-08-19', 3, home);
    expect(await modeOf(file)).toBe(0o600);
    expect(await modeOf(logsDirForHostApp('cursor', home))).toBe(0o700);
    expect(await modeOf(path.join(home, '.at-series', 'logs'))).toBe(0o700);
  });

  it('swallows write errors so log() never throws', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const brokenHome = path.join(home, 'not-a-dir-yet');
    await fs.writeFile(brokenHome, 'file');
    const broken = new AuditLogger({
      enabled: true,
      home: brokenHome,
      hostApp: 'cursor',
      pid: 4,
      now: () => new Date(2026, 7, 19)
    });
    expect(() => broken.log(record())).not.toThrow();
    await broken.close();
    stderr.mockRestore();
  });

  it('writes distinct pid files that do not interleave', async () => {
    const now = () => new Date(2026, 7, 19, 8, 0, 0);
    const a = new AuditLogger({
      enabled: true,
      home,
      hostApp: 'cursor',
      pid: 11,
      now
    });
    const b = new AuditLogger({
      enabled: true,
      home,
      hostApp: 'cursor',
      pid: 12,
      now
    });
    a.log(record({ toolName: 'alpha' }));
    b.log(record({ toolName: 'beta' }));
    await a.close();
    await b.close();

    const fileA = await fs.readFile(
      agentOpsLogPath('cursor', '2026-08-19', 11, home),
      'utf8'
    );
    const fileB = await fs.readFile(
      agentOpsLogPath('cursor', '2026-08-19', 12, home),
      'utf8'
    );
    expect(JSON.parse(fileA.trim()).toolName).toBe('alpha');
    expect(JSON.parse(fileB.trim()).toolName).toBe('beta');
  });
});

describe('AuditLogger env parsing via constructor defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats AT_SERIES_AUDIT_LOG=false as disabled', async () => {
    vi.stubEnv('AT_SERIES_AUDIT_LOG', 'false');
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-audit-env-'));
    try {
      const logger = AuditLogger.fromEnv({
        home,
        hostApp: 'cursor',
        pid: 1,
        now: () => new Date(2026, 7, 19)
      });
      logger.log(record());
      await logger.close();
      await expect(
        fs.access(logsDirForHostApp('cursor', home))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});
