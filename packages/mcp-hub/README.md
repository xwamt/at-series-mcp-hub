# `@at-series/mcp-hub`

Shared AT Series MCP Hub runtime, registry publisher, hub bundle sync, and IDE MCP config installer helpers.

## Install

```bash
npm install @at-series/mcp-hub
```

## Public surface (plugin-facing)

| Export | Role |
|--------|------|
| Protocol types / constants / path helpers | Contracts in `src/protocol` (re-exported from package root) |
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

Integrate against the published protocol — do not reverse-engineer Hub internals:

| Doc | Role |
|-----|------|
| [`docs/protocol/v1.md`](../../docs/protocol/v1.md) | **Normative interface contract** (registry, Bridge HTTP, Hub routing, MCP config) |
| [`docs/guides/plugin-integration.md`](../../docs/guides/plugin-integration.md) | Step-by-step plugin integration |
| [`docs/requirements.md`](../../docs/requirements.md) | Product scope and acceptance |
| [`docs/decisions/ADR-001-at-series-mcp-hub.md`](../../docs/decisions/ADR-001-at-series-mcp-hub.md) | Architecture rationale |
| [`AGENTS.md`](../../AGENTS.md) | Repo agent / migration conventions |
| [`README.md`](../../README.md) | Repo overview and activate example |

## Note

This package does **not** include a Bridge HTTP framework. Plugins implement `GET /health`, `GET /tools`, and `POST /invoke` themselves per [`docs/protocol/v1.md`](../../docs/protocol/v1.md).
