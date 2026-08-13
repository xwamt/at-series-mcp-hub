import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  HUB_BUILTIN_TOOL_NAMES,
  type ToolCatalogEntry
} from '../src/protocol/index';
import { createHubRuntime } from '../src/hub/server';
import {
  toMcpToolDescriptors,
  toolAnnotationsForRisk
} from '../src/hub/annotations';

function tool(
  name: string,
  overrides: Partial<ToolCatalogEntry> = {}
): ToolCatalogEntry {
  return {
    name,
    title: name,
    description: `${name} description`,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    ...overrides
  };
}

describe('toolAnnotationsForRisk', () => {
  it('marks a read tool as read-only and non-destructive', () => {
    expect(toolAnnotationsForRisk('read')).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true
    });
  });

  it('marks a write tool as mutating but non-destructive', () => {
    expect(toolAnnotationsForRisk('write')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true
    });
  });

  it('marks an exec tool as destructive', () => {
    expect(toolAnnotationsForRisk('exec')).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true
    });
  });

  it('treats a missing risk as exec (fail closed)', () => {
    expect(toolAnnotationsForRisk(undefined)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true
    });
  });

  it.each(['readonly', 'READ', '', 42, null, {}])(
    'treats the invalid risk %o as exec (fail closed)',
    (risk) => {
      expect(toolAnnotationsForRisk(risk)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true
      });
    }
  );
});

describe('toMcpToolDescriptors', () => {
  it('preserves the four MCP fields the Hub already exposed', () => {
    const entry = tool('list_ssh_servers', {
      title: 'List SSH servers',
      description: 'List configured SSH servers.',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
    });

    const [descriptor] = toMcpToolDescriptors([entry]);

    expect(descriptor).toMatchObject({
      name: 'list_ssh_servers',
      title: 'List SSH servers',
      description: 'List configured SSH servers.',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
    });
  });

  it('derives annotations from each entry risk', () => {
    const descriptors = toMcpToolDescriptors([
      tool('list_ssh_servers', { risk: 'read' }),
      tool('sftp_write_file', { risk: 'write' }),
      tool('run_remote_command', { risk: 'exec' })
    ]);

    expect(
      descriptors.map((descriptor) => [
        descriptor.name,
        descriptor.annotations.readOnlyHint,
        descriptor.annotations.destructiveHint
      ])
    ).toEqual([
      ['list_ssh_servers', true, false],
      ['sftp_write_file', false, false],
      ['run_remote_command', false, true]
    ]);
  });

  it('emits annotations the MCP SDK keeps when it parses tools/list', () => {
    const descriptors = toMcpToolDescriptors([
      tool('run_remote_command', { risk: 'exec' })
    ]);

    const parsed = ListToolsResultSchema.parse({ tools: descriptors });

    expect(parsed.tools[0]?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true
    });
  });

  it('fails closed when a Bridge published a tool without a risk', () => {
    const withoutRisk = {
      name: 'run_remote_command',
      title: 'run_remote_command',
      description: 'no risk field',
      inputSchema: { type: 'object', properties: {} }
    } as ToolCatalogEntry;

    const [descriptor] = toMcpToolDescriptors([withoutRisk]);

    expect(descriptor?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true
    });
  });
});

describe('hub meta tools exposed through tools/list', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-annotations-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('annotates every Hub meta tool as read-only (INV-6)', async () => {
    const runtime = await createHubRuntime({
      home,
      hostApp: 'cursor',
      hubVersion: '0.1.0'
    });

    try {
      const descriptors = toMcpToolDescriptors(await runtime.listToolsForMcp());

      expect(descriptors.map((descriptor) => descriptor.name)).toEqual([
        ...HUB_BUILTIN_TOOL_NAMES
      ]);
      for (const descriptor of descriptors) {
        expect(descriptor.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false
        });
      }
    } finally {
      await runtime.close();
    }
  });
});
