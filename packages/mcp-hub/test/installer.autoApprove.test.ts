import { describe, it, expect } from 'vitest';
import { defaultAutoApproveToolNames } from '../src/installer/autoApprove';
import { HUB_BUILTIN_TOOL_NAMES, type ToolCatalogEntry } from '../src/protocol/index';

function tool(name: string, risk: ToolCatalogEntry['risk']): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: name,
    risk,
    inputSchema: { type: 'object', properties: {} }
  };
}

describe('defaultAutoApproveToolNames', () => {
  it('includes every progressive-discovery builtin with empty registry', () => {
    const names = defaultAutoApproveToolNames({ registryTools: [] });

    for (const builtin of HUB_BUILTIN_TOOL_NAMES) {
      expect(names).toContain(builtin);
    }
  });

  it('includes builtins and only risk=read tools', () => {
    const names = defaultAutoApproveToolNames({
      registryTools: [
        tool('list_ssh_servers', 'read'),
        tool('sftp_write_file', 'write'),
        tool('run_remote_command', 'exec')
      ]
    });

    expect(names).toEqual([...HUB_BUILTIN_TOOL_NAMES, 'list_ssh_servers']);
    expect(names).not.toContain('sftp_write_file');
    expect(names).not.toContain('run_remote_command');
  });

  it('treats missing/invalid risk as not auto-approvable', () => {
    const missing = {
      name: 'no_risk',
      title: 'no_risk',
      description: 'x',
      inputSchema: { type: 'object', properties: {} }
    } as ToolCatalogEntry;

    const names = defaultAutoApproveToolNames({
      registryTools: [missing, tool('ok_read', 'read')]
    });

    expect(names).toContain('ok_read');
    expect(names).not.toContain('no_risk');
  });
});
