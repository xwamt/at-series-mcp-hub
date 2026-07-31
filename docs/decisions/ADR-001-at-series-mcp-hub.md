# ADR-001: AT Series shared MCP Hub with dynamic Bridge registration

## Status
Accepted

## Date
2026-07-23

## Context

AT-family plugins (AT Terminal, AT JumpServer Terminal, and future products) each shipped:

- a per-plugin stdio MCP server (`dist/mcp-server.js`)
- a localhost Bridge in the extension host for credentials/UI/context
- a separate IDE MCP config entry

This caused:

- multiple MCP processes when multiple AT plugins were installed
- repeated IDE MCP config edits on each new plugin install
- versioned extension path breakage in MCP configs
- duplicated discovery/protocol code across repos

Constraints that remain true (from AT Terminal ADR-002 lineage):

- credentials and confirmation UI must stay in the extension host
- pure stdio MCP cannot call VS Code APIs directly
- external MCP clients (Continue/Codex/Kiro/Cursor) must keep working

## Decision

Extract a shared **AT Series MCP Hub** (`@at-series/mcp-hub`) with a normative **Protocol v1**:

1. IDE configures **one** MCP server named **`AT Series`**, pointing at stable `~/.at-series/mcp/hub.js`.
2. Each capability plugin runs a Bridge implementing `GET /health`, `GET /tools`, `POST /invoke`.
3. Plugins publish registry records under `~/.at-series/bridges/<hostApp>/<bridgeId>.json` including tool manifests and `risk`.
4. Hub aggregates tools dynamically for the current `AT_SERIES_HOST_APP` and routes invokes to Bridges.
5. Hub runtime is **embedded** in MCP-capable plugins, synced with semver election (no downgrade; same semver overwrites only when `bundleSha256` differs).
6. Remove per-plugin MCP stdio entries and remove `languageModelTools` as a product surface.
7. Skill documentation lives in the Hub project as a **single** series skill.
8. Ship as **one** npm package `@at-series/mcp-hub` (protocol + registry + hub runtime + publisher + MCP config installer helpers). Do **not** ship a shared Bridge HTTP framework — plugins implement Bridge endpoints themselves.
9. `risk=write|exec` tools MUST keep (or gain) in-plugin confirmation during migration.

Normative Bridge details: `docs/protocol/v1.md`.

### V2 follow-up: progressive tool exposure

Accepted 2026-07-31: when the Hub catalog is large, use a progressive hybrid surface: agents discover providers and tools through Hub meta-tools, select relevant tools, then invoke those selected tools as first-class MCP tools. The Hub retains an `off` escape hatch for full-list compatibility.

This does **not** reopen the rejected meta-tools-only alternative. Meta-tools remain discovery and selection aids; they are not the sole permanent capability surface. Bridge publication remains the complete v1 `GET /tools` catalog, so V2a requires no plugin code changes.

Normative Hub-exposure details: `docs/protocol/v2.md`.

## Alternatives Considered

### Independent Hub extension users must install first
- Pros: clearest ownership of hub.js
- Cons: extra install step; single-plugin users fail if Hub missing
- Rejected for v1 primary path (may revisit later)

### Keep per-plugin MCP servers, only share code
- Pros: smaller migration
- Cons: does not solve multi-process / multi-config UX
- Rejected

### Static tool union hard-coded in Hub
- Pros: simple list
- Cons: every new plugin requires Hub release; offline tools pollute catalog
- Rejected

### Meta-tools only (`call_provider_tool`)
- Pros: trivial aggregation
- Cons: worse agent UX than first-class tools
- Rejected as sole surface

## Consequences

- New plugins can integrate by implementing Protocol v1 without Hub business changes
- Tool catalogs become dynamic; clients need `tools/list_changed` support for best UX
- hostApp isolation prevents cross-IDE accidental routing
- AT Terminal base/mcp dual variants can remain; only MCP-capable builds contribute Hub
- Migration must rewrite old MCP server names to `AT Series`
- Cross-repo protocol changes require protocolVersion discipline

## Follow-ups

- Implement Hub runtime + publisher helpers
- Migrate AT Terminal MCP variant and JumpServer
- Move series skill into this repo
- v2 naming dual-publish (`3 -> 2` plan from product decision)

## Requirements Traceability

Full grilled requirements and acceptance criteria: [../requirements.md](../requirements.md).

