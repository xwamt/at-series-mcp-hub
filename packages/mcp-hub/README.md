# `@at-series/mcp-hub`

Shared AT Series MCP Hub runtime, registry publisher, hub bundle sync, and IDE MCP config installer helpers.

**Current version:** `0.3.3` — Hub protocol surface **2** (progressive tool discovery); Bridge wire remains **1**.

## Install

```bash
npm install @at-series/mcp-hub
```

## Public surface (plugin-facing)

| Export | Role |
|--------|------|
| Protocol types / constants / path helpers | Bridge v1 + Hub v2 contracts in `src/protocol` |
| `FsBridgePublisher` | Publish / heartbeat / unpublish registry records |
| `syncHubBundle` | Elect `~/.at-series/mcp/hub.js` by semver + hash |
| `ensureAtSeriesMcpConfig` / `uninstallAtSeriesMcpConfig` | Write/repair/remove the single `AT Series` MCP entry |
| `defaultAutoApproveToolNames` | Optional helper: Hub meta-tools + `risk=read` registry tools. **Installer does not use this** (autoApprove is meta-only) |
| `detectHostApp` | `detectHostApp({ appName?, appRoot?, uriScheme?, extensionPath? })` → `hostApp` slug |
| `createHubRuntime` | stdio Hub (packaged as `hub.js`) |

Hub bundle entry for **build-time** resolve / copy into the VSIX `dist/`:

```ts
require.resolve('@at-series/mcp-hub/hub')
// -> package dist/hub.js (use at pack time; production activate should use extension dist/hub.js)
```

See [`docs/guides/plugin-integration.md`](../../docs/guides/plugin-integration.md) for `copy-hub.mjs` and `await syncHubBundle` **before** `ensureAtSeriesMcpConfig`.

## Progressive discovery (Hub v2)

When the catalog is large (or `AT_SERIES_TOOL_DISCOVERY=always`), cold `tools/list` exposes Hub meta-tools only. Agents `at_select_tools`, then call selected tools as first-class MCP tools after `list_changed`. See repo [`docs/protocol/v2.md`](../../docs/protocol/v2.md) and skill [`skills/super-ops`](../../skills/super-ops/SKILL.md).

## Docs

| Doc | Role |
|-----|------|
| [`docs/protocol/v1.md`](../../docs/protocol/v1.md) | Bridge wire contract |
| [`docs/protocol/v2.md`](../../docs/protocol/v2.md) | Hub progressive exposure |
| [`docs/guides/plugin-integration.md`](../../docs/guides/plugin-integration.md) | Plugin integration |
| [`README.md`](../../README.md) | Repo overview |

## Note

This package does **not** include a Bridge HTTP framework. Plugins implement `GET /health`, `GET /tools`, and `POST /invoke` themselves per protocol v1.
