import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AT_SERIES_HOST_APP_ENV,
  slugifyHostAppId
} from '../src/protocol/index';
import { resolveHostAppFromEnv } from '../src/hub/hostApp';

describe('resolveHostAppFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('slugifies a mixed-case value the way the plugin side does', () => {
    vi.stubEnv(AT_SERIES_HOST_APP_ENV, 'Cursor');

    expect(resolveHostAppFromEnv(process.env)).toBe('cursor');
    expect(resolveHostAppFromEnv(process.env)).toBe(slugifyHostAppId('Cursor'));
  });

  it('slugifies values containing spaces and slashes', () => {
    const raw = 'Visual Studio Code/Insiders';
    vi.stubEnv(AT_SERIES_HOST_APP_ENV, raw);

    expect(resolveHostAppFromEnv(process.env)).toBe(
      'visual-studio-code-insiders'
    );
    expect(resolveHostAppFromEnv(process.env)).toBe(slugifyHostAppId(raw));
  });

  it('leaves an already-slugged fork id untouched', () => {
    vi.stubEnv(AT_SERIES_HOST_APP_ENV, 'joycode-editor');

    expect(resolveHostAppFromEnv(process.env)).toBe('joycode-editor');
  });

  it('falls back to unknown when the env var is absent', () => {
    vi.stubEnv(AT_SERIES_HOST_APP_ENV, undefined);

    expect(resolveHostAppFromEnv(process.env)).toBe('unknown');
  });

  it.each(['', '   ', '///'])(
    'falls back to unknown for the unusable value %o',
    (raw) => {
      vi.stubEnv(AT_SERIES_HOST_APP_ENV, raw);

      expect(resolveHostAppFromEnv(process.env)).toBe('unknown');
    }
  );

  it('produces a value usable as a registry directory name', () => {
    vi.stubEnv(AT_SERIES_HOST_APP_ENV, 'My IDE/../escape');

    expect(resolveHostAppFromEnv(process.env)).toMatch(/^[a-z0-9-]+$/);
  });
});
