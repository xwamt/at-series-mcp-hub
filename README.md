# @at-series/mcp-hub

AT Series shared MCP Hub: one stdio MCP entry for all AT-family IDE plugins.

This repository is the **single source of truth** for:

- Bridge registration protocol
- Hub runtime contract
- TypeScript protocol package (`@at-series/mcp-hub` protocol types)
- Series-level MCP skill (planned)

## Status

Design / contract phase. Implementation follows `docs/protocol/v1.md`.

## Docs

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | **Agent implementation guide** (this repo + plugin migration checklists) |
| [docs/requirements.md](docs/requirements.md) | **Grilled product requirements** (decisions, scope, acceptance) |
| [docs/protocol/v1.md](docs/protocol/v1.md) | **Normative** interface specification (start here for new plugins) |
| [docs/guides/plugin-integration.md](docs/guides/plugin-integration.md) | Plugin integration checklist |
| [docs/decisions/ADR-001-at-series-mcp-hub.md](docs/decisions/ADR-001-at-series-mcp-hub.md) | Architecture decision record |
| [packages/protocol/src/index.ts](packages/protocol/src/index.ts) | Typed contracts mirroring v1 |

## Product model (summary)

- IDE configures **one** MCP server: `AT Series` -> `~/.at-series/mcp/hub.js`
- Each capability plugin runs a localhost **Bridge** in the extension host
- Plugins publish bridge records under `~/.at-series/bridges/<hostApp>/`
- Hub aggregates tools dynamically and routes `tools/call` via `POST /invoke`
- Credentials, confirmations, and domain logic stay inside plugins

## Quick links for plugin authors

1. Read **Protocol v1** end-to-end
2. Follow **Plugin integration guide**
3. Implement Bridge HTTP: `GET /health`, `GET /tools`, `POST /invoke`
4. Publish registry record with `protocolVersion: 1` and tool `risk` levels
5. Do **not** ship a separate per-plugin MCP stdio server entry

