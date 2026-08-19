import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIT_MAX_FIELD_BYTES } from '../src/protocol/index';
import { redactSecretsInText, sanitizeForAudit } from '../src/audit/sanitize';

describe('sanitizeForAudit key redaction', () => {
  it('replaces exact sensitive keys regardless of case', () => {
    const result = sanitizeForAudit({
      Password: 's3cret',
      api_key: 'k',
      privateKey: '-----BEGIN',
      cookie: 'sid=1'
    });
    expect(result).toEqual({
      Password: '[REDACTED]',
      api_key: '[REDACTED]',
      privateKey: '[REDACTED]',
      cookie: '[REDACTED]'
    });
  });

  it('does not redact keys that only contain a sensitive substring', () => {
    const result = sanitizeForAudit({
      author: 'ada',
      authMethod: 'key',
      tokenCount: 3
    });
    expect(result).toEqual({
      author: 'ada',
      authMethod: 'key',
      tokenCount: 3
    });
  });

  it('redacts nested objects and arrays', () => {
    const result = sanitizeForAudit({
      servers: [{ name: 'prod', token: 'abc' }],
      nested: { secret: 'x', sql: 'SELECT 1' }
    });
    expect(result).toEqual({
      servers: [{ name: 'prod', token: '[REDACTED]' }],
      nested: { secret: '[REDACTED]', sql: 'SELECT 1' }
    });
  });
});

describe('redactSecretsInText', () => {
  it('redacts Bearer tokens, query tokens, JSON token fields, and Authorization headers', () => {
    expect(redactSecretsInText('http://127.0.0.1/tools?token=abc123')).toBe(
      'http://127.0.0.1/tools?token=[REDACTED]'
    );
    expect(redactSecretsInText('{"token":"abc123","port":1}')).toBe(
      '{"token":"[REDACTED]","port":1}'
    );
    expect(redactSecretsInText('Bearer abcdef012345')).toBe('Bearer [REDACTED]');
    expect(redactSecretsInText('Authorization: secretvalue')).toBe(
      'Authorization: [REDACTED]'
    );
  });
});

describe('sanitizeForAudit value redaction and truncation', () => {
  it('redacts secrets inside remaining string values', () => {
    const result = sanitizeForAudit({
      url: 'https://example/?token=abc',
      command: 'echo hi'
    }) as Record<string, string>;
    expect(result.url).toBe('https://example/?token=[REDACTED]');
    expect(result.command).toBe('echo hi');
  });

  it('leaves a mysql-style password in command text (Hub does not parse shells)', () => {
    const result = sanitizeForAudit({
      command: "mysql -pSECRET -e 'select 1'"
    }) as Record<string, string>;
    expect(result.command).toBe("mysql -pSECRET -e 'select 1'");
  });

  it('truncates oversized strings with a utf-8-safe prefix and sha256 of the original', () => {
    const original = 'a'.repeat(5000);
    const sha = createHash('sha256').update(original, 'utf8').digest('hex');
    const result = sanitizeForAudit(
      { content: original },
      DEFAULT_AUDIT_MAX_FIELD_BYTES
    ) as Record<string, string>;
    expect(result.content.startsWith('a'.repeat(1024))).toBe(true);
    expect(result.content).toContain(`[TRUNCATED: total 5000 bytes, sha256=${sha}]`);
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThan(5000);
  });

  it('does not stringify a 1MiB payload as a whole before truncating', () => {
    const original = 'b'.repeat(1024 * 1024);
    const result = sanitizeForAudit({ content: original }) as Record<
      string,
      string
    >;
    const encoded = JSON.stringify(result);
    expect(encoded.length).toBeLessThan(8 * 1024);
    expect(result.content).toContain('TRUNCATED');
  });

  it('turns non-JSON values into null so stringify cannot throw', () => {
    const result = sanitizeForAudit({
      ok: true,
      n: 1,
      missing: undefined,
      fn: () => 1,
      big: 1n
    }) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.n).toBe(1);
    expect(result.missing).toBeNull();
    expect(result.fn).toBeNull();
    expect(result.big).toBeNull();
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
