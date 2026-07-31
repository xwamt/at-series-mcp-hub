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

## Workflow

1. `jumpserver_get_terminal_context` before targeting an active SSH session.
2. `jumpserver_list_assets` to discover asset IDs when the user has not named one.
3. Prefer `jumpserver_run_terminal_command` for bounded non-interactive work; use `jumpserver_send_terminal_input` only when interactivity is required.
4. SFTP: list/stat/read before write/delete/rename.
5. SQL: prefer `jumpserver_mysql_execute_sql`; use `jumpserver_mysql_send_input` only for interactive CLI cases.
6. Do not mix with AT Terminal short names (`list_ssh_servers`, `run_remote_command`, …) — different provider, different sessions.
7. Expect IDE confirmation on write/exec tools; still ask the user before destructive or production-impacting changes.

## Ops references (mandatory when applicable)

Before any write/exec or other remote state change, load [safe-operations.md](safe-operations.md). Host/runtime/incident playbooks are shared with Terminal — use the series skill ops router (linux, systemd, docker, incident-response, …).
