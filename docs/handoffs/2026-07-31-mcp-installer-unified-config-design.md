# Design: Unified AT Series MCP installer config

**Date:** 2026-07-31  
**Status:** Approved for implementation  
**Repo:** `at-series-mcp-hub` (+ thin follow-ups in Terminal / JumpServer / Grafana plugins)

## Problem

Auto-written Cursor/Kiro/Continue MCP config for **AT Series** is wrong in production:

1. **Missing progressive-discovery env** (`AT_SERIES_TOOL_DISCOVERY*`, `AT_SERIES_TOOL_SELECTION_IDLE_MS`, `AT_SERIES_TOOL_SELECTION_MAX_CALLS`). Default Hub idle TTL (30s) plus Cursor’s tools/list gate caused “select succeeded but business tools cannot activate.”
2. **`autoApprove` is plugin-skewed** — each plugin passes its own `registryTools`, so the last Install/activation **overwrites** the shared `AT Series` entry (e.g. only JumpServer read tools + incomplete meta list).
3. Plugins incorrectly treat mcp.json as the place to register business tools. Business tools are published via **bridges → Hub**, not via per-plugin MCP server entries.

## Goals

- Single shared **`AT Series`** MCP entry written by **`@at-series/mcp-hub` installer helpers** as the source of truth.
- `autoApprove` = **Hub meta tools only** (option A).
- Env includes discovery / selection knobs; for Cursor workaround set **`AT_SERIES_TOOL_SELECTION_IDLE_MS=0`**.
- Keep **each plugin calling `ensure`** on activate / Install-Repair (idempotent).
- Do not require plugins to contribute business-tool names into mcp.json.

## Non-goals

- Changing Bridge wire protocol or Hub progressive-select runtime semantics beyond what env already controls.
- Fixing Cursor’s `list_changed` race inside Cursor itself.
- Re-introducing per-plugin MCP server names (`AT Terminal`, `AT JumpServer Terminal`, etc.).
- Auto-approving any `read` / `write` / `exec` business tools.

## Desired Cursor config shape

```json
{
  "mcpServers": {
    "AT Series": {
      "command": "node",
      "args": ["<home>/.at-series/mcp/hub.js"],
      "env": {
        "AT_SERIES_HOST_APP": "cursor",
        "AT_SERIES_TOOL_DISCOVERY": "auto",
        "AT_SERIES_TOOL_DISCOVERY_THRESHOLD": "20",
        "AT_SERIES_TOOL_SELECTION_IDLE_MS": "0",
        "AT_SERIES_TOOL_SELECTION_MAX_CALLS": "0"
      },
      "autoApprove": [
        "at_list_providers",
        "at_search_tools",
        "at_get_tool",
        "at_select_tools",
        "at_clear_tool_selection"
      ]
    }
  }
}
```

Same env keys for Kiro / Continue (`AT_SERIES_HOST_APP` set to the host). Path normalization and legacy migration behavior stay as today.

### Env defaults (installer-written)

| Key | Written value | Notes |
| --- | --- | --- |
| `AT_SERIES_HOST_APP` | installer `hostApp` | Required |
| `AT_SERIES_TOOL_DISCOVERY` | `auto` | Progressive discovery |
| `AT_SERIES_TOOL_DISCOVERY_THRESHOLD` | `20` | String in JSON env |
| `AT_SERIES_TOOL_SELECTION_IDLE_MS` | `0` | Disable idle auto-clear (Cursor activation workaround) |
| `AT_SERIES_TOOL_SELECTION_MAX_CALLS` | `0` | Call-budget path off |

Revisit `IDLE_MS=0` if Cursor reliably refreshes tools after `list_changed`.

## Architecture

```text
Plugin activate / Install-Repair
  → syncHubBundle (semver elect hub.js)     [unchanged]
  → ensureAtSeriesMcpConfig(...)            [shared desired shape]
       → buildAtSeriesMcpServerConfig()
       → isSame? → no write : write once
```

- **Hub installer** owns desired `command` / `args` / `env` / `autoApprove`.
- **Plugins** keep thin wrappers that detect host + call `ensureAtSeriesMcpConfig` **without** passing plugin catalogs for approval purposes.
- Bridges still publish tool catalogs to `~/.at-series/bridges/<hostApp>/`; Hub runtime exposes them after `at_select_tools`.

## Multi-plugin ensure (explicitly retained)

Every AT Series plugin may call `ensure` on activation. That is required so the first installed plugin still creates the entry regardless of which plugin it is.

After this change, **desired config is identical** across plugins (for a given `hostApp` + hub path). Therefore:

| Situation | Result |
| --- | --- |
| Entry already matches desired | `{ updated: false }`, **no disk write** |
| Old entry missing env keys or wrong autoApprove | **One upgrade write** |
| Another plugin ensures again with same Hub logic | no-op |

`syncHubBundle` remains separate: higher Hub semver wins; same version+hash → no-op.

### Tests required

- Two sequential `ensureAtSeriesMcpConfig` calls with the new desired shape → second returns `updated: false`.
- Existing entry with only `AT_SERIES_HOST_APP` + JumpServer-style autoApprove → first ensure upgrades; content equals desired shape.
- `autoApprove` never includes business tool names even if `registryTools` still passed (compat / ignore).

## API / code changes (hub package)

### `buildAtSeriesMcpServerConfig` (`installer/serverConfig.ts`)

- Expand `env` type to include the discovery/selection keys above.
- `autoApprove` always `defaultAutoApproveToolNames({ registryTools: [] })` or equivalent **builtins-only** helper (ignore `registryTools` for approval list).
- Keep optional `registryTools` param temporarily for call-site compatibility but document as **unused for autoApprove**; prefer deprecating in types/docs.

### `isSameAtSeriesMcpServerConfig`

- Compare **all** written env keys (not only `HOST_APP`).
- Compare full `autoApprove` list as today.

### `defaultAutoApproveToolNames` / docs

- Document that installer default is **meta-only**.
- README / plugin-integration / setup samples: remove “meta + risk=read registry tools” as installer default; clarify read-risk guidance remains for *optional* manual allowlists, not auto-write.

### Plugin follow-ups (separate commits/PRs ok)

In `at-terminal-series`, `at-jumpserver-series`, `at-grafana-series`:

- Stop passing `AT_*_TOOL_CATALOG` into `ensureAtSeriesMcpConfig` (or pass nothing).
- Update installer tests that expect business tools in `autoApprove`.
- Update setup skill samples to show new env + meta-only autoApprove.
- Bump dependency on `@at-series/mcp-hub` once published.

## Error handling & safety

- Preserve unrelated `mcpServers` entries.
- Continue stripping legacy AT MCP names via existing migrate helpers.
- Never autoApprove `write`/`exec` (and under this design, not `read` business tools either).
- Uninstall still removes only the `AT Series` entry / Continue yaml.

## Rollout

1. Implement + test in `at-series-mcp-hub`; bump package version.
2. Update plugins to depend on new hub; ship MCP VSIX builds.
3. Users: run any plugin’s **Install/Repair AT Series MCP Config** (or reload so activate ensure upgrades once).

## Success criteria

- Fresh install / repair produces the desired shape above.
- Installing a second AT plugin does not churn mcp.json when already current.
- Stale JumpServer-only autoApprove is repaired to meta-only + full env.
- Progressive discovery remains `auto`; idle clear disabled via written `IDLE_MS=0`.
