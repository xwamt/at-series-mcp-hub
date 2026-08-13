/**
 * Hub → Bridge HTTP client (outbound only).
 *
 * Redirects are refused (`redirect: 'error'`). The Bridge protocol has no
 * legal 3xx, and fetch only strips `Authorization` across origins — a custom
 * header like `x-at-series-token` would be forwarded verbatim, handing the
 * token and the full tool arguments to whoever controls the Location.
 *
 * Error-handling choice:
 * - bridgeGetHealth / bridgeGetTools: throw BridgeHttpError on non-2xx
 *   (or unparseable body), including UNAUTHORIZED. Used for liveness /
 *   catalog discovery where failure means "unhealthy / skip".
 * - bridgeInvoke: return BridgeInvokeResponse (success OR BridgeErrorBody)
 *   for HTTP responses with a parseable body, including tool-level
 *   404/422/499/500. Throw only on network/transport failure or empty
 *   non-JSON responses where no structured body exists.
 */

import {
  AT_SERIES_TOKEN_HEADER,
  BRIDGE_HOST,
  BRIDGE_MAX_BODY_BYTES,
  resolveBridgeEndpoints,
  type BridgeErrorBody,
  type BridgeHealthResponse,
  type BridgeInvokeRequest,
  type BridgeInvokeResponse,
  type BridgeRegistryRecord,
  type BridgeToolsResponse
} from '../protocol/index';

export type BridgeClientRecord = Pick<
  BridgeRegistryRecord,
  'port' | 'token' | 'endpoints'
>;

const HEALTH_TIMEOUT_MS = 2000;
/** Catalog fetch is on the hot path of every tools/list; fail fast. */
const TOOLS_TIMEOUT_MS = 5000;
/**
 * Invoke can legitimately block on a human confirmation dialog in the
 * extension host, so this ceiling is generous. It exists to bound a wedged
 * bridge, not to police slow tools.
 */
const INVOKE_TIMEOUT_MS = 120_000;

export type BridgeRequestOptions = {
  /** Override the default abort timeout, in milliseconds. */
  timeoutMs?: number;
};

export class BridgeHttpError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    message: string,
    opts: { code: string; status: number; details?: unknown }
  ) {
    super(message);
    this.name = 'BridgeHttpError';
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

function bridgeBaseUrl(port: number): string {
  return `http://${BRIDGE_HOST}:${port}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    [AT_SERIES_TOKEN_HEADER]: token,
    Accept: 'application/json'
  };
}

function isBridgeErrorBody(value: unknown): value is BridgeErrorBody {
  if (!value || typeof value !== 'object') return false;
  const err = (value as BridgeErrorBody).error;
  return (
    !!err &&
    typeof err === 'object' &&
    typeof err.code === 'string' &&
    typeof err.message === 'string'
  );
}

async function readLimitedText(res: Response): Promise<string> {
  const declared = res.headers.get('content-length');
  if (declared && Number(declared) > BRIDGE_MAX_BODY_BYTES) {
    throw new BridgeHttpError(
      `Bridge response too large: ${declared} bytes exceeds ${BRIDGE_MAX_BODY_BYTES}`,
      { code: 'INTERNAL_ERROR', status: res.status }
    );
  }

  const body = res.body;
  if (!body) {
    return '';
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > BRIDGE_MAX_BODY_BYTES) {
        // Stop pulling immediately; do not buffer the rest.
        await reader.cancel();
        throw new BridgeHttpError(
          `Bridge response too large: exceeds ${BRIDGE_MAX_BODY_BYTES} bytes`,
          { code: 'INTERNAL_ERROR', status: res.status }
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await readLimitedText(res);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function throwFromErrorBody(
  status: number,
  body: unknown,
  fallbackMessage: string
): never {
  if (isBridgeErrorBody(body)) {
    throw new BridgeHttpError(body.error.message, {
      code: body.error.code,
      status,
      details: body.error.details
    });
  }
  throw new BridgeHttpError(fallbackMessage, {
    code: 'INTERNAL_ERROR',
    status
  });
}

export async function bridgeGetHealth(
  record: BridgeClientRecord,
  options: BridgeRequestOptions = {}
): Promise<BridgeHealthResponse> {
  const endpoints = resolveBridgeEndpoints(record);
  const url = `${bridgeBaseUrl(record.port)}${endpoints.health}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(record.token),
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? HEALTH_TIMEOUT_MS)
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Bridge health request failed';
    throw new BridgeHttpError(message, {
      code: 'UNAVAILABLE',
      status: 0
    });
  }

  const body = await parseJsonBody(res);
  if (!res.ok) {
    throwFromErrorBody(res.status, body, `Bridge health failed (${res.status})`);
  }
  if (!body || typeof body !== 'object' || (body as BridgeHealthResponse).ok !== true) {
    throw new BridgeHttpError('Invalid Bridge health response', {
      code: 'INTERNAL_ERROR',
      status: res.status
    });
  }
  return body as BridgeHealthResponse;
}

export async function bridgeGetTools(
  record: BridgeClientRecord,
  options: BridgeRequestOptions = {}
): Promise<BridgeToolsResponse> {
  const endpoints = resolveBridgeEndpoints(record);
  const url = `${bridgeBaseUrl(record.port)}${endpoints.tools}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(record.token),
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? TOOLS_TIMEOUT_MS)
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Bridge tools request failed';
    throw new BridgeHttpError(message, {
      code: 'UNAVAILABLE',
      status: 0
    });
  }

  const body = await parseJsonBody(res);
  if (!res.ok) {
    throwFromErrorBody(res.status, body, `Bridge tools failed (${res.status})`);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as BridgeToolsResponse).tools)
  ) {
    throw new BridgeHttpError('Invalid Bridge tools response', {
      code: 'INTERNAL_ERROR',
      status: res.status
    });
  }
  return body as BridgeToolsResponse;
}

export async function bridgeInvoke(
  record: BridgeClientRecord,
  req: BridgeInvokeRequest,
  options: BridgeRequestOptions = {}
): Promise<BridgeInvokeResponse> {
  const endpoints = resolveBridgeEndpoints(record);
  const url = `${bridgeBaseUrl(record.port)}${endpoints.invoke}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(record.token),
        'Content-Type': 'application/json; charset=utf-8'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? INVOKE_TIMEOUT_MS),
      body: JSON.stringify(req)
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Bridge invoke request failed';
    throw new BridgeHttpError(message, {
      code: 'UNAVAILABLE',
      status: 0
    });
  }

  const body = await parseJsonBody(res);

  if (res.ok) {
    if (
      body &&
      typeof body === 'object' &&
      (body as { ok?: unknown }).ok === true &&
      typeof (body as { name?: unknown }).name === 'string'
    ) {
      return body as BridgeInvokeResponse;
    }
    throw new BridgeHttpError('Invalid Bridge invoke success response', {
      code: 'INTERNAL_ERROR',
      status: res.status
    });
  }

  // Tool-level / protocol errors: return structured body when present.
  if (isBridgeErrorBody(body)) {
    return body;
  }

  throw new BridgeHttpError(`Bridge invoke failed (${res.status})`, {
    code: 'INTERNAL_ERROR',
    status: res.status
  });
}
