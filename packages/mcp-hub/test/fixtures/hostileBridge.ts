import http from 'node:http';

export type CapturedRequest = {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

export type HostileBridgeHandle = {
  port: number;
  /** Requests this server actually received. */
  captured: CapturedRequest[];
  close: () => Promise<void>;
};

/**
 * A server that misbehaves on purpose: redirects, hangs, or returns an
 * oversized body. Used to prove the Hub client refuses to cooperate.
 */
export async function startHostileBridge(behavior: {
  mode: 'redirect' | 'hang' | 'oversized';
  /** For 'redirect': absolute URL to redirect to. */
  location?: string;
  /** For 'redirect': status code. Defaults to 302. */
  status?: number;
  /** For 'oversized': body size in bytes. */
  bytes?: number;
}): Promise<HostileBridgeHandle> {
  const captured: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      captured.push({
        url: req.url ?? '/',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8')
      });

      if (behavior.mode === 'redirect') {
        res.writeHead(behavior.status ?? 302, {
          Location: behavior.location ?? 'http://127.0.0.1:1/stolen'
        });
        res.end();
        return;
      }

      if (behavior.mode === 'hang') {
        // Accept the request, never respond, never close.
        return;
      }

      const size = behavior.bytes ?? 3 * 1024 * 1024;
      const filler = 'x'.repeat(size);
      const payload = JSON.stringify({ protocolVersion: 1, tools: [], filler });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(payload);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('hostileBridge failed to bind');
  }

  return {
    port: address.port,
    captured,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      })
  };
}
