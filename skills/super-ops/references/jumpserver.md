# AT JumpServer Terminal (`at.jumpserver`)

Select first:

```json
{ "mode": "replace", "pluginIds": ["at.jumpserver"] }
```

Keep the IDE window with AT JumpServer Terminal open so its bridge stays healthy in `~/.at-series`.

## Tool map

| Need | Tool | Risk |
| --- | --- | --- |
| List JumpServer assets | `jumpserver_list_assets` | read |
| Resolve SSH terminal context | `jumpserver_get_terminal_context` | read |
| Interactive terminal input | `jumpserver_send_terminal_input` | exec |
| Non-interactive SSH command | `jumpserver_run_terminal_command` | exec |
| SFTP browse / meta / read | `jumpserver_sftp_list_directory`, `jumpserver_sftp_stat_path`, `jumpserver_sftp_read_file` | read |
| SFTP create / write / rename / delete | `jumpserver_sftp_create_file`, `jumpserver_sftp_create_directory`, `jumpserver_sftp_write_file`, `jumpserver_sftp_rename`, `jumpserver_sftp_delete` | write |
| MySQL terminal context | `jumpserver_mysql_get_context` | read |
| Execute SQL | `jumpserver_mysql_execute_sql` | exec |
| Interactive MySQL CLI input | `jumpserver_mysql_send_input` | exec |

## Payload discipline

- Command / SQL defaults: `maxOutputBytes` **64KB** (hard cap **256KB**). Prefer bounded `journalctl -n` / `tail` / greps.
- SFTP read defaults: `maxBytes` **64KB** (hard cap **256KB**); reads are truncated, not whole-file buffered.
- SFTP list: `maxEntries` default **500** (hard cap 5000) with `truncated`/`total` — narrow the path when truncated.
- `jumpserver_list_assets`: use `search` / `limit` / `offset` (default limit 200); do not dump the full catalog into context.
- On truncation, **narrow the query** (time, path, WHERE clause) — do not enlarge output limits to “get everything”.
- **SQL must include `LIMIT`** (or equivalent row cap) on diagnostic selects. Prefer aggregates / top-N over full table scans.
- **Forbidden by default:** `nginx -T`, unbounded directory walks, dumping entire log files, `SELECT *` without LIMIT on large tables.

## Workflow

1. `jumpserver_get_terminal_context` before targeting an active SSH session.
2. `jumpserver_list_assets` with `search`/`limit` when the user has not named an asset.
3. Prefer `jumpserver_run_terminal_command` for bounded non-interactive work; use `jumpserver_send_terminal_input` only when interactivity is required.
4. SFTP: list/stat/read before write/delete/rename; keep `maxEntries`/`maxBytes` bounded.
5. SQL: prefer `jumpserver_mysql_execute_sql` with LIMIT; use `jumpserver_mysql_send_input` only for interactive CLI cases.
6. Do not mix with AT Terminal short names (`list_ssh_servers`, `run_remote_command`, …) — different provider, different sessions.
7. Expect IDE confirmation on write/exec tools; still ask the user before destructive or production-impacting changes.

## Ops references (mandatory when applicable)

Before any write/exec or other remote state change, load [safe-operations.md](safe-operations.md). Host/runtime/incident playbooks are shared with Terminal — load **one** matching ops reference (cap: 1 provider + 1 ops per hypothesis). QPS spikes: [db-qps-spike.md](db-qps-spike.md).
