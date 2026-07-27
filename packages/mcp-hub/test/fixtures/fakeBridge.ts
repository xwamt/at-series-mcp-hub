import http from 'node:http';
import {
  AT_SERIES_PROTOCOL_VERSION,
  AT_SERIES_TOKEN_HEADER,
  type BridgeErrorBody,
  type BridgeHealthResponse,
  type BridgeInvokeRequest,
  type BridgeInvokeSuccess,
  type BridgeToolsResponse,
  type HostApp,
  type ToolCatalogEntry
} from '../../src/protocol/index';

export type FakeBridgeOptions = {
  token?: string;
  bridgeId?: string;
  pluginId?: string;
  pluginDisplayName?: string;
  pluginVersion?: string;
  hostApp?: HostApp;
  tools?: ToolCatalogEntry[];
  /** Custom invoke handler; default echoes success for known tools. */
  onInvoke?: (
    req: BridgeInvokeRequest
  ) =>
    | { status: number; body: BridgeInvokeSuccess | BridgeErrorBody }
    | BridgeInvokeSuccess
    | BridgeErrorBody;
};

export type FakeBridgeHandle = {
  port: number;
  token: string;
  close: () => Promise<void>;
};

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function unauthorized(): BridgeErrorBody {
  return {
    error: {
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid token'
    }
  };
}

/**
 * Minimal Hub-facing Bridge HTTP fixture (127.0.0.1 only).
 * Not a plugin Bridge framework — test double for Hub→Bridge client.
 */
export async function startFakeBridge(
  options: FakeBridgeOptions = {}
): Promise<FakeBridgeHandle> {
  const token = options.token ?? 't'.repeat(32);
  const bridgeId = options.bridgeId ?? 'fake-bridge-1';
  const pluginId = options.pluginId ?? 'at.terminal';
  const pluginDisplayName = options.pluginDisplayName ?? 'AT Terminal';
  const pluginVersion = options.pluginVersion ?? '0.2.17';
  const hostApp = options.hostApp ?? 'cursor';
  const tools: ToolCatalogEntry[] = options.tools ?? [
    {
      name: 'list_ssh_servers',
      title: 'List SSH Servers',
      description: 'List configured SSH servers',
      risk: 'read',
      inputSchema: { type: 'object', properties: {} }
    }
  ];
  const pid = process.pid;
  const updatedAt = Date.now();

  const server = http.createServer(async (req, res) => {
    const headerToken = req.headers[AT_SERIES_TOKEN_HEADER];
    if (headerToken !== token) {
      sendJson(res, 401, unauthorized());
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const method = req.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/health') {
      const body: BridgeHealthResponse = {
        ok: true,
        protocolVersion: AT_SERIES_PROTOCOL_VERSION,
        bridgeId,
        pluginId,
        pluginDisplayName,
        pluginVersion,
        hostApp,
        pid,
        updatedAt,
        connectedTargets: 1,
        toolCount: tools.length
      };
      sendJson(res, 200, body);
      return;
    }

    if (method === 'GET' && url.pathname === '/tools') {
      const body: BridgeToolsResponse = {
        protocolVersion: AT_SERIES_PROTOCOL_VERSION,
        tools
      };
      sendJson(res, 200, body);
      return;
    }

    if (method === 'POST' && url.pathname === '/invoke') {
      let parsed: unknown;
      try {
        parsed = await readJsonBody(req);
      } catch {
        sendJson(res, 400, {
          error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' }
        } satisfies BridgeErrorBody);
        return;
      }

      const invokeReq = parsed as BridgeInvokeRequest;
      if (
        !invokeReq ||
        typeof invokeReq !== 'object' ||
        typeof invokeReq.name !== 'string' ||
        typeof invokeReq.arguments !== 'object' ||
        invokeReq.arguments === null ||
        Array.isArray(invokeReq.arguments)
      ) {
        sendJson(res, 400, {
          error: {
            code: 'BAD_REQUEST',
            message: 'Expected { name: string, arguments: object }'
          }
        } satisfies BridgeErrorBody);
        return;
      }

      if (options.onInvoke) {
        const result = options.onInvoke(invokeReq);
        if (
          result &&
          typeof result === 'object' &&
          'status' in result &&
          'body' in result
        ) {
          sendJson(res, result.status, result.body);
          return;
        }
        const isError =
          result &&
          typeof result === 'object' &&
          'error' in result &&
          !('ok' in result);
        sendJson(res, isError ? 422 : 200, result);
        return;
      }

      const known = tools.some((t) => t.name === invokeReq.name);
      if (!known) {
        sendJson(res, 404, {
          error: {
            code: 'NOT_FOUND',
            message: `Unknown tool: ${invokeReq.name}`
          }
        } satisfies BridgeErrorBody);
        return;
      }

      sendJson(res, 200, {
        ok: true,
        name: invokeReq.name,
        result: { echoed: invokeReq.arguments }
      } satisfies BridgeInvokeSuccess);
      return;
    }

    sendJson(res, 404, {
      error: { code: 'NOT_FOUND', message: `Unknown path: ${url.pathname}` }
    } satisfies BridgeErrorBody);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('fakeBridge failed to bind to 127.0.0.1:0');
  }

  return {
    port: address.port,
    token,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}
