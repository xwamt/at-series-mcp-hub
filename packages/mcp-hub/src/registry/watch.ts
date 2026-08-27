import fs from 'node:fs';
import path from 'node:path';
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
 * Snapshot of the registry directory's `.json` entries (name + mtime + size),
 * per protocol v1 §8.4. Polling compares fingerprints so an unchanged
 * directory does not fire `onChange` every interval — before this, every poll
 * tick triggered a full catalog refresh (readdir + parse + HTTP probes).
 *
 * Sync on purpose: the baseline is taken before `watchBridgeRegistry` returns
 * so a write that lands right after cannot hide inside an async first
 * snapshot; a registry directory holds a handful of small files, so the
 * blocking cost per tick is negligible on this fallback path.
 */
function directoryFingerprint(dir: string): string {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    // Missing or unreadable directory reads the same as empty: its later
    // reappearance (or the files inside) is the change we want to report.
    return '';
  }

  const parts: string[] = [];
  for (const name of names) {
    if (path.extname(name).toLowerCase() !== '.json') {
      continue;
    }
    try {
      const stat = fs.statSync(path.join(dir, name));
      parts.push(`${name}\u0000${stat.mtimeMs}\u0000${stat.size}`);
    } catch {
      // Deleted between readdir and stat; record the name so the next tick
      // (where it is fully gone) still registers as a change.
      parts.push(`${name}\u0000gone`);
    }
  }
  // readdir order is filesystem-dependent; sort so ordering noise never
  // masquerades as a change.
  parts.sort();
  return parts.join('\n');
}

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

  // Poll ticks fire onChange only when the fingerprint moved. Native watch
  // events are NOT filtered through the fingerprint: an atomic temp+rename
  // produces events whose net stat delta can be invisible, and the event
  // itself is already proof that something happened.
  const startPolling = (): void => {
    mode = 'poll';
    let lastFingerprint = directoryFingerprint(dir);
    pollTimer = setInterval(() => {
      const fingerprint = directoryFingerprint(dir);
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        schedule();
      }
    }, pollIntervalMs);
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
      startPolling();
    });
    mode = 'watch';
  } catch {
    startPolling();
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
