import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  bridgeGetHealth,
  bridgeGetTools,
  bridgeInvoke,
  BridgeHttpError
} from '../src/bridgeClient/http';
import { startFakeBridge, type FakeBridgeHandle } from './fixtures/fakeBridge';
import { startHostileBridge } from './fixtures/hostileBridge';

describe('bridgeClient HTTP', () => {
  let bridge: FakeBridgeHandle;

  beforeEach(async () => {
    bridge = await startFakeBridge();
  });

  afterEach(async () => {
    await bridge.close();
  });

  function record(overrides: { token?: string } = {}) {
    return {
      port: bridge.port,
      token: overrides.token ?? bridge.token,
      endpoints: undefined as undefined
    };
  }

  it('GET /health success', async () => {
    const health = await bridgeGetHealth(record());
    expect(health.ok).toBe(true);
    expect(health.protocolVersion).toBe(1);
    expect(health.bridgeId).toBe('fake-bridge-1');
    expect(health.pluginId).toBe('at.terminal');
    expect(health.hostApp).toBe('cursor');
    expect(typeof health.pid).toBe('number');
    expect(typeof health.updatedAt).toBe('number');
  });

  it('GET /tools success', async () => {
    const tools = await bridgeGetTools(record());
    expect(tools.protocolVersion).toBe(1);
    expect(tools.tools).toHaveLength(1);
    expect(tools.tools[0].name).toBe('list_ssh_servers');
    expect(tools.tools[0].risk).toBe('read');
  });

  it('POST /invoke success', async () => {
    const result = await bridgeInvoke(record(), {
      name: 'list_ssh_servers',
      arguments: {}
    });
    expect(result).toEqual({
      ok: true,
      name: 'list_ssh_servers',
      result: { echoed: {} }
    });
  });

  it('throws UNAUTHORIZED on bad token for health', async () => {
    await expect(bridgeGetHealth(record({ token: 'wrong-token' }))).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BridgeHttpError &&
        err.code === 'UNAUTHORIZED' &&
        err.status === 401
    );
  });

  it('invoke returns VALIDATION_ERROR structured body without throwing', async () => {
    await bridge.close();
    bridge = await startFakeBridge({
      onInvoke: () => ({
        status: 422,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid arguments',
            details: { field: 'serverId' }
          }
        }
      })
    });

    const result = await bridgeInvoke(record(), {
      name: 'list_ssh_servers',
      arguments: { serverId: 1 }
    });

    expect(result).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid arguments',
        details: { field: 'serverId' }
      }
    });
  });
});

describe('outbound redirect refusal', () => {
  it('refuses to follow a redirect from GET /tools and never leaks the token', async () => {
    const sink = await startHostileBridge({ mode: 'oversized', bytes: 1 });
    const redirector = await startHostileBridge({
      mode: 'redirect',
      location: `http://127.0.0.1:${sink.port}/stolen`
    });

    await expect(
      bridgeGetTools({ port: redirector.port, token: 'SECRET-TOKEN-123' })
    ).rejects.toThrow(BridgeHttpError);

    expect(sink.captured).toHaveLength(0);

    await redirector.close();
    await sink.close();
  });

  it('refuses a 307 on POST /invoke so the request body is not replayed', async () => {
    const sink = await startHostileBridge({ mode: 'oversized', bytes: 1 });
    const redirector = await startHostileBridge({
      mode: 'redirect',
      status: 307,
      location: `http://127.0.0.1:${sink.port}/stolen`
    });

    await expect(
      bridgeInvoke(
        { port: redirector.port, token: 'SECRET-TOKEN-123' },
        { name: 'run_remote_command', arguments: { cmd: 'cat ~/.ssh/id_rsa' } }
      )
    ).rejects.toThrow(BridgeHttpError);

    expect(sink.captured).toHaveLength(0);

    await redirector.close();
    await sink.close();
  });
});

describe('outbound timeouts', () => {
  it('aborts GET /tools when the bridge accepts but never responds', async () => {
    const hung = await startHostileBridge({ mode: 'hang' });

    const started = Date.now();
    await expect(
      bridgeGetTools({ port: hung.port, token: 't'.repeat(32) }, { timeoutMs: 300 })
    ).rejects.toThrow(BridgeHttpError);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(3000);

    await hung.close();
  }, 10_000);

  it('aborts POST /invoke when the bridge never responds', async () => {
    const hung = await startHostileBridge({ mode: 'hang' });

    await expect(
      bridgeInvoke(
        { port: hung.port, token: 't'.repeat(32) },
        { name: 'list_ssh_servers', arguments: {} },
        { timeoutMs: 300 }
      )
    ).rejects.toThrow(BridgeHttpError);

    await hung.close();
  }, 10_000);
});
