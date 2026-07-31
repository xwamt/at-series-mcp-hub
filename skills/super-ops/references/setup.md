# AT Series MCP setup

Read when AT Series is missing, disconnected, or only meta-tools appear and no healthy providers show up.

## Preconditions

- Install the **MCP build** of the needed plugin(s) (not a base-only VSIX that skips Hub contribution).
- Keep the IDE window for each needed plugin open and activated so bridges publish under `~/.at-series/bridges/<hostApp>/`.
- MCP clients should have a single server entry named **AT Series** running `node` against `~/.at-series/mcp/hub.js` with progressive-discovery env (written by Hub installer).

Prefer each plugin's command-palette **Install/Repair AT Series MCP Config** (thin call into Hub `ensure` — same canonical shape every time).

## Recovery

1. Confirm the plugin window is running.
2. Run Install/Repair AT Series MCP Config (or hand-write the AT Series entry).
3. If `~/.at-series/mcp/hub.js` is missing, reload the IDE window so hub sync can elect the packaged bundle.
4. Restart/refresh the MCP client.
5. Verify with `at_list_providers` — expect `protocolVersion: 2` and healthy bridges for needed `pluginId`s.
6. Then `at_select_tools` and refresh `tools/list`.

## Canonical Cursor/Kiro entry

```json
{
  "mcpServers": {
    "AT Series": {
      "command": "node",
      "args": ["C:/Users/YOU/.at-series/mcp/hub.js"],
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

Installer `autoApprove` is Hub meta only. Business tools are registered via bridges, not mcp.json.

## Progressive discovery env

| Env | Installer default |
| --- | --- |
| `AT_SERIES_TOOL_DISCOVERY` | `auto` |
| `AT_SERIES_TOOL_DISCOVERY_THRESHOLD` | `20` |
| `AT_SERIES_TOOL_SELECTION_IDLE_MS` | `0` (disables idle auto-clear) |
| `AT_SERIES_TOOL_SELECTION_MAX_CALLS` | `0` (disabled) |

Preserve unrelated MCP servers when editing client config. Do not auto-approve write/exec business tools as a substitute for operational safety.

## Duplicate hub processes

Only one `node …/hub.js` should serve the IDE connection. Orphan Hub processes keep separate in-memory selections and confuse testing — stop extras if `tools/list` and select disagree.
