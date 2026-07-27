import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  BridgePublisher,
  BridgeRegistryRecord,
  ToolCatalogEntry
} from '../protocol/index';
import { bridgeRecordPath, bridgesDirForHostApp } from '../protocol/paths';

export class FsBridgePublisher implements BridgePublisher {
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

    const dir = bridgesDirForHostApp(this.opts.hostApp, this.home);
    await fs.mkdir(dir, { recursive: true });
    await this.tryChmod(dir, 0o700);
    await this.atomicWrite(this.recordPath, JSON.stringify(record, null, 2));
  }

  async updateTools(tools: ToolCatalogEntry[]): Promise<void> {
    const record = await this.readExisting();
    record.tools = tools;
    record.updatedAt = Date.now();
    await this.atomicWrite(this.recordPath, JSON.stringify(record, null, 2));
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
    await this.atomicWrite(this.recordPath, JSON.stringify(record, null, 2));
  }

  async unpublish(): Promise<void> {
    try {
      await fs.unlink(this.recordPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  private async readExisting(): Promise<BridgeRegistryRecord> {
    const text = await fs.readFile(this.recordPath, 'utf8');
    return JSON.parse(text) as BridgeRegistryRecord;
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(
      dir,
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    await fs.writeFile(tmpPath, content, 'utf8');
    await this.tryChmod(tmpPath, 0o600);
    await fs.rename(tmpPath, filePath);
    await this.tryChmod(filePath, 0o600);
  }

  private async tryChmod(target: string, mode: number): Promise<void> {
    try {
      await fs.chmod(target, mode);
    } catch {
      // Windows and some filesystems: best-effort
    }
  }
}
