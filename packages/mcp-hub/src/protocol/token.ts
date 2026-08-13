/**
 * Bridge token primitives (protocol §7.2, §14.2).
 *
 * The Hub only ever consumes tokens, but every Bridge has to mint one and
 * check one, and getting either wrong is silent: a low-entropy token is
 * guessable and a `===` check is timing-observable. Both live here so the
 * three plugin Bridges share one correct implementation instead of three
 * hand-rolled ones.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes of CSPRNG entropy, base64url-encoded (43 chars, no padding). */
export function createBridgeToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Constant-time token comparison. Returns false for length mismatch without
 * leaking where the difference is — the length of a rejected guess is not a
 * useful oracle, whereas the position of the first differing byte is.
 *
 * An empty token is never valid: `createBridgeToken` cannot produce one, so
 * treating `('', '')` as a match would turn a Bridge that failed to mint a
 * token into an open one.
 */
export function timingSafeEqualToken(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
