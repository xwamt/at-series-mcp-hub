import { createHash } from 'node:crypto';
import { DEFAULT_AUDIT_MAX_FIELD_BYTES } from '../protocol/index';

const REDACTED = '[REDACTED]';
const TRUNCATE_PREFIX_BYTES = 1024;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'credential',
  'privatekey',
  'private_key',
  'api_key',
  'apikey',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'passphrase',
  'authorization',
  'cookie'
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Redact token-like substrings in diagnostic or audit text. */
export function redactSecretsInText(raw: string): string {
  return raw
    .replace(/([?&]token=)[^&"\s]+/gi, `$1${REDACTED}`)
    .replace(/("token"\s*:\s*")[^"]+/gi, `$1${REDACTED}`)
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(/(Authorization:\s*)\S+/gi, `$1${REDACTED}`);
}

function utf8Prefix(value: string, maxBytes: number): string {
  const buf = Buffer.from(value, 'utf8');
  if (buf.byteLength <= maxBytes) {
    return value;
  }
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return buf.subarray(0, end).toString('utf8');
}

function limitString(value: string, maxFieldBytes: number): string {
  if (value === REDACTED) {
    return value;
  }
  const buf = Buffer.from(value, 'utf8');
  if (buf.byteLength <= maxFieldBytes) {
    return value;
  }
  const hash = createHash('sha256').update(buf).digest('hex');
  const prefix = utf8Prefix(value, TRUNCATE_PREFIX_BYTES);
  return `${prefix}[TRUNCATED: total ${buf.byteLength} bytes, sha256=${hash}]`;
}

function sanitizeNode(value: unknown, maxFieldBytes: number): unknown {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case 'string':
      return limitString(redactSecretsInText(value), maxFieldBytes);
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'boolean':
      return value;
    case 'bigint':
    case 'undefined':
    case 'function':
    case 'symbol':
      return null;
    case 'object':
      break;
    default:
      return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNode(item, maxFieldBytes));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitizeNode(child, maxFieldBytes);
  }
  return out;
}

export function sanitizeForAudit(
  value: unknown,
  maxFieldBytes = DEFAULT_AUDIT_MAX_FIELD_BYTES
): unknown {
  return sanitizeNode(value, maxFieldBytes);
}

export function sanitizePreview(
  text: string,
  maxFieldBytes = DEFAULT_AUDIT_MAX_FIELD_BYTES
): string {
  return limitString(redactSecretsInText(text), maxFieldBytes);
}
