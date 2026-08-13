import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BRIDGE_ENDPOINTS,
  resolveBridgeEndpoints
} from '../src/protocol/index';

describe('resolveBridgeEndpoints', () => {
  it('falls back to protocol defaults when no override is present', () => {
    expect(resolveBridgeEndpoints({})).toEqual(DEFAULT_BRIDGE_ENDPOINTS);
  });

  it('honours conformant overrides', () => {
    expect(
      resolveBridgeEndpoints({ endpoints: { invoke: '/api/v1/invoke' } }).invoke
    ).toBe('/api/v1/invoke');
  });

  it.each(['/../admin', '//evil', 'not-a-path', '/v1.41/containers/create?x=1'])(
    'falls back to the default rather than honour %p',
    (invoke) => {
      expect(resolveBridgeEndpoints({ endpoints: { invoke } }).invoke).toBe(
        DEFAULT_BRIDGE_ENDPOINTS.invoke
      );
    }
  );

  it('rejects each endpoint independently', () => {
    const endpoints = resolveBridgeEndpoints({
      endpoints: { health: '/healthz', tools: '/../tools' }
    });
    expect(endpoints.health).toBe('/healthz');
    expect(endpoints.tools).toBe(DEFAULT_BRIDGE_ENDPOINTS.tools);
  });
});
