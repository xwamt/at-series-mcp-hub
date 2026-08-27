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
| Resolve current terminal (SSH, MySQL, Redis) | `jumpserver_get_terminal_context` | read |
| Interactive terminal input (SSH, MySQL, Redis) | `jumpserver_send_terminal_input` | exec |
| Non-interactive SSH command | `jumpserver_run_terminal_command` | exec |
| SFTP browse / meta / read | `jumpserver_sftp_list_directory`, `jumpserver_sftp_stat_path`, `jumpserver_sftp_read_file` | read |
| SFTP create / write / rename / delete | `jumpserver_sftp_create_file`, `jumpserver_sftp_create_directory`, `jumpserver_sftp_write_file`, `jumpserver_sftp_rename`, `jumpserver_sftp_delete` | write |
| Execute SQL | `jumpserver_mysql_execute_sql` | exec |
| Execute Redis command | `jumpserver_redis_execute_command` | exec |

There are no separate MySQL get-context or send-input tools. Use `jumpserver_get_terminal_context` (`connectionKind`: `ssh` / `mysql` / `redis`) and `jumpserver_send_terminal_input` for interactive CLI.

## Payload discipline

- Command / SQL / Redis defaults: `maxOutputBytes` **64KB** (hard cap **256KB**). Prefer bounded `journalctl -n` / `tail` / greps.
- SFTP read defaults: `maxBytes` **64KB** (hard cap **256KB**); reads are truncated, not whole-file buffered.
- SFTP list: `maxEntries` default **500** (hard cap 5000) with `truncated`/`total` — narrow the path when truncated.
- `jumpserver_list_assets`: use `search` / `limit` / `offset` (default limit 200); do not dump the full catalog into context.
- On truncation, **narrow the query** (time, path, WHERE clause) — do not enlarge output limits to “get everything”.
- **SQL must include `LIMIT`** (or equivalent row cap) on diagnostic selects. Prefer aggregates / top-N over full table scans.
- Redis: one non-blocking command per call; avoid `KEYS *` — prefer `SCAN` with a narrow pattern. Use send-input for `SUBSCRIBE` / `MONITOR` / `BLPOP`.
- **Forbidden by default:** `nginx -T`, unbounded directory walks, dumping entire log files, `SELECT *` without LIMIT on large tables.

## Workflow

1. `jumpserver_get_terminal_context` before targeting an active session; filter by `connectionKind` when needed.
2. `jumpserver_list_assets` with `search`/`limit` when the user has not named an asset.
3. Prefer `jumpserver_run_terminal_command` for bounded non-interactive SSH; use `jumpserver_send_terminal_input` only when interactivity is required.
4. SFTP: list/stat/read before write/delete/rename; keep `maxEntries`/`maxBytes` bounded.
5. SQL: prefer `jumpserver_mysql_execute_sql` with LIMIT; interactive MySQL CLI uses send-input.
6. Redis: prefer `jumpserver_redis_execute_command` for a single non-blocking command.
7. Do not mix with AT Terminal short names (`list_ssh_servers`, `run_remote_command`, …) — different provider, different sessions.
8. Expect IDE confirmation on write/exec tools; still ask the user before destructive or production-impacting changes.

## Ops references (mandatory when applicable)

Before any write/exec or other remote state change, load [safe-operations.md](safe-operations.md). Host/runtime/incident playbooks are shared with Terminal — load **one** matching ops reference (cap: 1 provider + 1 ops per hypothesis). QPS spikes: [db-qps-spike.md](db-qps-spike.md).

## Related

- [terminal.md](terminal.md) is a different provider (direct SSH). Do not mix short names.
- [databases.md](databases.md) / [db-qps-spike.md](db-qps-spike.md) for SQL diagnosis.

## Common mistakes

- Calling a removed MySQL get-context or send-input tool; use `jumpserver_get_terminal_context` / `jumpserver_send_terminal_input`.
- Using AT Terminal tool names against JumpServer sessions.
- `KEYS *` or `SELECT *` without LIMIT.
