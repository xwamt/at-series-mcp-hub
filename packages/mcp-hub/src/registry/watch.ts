import fs from 'node:fs';
import { bridgesDirForHostApp } from '../protocol/paths';

export type WatchBridgeRegistryOptions = {
  hostApp: string;
  home?: string;
  onChange: () => void;
  /** Polling interval when fs.watch is unavailable. Capped at 3000ms. */
  pollIntervalMs?: number;
  /** Debounce window for coalescing FS events. Default 150ms. */
  debounceMs?: number;
};

export type WatchBridgeRegistryHandle = {
  close: () => void;
  /** Which notification strategy is active. */
  mode: 'watch' | 'poll';
};

/**
 * Watch `~/.at-series/bridges/<hostApp>/` for create/update/delete.
 * Prefers `fs.watch`; falls back to polling ≤ 3s when watch throws/unsupported.
 */
export function watchBridgeRegistry(
  options: WatchBridgeRegistryOptions
): WatchBridgeRegistryHandle {
  const dir = bridgesDirForHostApp(options.hostApp, options.home);
  const debounceMs = options.debounceMs ?? 150;
  const pollIntervalMs = Math.min(
    Math.max(options.pollIntervalMs ?? 2000, 100),
    3000
  );

  fs.mkdirSync(dir, { recursive: true });

  let closed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let watcher: fs.FSWatcher | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let mode: 'watch' | 'poll' = 'watch';

  const schedule = (): void => {
    if (closed) {
      return;
    }
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      if (!closed) {
        options.onChange();
      }
    }, debounceMs);
  };

  try {
    watcher = fs.watch(dir, () => {
      schedule();
    });
    watcher.on('error', () => {
      // If the watcher dies mid-run, fall back to polling once.
      if (closed || pollTimer !== undefined) {
        return;
      }
      try {
        watcher?.close();
      } catch {
        // ignore
      }
      watcher = undefined;
      mode = 'poll';
      pollTimer = setInterval(schedule, pollIntervalMs);
    });
    mode = 'watch';
  } catch {
    mode = 'poll';
    pollTimer = setInterval(schedule, pollIntervalMs);
  }

  return {
    mode,
    close: () => {
      closed = true;
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      if (watcher) {
        try {
          watcher.close();
        } catch {
          // ignore
        }
        watcher = undefined;
      }
    }
  };
}
