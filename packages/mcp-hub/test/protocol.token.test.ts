import { describe, it, expect } from 'vitest';
import { createBridgeToken, timingSafeEqualToken } from '../src/protocol/token';

describe('createBridgeToken', () => {
  it('encodes 32 bytes as 43 base64url characters without padding', () => {
    const token = createBridgeToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats across a large sample', () => {
    const tokens = new Set(Array.from({ length: 512 }, () => createBridgeToken()));
    expect(tokens.size).toBe(512);
  });

  it('is not a constant', () => {
    expect(createBridgeToken()).not.toBe(createBridgeToken());
  });
});

describe('timingSafeEqualToken', () => {
  it('accepts a token compared against itself', () => {
    const token = createBridgeToken();
    expect(timingSafeEqualToken(token, token)).toBe(true);
    expect(timingSafeEqualToken(token, `${token}`)).toBe(true);
  });

  it('rejects two independently generated tokens', () => {
    expect(timingSafeEqualToken(createBridgeToken(), createBridgeToken())).toBe(false);
  });

  it('rejects a same-length token that differs in the last character', () => {
    const a = 'a'.repeat(43);
    expect(timingSafeEqualToken(a, `${'a'.repeat(42)}b`)).toBe(false);
  });

  it('rejects a same-length token that differs in the first character', () => {
    const a = 'a'.repeat(43);
    expect(timingSafeEqualToken(a, `b${'a'.repeat(42)}`)).toBe(false);
  });

  it('returns false for a length mismatch instead of throwing', () => {
    const token = createBridgeToken();
    expect(() => timingSafeEqualToken(token, token.slice(0, 10))).not.toThrow();
    expect(timingSafeEqualToken(token, token.slice(0, 10))).toBe(false);
    expect(timingSafeEqualToken(token, `${token}x`)).toBe(false);
  });

  it('does not throw when byte length differs from string length', () => {
    expect(timingSafeEqualToken('é', 'ab')).toBe(false);
    expect(timingSafeEqualToken('é', 'a')).toBe(false);
    expect(timingSafeEqualToken('日本', 'abcdef')).toBe(false);
  });

  it('refuses an empty token on either side', () => {
    expect(timingSafeEqualToken('', '')).toBe(false);
    expect(timingSafeEqualToken('', createBridgeToken())).toBe(false);
    expect(timingSafeEqualToken(createBridgeToken(), '')).toBe(false);
  });
});

describe('package exports', () => {
  it('exposes both helpers from the package root', async () => {
    const pkg = await import('../src/index');
    expect(typeof pkg.createBridgeToken).toBe('function');
    expect(typeof pkg.timingSafeEqualToken).toBe('function');
    const token = pkg.createBridgeToken();
    expect(pkg.timingSafeEqualToken(token, token)).toBe(true);
  });
});
