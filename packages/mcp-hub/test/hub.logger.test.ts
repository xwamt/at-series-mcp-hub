import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeError, hubLog } from '../src/hub/logger';

function stderrLines(spy: ReturnType<typeof spyStderr>): string[] {
  return spy.mock.calls.map((call) => String(call[0]));
}

function spyStderr() {
  return vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

describe('hubLog', () => {
  let write: ReturnType<typeof spyStderr>;

  beforeEach(() => {
    write = spyStderr();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('defaults to warn: warn and error are emitted, info is dropped', () => {
    vi.stubEnv('AT_SERIES_LOG_LEVEL', undefined);

    hubLog.info('quiet');
    hubLog.warn('noisy');
    hubLog.error('loud');

    const lines = stderrLines(write);
    expect(lines).toEqual([
      '[at-series-hub] warn: noisy\n',
      '[at-series-hub] error: loud\n'
    ]);
  });

  it('emits nothing at silent', () => {
    vi.stubEnv('AT_SERIES_LOG_LEVEL', 'silent');

    hubLog.info('a');
    hubLog.warn('b');
    hubLog.error('c');

    expect(write).not.toHaveBeenCalled();
  });

  it('emits info once the level is raised to info', () => {
    vi.stubEnv('AT_SERIES_LOG_LEVEL', 'info');

    hubLog.info('hello');

    expect(stderrLines(write)).toEqual(['[at-series-hub] info: hello\n']);
  });

  it('falls back to warn on an unrecognised level', () => {
    vi.stubEnv('AT_SERIES_LOG_LEVEL', 'verbose');

    hubLog.info('dropped');
    hubLog.warn('kept');

    expect(stderrLines(write)).toEqual(['[at-series-hub] warn: kept\n']);
  });

  it('accepts a level regardless of case', () => {
    vi.stubEnv('AT_SERIES_LOG_LEVEL', 'ERROR');

    hubLog.warn('dropped');
    hubLog.error('kept');

    expect(stderrLines(write)).toEqual(['[at-series-hub] error: kept\n']);
  });
});

describe('describeError', () => {
  it('redacts a token query parameter', () => {
    const message = describeError(
      new Error('connect ECONNREFUSED http://127.0.0.1:5000/tools?token=abc123')
    );
    expect(message).toBe(
      'connect ECONNREFUSED http://127.0.0.1:5000/tools?token=[REDACTED]'
    );
  });

  it('redacts a token field in a JSON payload', () => {
    const message = describeError('bad record {"token":"abc123","port":5000}');
    expect(message).toBe('bad record {"token":"[REDACTED]","port":5000}');
  });

  it('keeps non-Error values readable', () => {
    expect(describeError({ code: 'ENOTDIR' })).toBe('[object Object]');
  });
});
