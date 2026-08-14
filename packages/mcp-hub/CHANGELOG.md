# Changelog

All notable changes to `@at-series/mcp-hub`.
This package is consumed by AT Terminal, AT JumpServer, AT Grafana, and AT Nacos —
every entry below is written for those plugin authors.

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
