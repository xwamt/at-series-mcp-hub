import { describe, it, expect } from 'vitest';
import {
  AT_SERIES_PROTOCOL_VERSION,
  MCP_SERVER_DISPLAY_NAME,
  normalizeToolRisk,
  isAutoApproveRisk
} from '../src/index';

describe('protocol exports', () => {
  it('exposes v1 constants', () => {
    expect(AT_SERIES_PROTOCOL_VERSION).toBe(1);
    expect(MCP_SERVER_DISPLAY_NAME).toBe('AT Series');
  });

  it('treats missing risk as exec (fail closed)', () => {
    expect(normalizeToolRisk(undefined)).toBe('exec');
    expect(isAutoApproveRisk(normalizeToolRisk(undefined))).toBe(false);
  });
});
