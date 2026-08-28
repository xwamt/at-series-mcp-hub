# Changelog

All notable changes to `@at-series/mcp-hub`.
This package is consumed by AT Terminal, AT JumpServer, AT Grafana, and AT Nacos —
every entry below is written for those plugin authors.

## 0.3.3

### Changed

- **Hub hot path no longer blocks on bridge probes** (requirements D12/H9,
  [protocol/v1.md §8](../../docs/protocol/v1.md)). `createHubRuntime` returns
  immediately and runs the first catalog baseline in the background;
  `tools/list` reuses the in-memory catalog when a refresh completed within
  the last 2s; `tools/call` routes from memory and only runs one on-demand
  refresh on a winner miss. On-demand passes skip bridges whose last probe
  failure is newer than 4s; the 5s timer skips healthy bridges probed
  successfully within 15s; registry records with `updatedAt` older than 90s
  are treated as stale without an HTTP probe (v1 §5).
- **Per-bridge `/health` and `/tools` are probed concurrently** (v1 §8.2).
  Tools bytes are adopted only when health succeeded.
- **Invoke transport failures demote the bridge in memory immediately**
  (v1 §8.3.5) before failing over to the next same-pluginId bridge; a
  `NOT_FOUND` / target-unknown `VALIDATION_ERROR` response also fails over
  once (v1 §8.3.6).
- **Selection winner grace** ([protocol/v2.md §4](../../docs/protocol/v2.md)):
  a selected name missing from the winner set is retained for 15s of
  continuous absence, so a health blip no longer forces a new
  `at_select_tools` after recovery. `tools/list` still exposes only
  `selected ∩ current winners`.
- **Default `AT_SERIES_TOOL_SELECTION_IDLE_MS` is now `120000`** (was 30s),
  aligned with the 120s `/invoke` confirmation ceiling; business invoke
  completion now also counts as selection activity (v2 §4.1). The MCP config
  installer still writes an explicit `0`.
- **Slimmer meta-tool responses** (v2 §3): `at_list_providers` serializes
  compact JSON; `at_search_tools` hit descriptions are truncated to
  `SEARCH_DESCRIPTION_MAX_CHARS` (120; new export) while `at_get_tool` keeps
  the full text; meta-tool descriptions were shortened.
- Audit records are handed to `AuditLogger` with raw params/preview;
  redaction and truncation run on the asynchronous write path only
  (v1 §3.4), never on the MCP response path.
- Registry **poll fallback** compares a directory fingerprint (name +
  mtime + size) and only fires `onChange` when it changes (v1 §8.4).
- `listBridgeRecords` reads registry JSON files concurrently, preserving
  `readdir` order.
- `withFileLock` steals a lock immediately when its recorded `pid` is
  dead, even if `acquiredAt` is fresh (v1 §8.6). Unparseable lock files
  younger than 250ms are treated as still being written, not stolen.
- `atomicWriteFile` retries `rename` twice on `EPERM`/`EBUSY`/`EACCES`.
- `FsBridgePublisher.heartbeat` / `updateTools` reuse an in-memory copy
  of the last written record instead of re-reading the file.

### Migration

No plugin code changes. Bridge wire stays `protocolVersion: 1`; Hub surface
stays `2`. Bridges should keep heartbeating at least every 30s — records
older than 90s are now actually skipped as stale.

## 0.3.2

### Added

- **Hub-local agent ops audit log.** Business `tools/call` is recorded as JSONL
  under `~/.at-series/logs/<hostApp>/agent-ops-YYYY-MM-DD-<pid>.jsonl`. Disable
  with `AT_SERIES_AUDIT_LOG=false`. Meta-tools are not recorded. Writes are
  async (queue cap 100) and must not change the MCP result. See
  [protocol/v1.md §3.4](../../docs/protocol/v1.md).

### Changed

- Installer `autoApprove` is documented as **Hub meta-tools only** (no business
  `risk=read` tools). Protocol §9, requirements D20/C6, and `AGENTS.md` now
  match the implementation.
- Plugin integration guide now covers `detectHostApp({ ... })`, VSIX
  `copy-hub.mjs` packaging, `await syncHubBundle` before
  `ensureAtSeriesMcpConfig`, `uninstallAtSeriesMcpConfig`, Continue
  `workspaceFolder`, and heartbeat `capabilities` patches.

### Migration

Bump the plugin dependency so `syncHubBundle` elects this semver over `0.3.0`.
Bridge wire stays `1`; Hub surface stays `2`.

## 0.3.0

### Security

- **Outbound redirects are now refused.** The Hub→Bridge client sends
  `redirect: 'error'`. Previously a `3xx` from a Bridge port would forward
  `x-at-series-token` — and, on `307`, the full tool arguments — to whatever
  host the `Location` named. See [protocol/v1.md §7.1](../../docs/protocol/v1.md).
- **Bridge responses are capped at 2 MiB**, matching the request-side limit
  v1 already specified. Oversized responses are aborted mid-stream instead of
  being buffered into the Hub process.
- **Timing-safe token helpers.** `timingSafeEqualToken` and `createBridgeToken`
  are now exported from `@at-series/mcp-hub` to prevent timing side-channel attacks.
- **Atomic permission-preserving writes.** `atomicWriteFile` and `withFileLock`
  prevent race conditions and ensure files/directories adhere to `0600`/`0700` modes.

### Fixed

- `GET /tools` (5 s) and `POST /invoke` (120 s) now have abort timeouts. A
  wedged Bridge used to hang every `tools/list` and `tools/call` indefinitely.
- A non-`ENOENT` registry read failure no longer terminates the Hub. The
  previous catalog is retained and the cause is logged to stderr.
- `syncHubBundle` now validates the real on-disk SHA-256 hash of `hub.js` before
  skipping bundle synchronization.
- Configuration installer handles syntax errors (comments, trailing commas) gracefully
  without overwriting user config files, preserves indentation (2/4 spaces, tabs),
  and writes `.bak` backups.

### Added

- `BridgeRequestOptions` (exported) — optional `timeoutMs` override on
  `bridgeGetHealth`, `bridgeGetTools`, and `bridgeInvoke`.
- `AT_SERIES_LOG_LEVEL` (`silent` | `error` | `warn` | `info`, default `warn`)
  controls stderr diagnostics. Tokens are redacted from log lines.
- `detectHostApp` / `slugifyHostAppId` / `DetectHostAppInput` are now exported,
  unifying IDE environment detection across all plugins.
- MCP Tool Annotations mapping for `risk` attributes (`read` / `write` / `exec`).

### Changed

- Bridges are probed in parallel during catalog refresh. Registry ordering is
  preserved, so conflict-tie winners are unchanged.

### Migration

No plugin code changes are required. Bridge wire `protocolVersion` stays `1`.
Verify that your Bridge answers `/health` and `/tools` from cached state
within the §7.8 ceilings rather than doing product I/O on those paths.

## 0.2.2

### Added

- `detectHostApp` / `slugifyHostAppId` / `DetectHostAppInput` initial export.
