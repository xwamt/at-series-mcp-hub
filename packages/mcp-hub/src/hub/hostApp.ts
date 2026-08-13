import { AT_SERIES_HOST_APP_ENV, slugifyHostAppId } from '../protocol/index';

/**
 * Resolve the `hostApp` id the Hub scopes its registry reads to.
 *
 * The raw env value becomes a `bridges/<hostApp>/` directory name, so it must
 * go through the same `slugifyHostAppId` the plugin side uses when it
 * publishes. Otherwise `AT_SERIES_HOST_APP=Cursor` would look in a different
 * directory than the Bridge that published to `cursor`. A value that slugifies
 * to nothing falls back to `unknown` (v1.md section 4.1).
 */
export function resolveHostAppFromEnv(
  env: Record<string, string | undefined>
): string {
  return slugifyHostAppId(env[AT_SERIES_HOST_APP_ENV]) ?? 'unknown';
}
