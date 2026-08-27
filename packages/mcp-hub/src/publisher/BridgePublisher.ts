import fs from 'node:fs/promises';
import os from 'node:os';
import { atomicWriteFile, ensureDir } from '../fs/atomicWrite';
import type {
  BridgePublisher,
  BridgeRegistryRecord,
  ToolCatalogEntry
} from '../protocol/index';
import { bridgeRecordPath, bridgesDirForHostApp } from '../protocol/paths';

export class FsBridgePublisher implements BridgePublisher {
  /**
   * Copy of the record as last written to disk by this instance. Heartbeats
   * run every ≤30 s for the life of the extension host; re-reading and
   * re-parsing our own file each time bought nothing, since this publisher is
   * the only legitimate writer of its `<bridgeId>.json`. `undefined` (never
   * published here, or after unpublish) falls back to reading the disk.
   */
  private lastWritten: BridgeRegistryRecord | undefined;

  constructor(
    private readonly opts: {
      home?: string;
      bridgeId: string;
      hostApp: string;
    }
  ) {}

  private get home(): string {
    return this.opts.home ?? os.homedir();
  }

  private get recordPath(): string {
    return bridgeRecordPath(this.opts.hostApp, this.opts.bridgeId, this.home);
  }

  async publish(record: BridgeRegistryRecord): Promise<void> {
    if (record.bridgeId !== this.opts.bridgeId) {
      throw new Error(
        `bridgeId mismatch: record=${record.bridgeId} opts=${this.opts.bridgeId}`
      );
    }
    if (record.hostApp !== this.opts.hostApp) {
      throw new Error(
        `hostApp mismatch: record=${record.hostApp} opts=${this.opts.hostApp}`
      );
    }

    await ensureDir(bridgesDirForHostApp(this.opts.hostApp, this.home));
    await this.write(record);
  }

  async updateTools(tools: ToolCatalogEntry[]): Promise<void> {
    const record = await this.readExisting();
    record.tools = tools;
    record.updatedAt = Date.now();
    await this.write(record);
  }

  async heartbeat(patch?: {
    updatedAt?: number;
    capabilities?: BridgeRegistryRecord['capabilities'];
  }): Promise<void> {
    const record = await this.readExisting();
    record.updatedAt = patch?.updatedAt ?? Date.now();
    if (patch?.capabilities !== undefined) {
      record.capabilities = {
        ...record.capabilities,
        ...patch.capabilities
      };
    }
    await this.write(record);
  }

  async unpublish(): Promise<void> {
    this.lastWritten = undefined;
    try {
      await fs.unlink(this.recordPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  /**
   * Registry files stay pretty-printed (protocol v1 §5 registry format —
   * this is an on-disk debugging surface, not MCP wire traffic). Caching the
   * parse of the exact serialized bytes keeps the cache provably identical to
   * what is on disk, with no aliasing into caller-owned objects.
   */
  private async write(record: BridgeRegistryRecord): Promise<void> {
    const serialized = JSON.stringify(record, null, 2);
    await atomicWriteFile(this.recordPath, serialized);
    this.lastWritten = JSON.parse(serialized) as BridgeRegistryRecord;
  }

  private async readExisting(): Promise<BridgeRegistryRecord> {
    if (this.lastWritten !== undefined) {
      // Fresh clone: callers mutate the result, and a failed write afterwards
      // must not leave those mutations behind in the cache.
      return JSON.parse(JSON.stringify(this.lastWritten)) as BridgeRegistryRecord;
    }
    const text = await fs.readFile(this.recordPath, 'utf8');
    return JSON.parse(text) as BridgeRegistryRecord;
  }
}
