import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHubRuntime } from '../src/hub/server';

describe('catalog refresh resilience', () => {
  it('degrades instead of rejecting when the registry directory is unreadable', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-hub-resilience-'));
    // Make `bridges/cursor` a FILE where a directory is expected -> ENOTDIR.
    await fs.mkdir(path.join(home, '.at-series', 'bridges'), { recursive: true });
    await fs.writeFile(path.join(home, '.at-series', 'bridges', 'cursor'), 'not a dir');

    const runtime = await createHubRuntime({
      hostApp: 'cursor',
      hubVersion: '0.3.0',
      home
    });

    // Must resolve, not reject: a broken registry is not a fatal condition.
    const tools = await runtime.listToolsForMcp();

    // Hub built-ins must survive a registry failure.
    const names = tools.map((t) => t.name);
    expect(names).toContain('at_list_providers');
    expect(names).toContain('at_select_tools');

    await runtime.close();
    await fs.rm(home, { recursive: true, force: true });
  });
});
