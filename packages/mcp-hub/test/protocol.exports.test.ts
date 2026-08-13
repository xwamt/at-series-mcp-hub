import { describe, it, expect } from 'vitest';
import {
  AT_SERIES_PROTOCOL_VERSION,
  AT_SERIES_BRIDGE_PROTOCOL_VERSION,
  AT_SERIES_HUB_PROTOCOL_VERSION,
  HUB_BUILTIN_TOOL_NAMES,
  MCP_SERVER_DISPLAY_NAME,
  normalizeToolRisk,
  isAutoApproveRisk,
  detectHostApp
} from '../src/index';

describe('protocol exports', () => {
  it('keeps the legacy protocol version alias on bridge v1', () => {
    expect(AT_SERIES_PROTOCOL_VERSION).toBe(1);
    expect(AT_SERIES_BRIDGE_PROTOCOL_VERSION).toBe(1);
    expect(AT_SERIES_HUB_PROTOCOL_VERSION).toBe(2);
    expect(MCP_SERVER_DISPLAY_NAME).toBe('AT Series');
  });

  it('lists all progressive-discovery builtins', () => {
    expect([...HUB_BUILTIN_TOOL_NAMES].sort()).toEqual(
      [
        'at_clear_tool_selection',
        'at_get_tool',
        'at_list_providers',
        'at_search_tools',
        'at_select_tools'
      ].sort()
    );
  });

  it('treats missing risk as exec (fail closed)', () => {
    expect(normalizeToolRisk(undefined)).toBe('exec');
    expect(isAutoApproveRisk(normalizeToolRisk(undefined))).toBe(false);
  });

  it('exports detectHostApp for plugin host isolation', () => {
    expect(
      detectHostApp({
        extensionPath: 'C:/Users/alan/.joycode-editor/extensions/local.at-terminal-0.3.0'
      })
    ).toBe('joycode-editor');
  });
});
