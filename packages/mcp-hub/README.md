# `@at-series/mcp-hub`

Shared AT Series MCP Hub runtime, registry publisher, hub bundle sync, and IDE MCP config installer helpers.

## Install

```bash
npm install @at-series/mcp-hub
```

## Public surface (plugin-facing)

| Export | Role |
|--------|------|
| Protocol types / constants / path helpers | Contracts from `docs/protocol/v1.md` |
| `FsBridgePublisher` | Publish / heartbeat / unpublish registry records |
| `syncHubBundle` | Elect `~/.at-series/mcp/hub.js` by semver + hash |
| `ensureAtSeriesMcpConfig` / `uninstallAtSeriesMcpConfig` | Write/repair/remove the single `AT Series` MCP entry |
| `defaultAutoApproveToolNames` | `risk=read` tools + `at_list_providers` |
| `createHubRuntime` | stdio Hub (used by packaged `hub.js`) |

Hub bundle entry for packaging:

```ts
require.resolve('@at-series/mcp-hub/hub')
// -> dist/hub.js
```

## Docs

- Normative protocol: [`docs/protocol/v1.md`](../../docs/protocol/v1.md)
- Integration guide: [`docs/guides/plugin-integration.md`](../../docs/guides/plugin-integration.md)
- Agent rules: [`AGENTS.md`](../../AGENTS.md)
- Repo quick start: [`README.md`](../../README.md)

## Note

This package does **not** include a Bridge HTTP framework. Plugins implement `GET /health`, `GET /tools`, and `POST /invoke` themselves.
