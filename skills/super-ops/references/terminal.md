# AT Terminal (`at.terminal`)

Select first:

```json
{ "mode": "replace", "pluginIds": ["at.terminal"] }
```

Or a minimal set, e.g. `{ "mode": "replace", "names": ["get_terminal_context", "list_ssh_servers", "run_remote_command"] }`.

## Tool map

| Need | Tool | Risk |
| --- | --- | --- |
| Resolve terminals / focus | `get_terminal_context` | read |
| List background-authorized servers | `list_ssh_servers` | read |
| Non-interactive remote command | `run_remote_command` | exec |
| List / stat / read remote files | `sftp_list_directory`, `sftp_stat_path`, `sftp_read_file` | read |
| Create / write remote files or dirs | `sftp_create_file`, `sftp_create_directory`, `sftp_write_file` | write |

## Payload discipline

- Set `maxOutputBytes` / `maxBytes` (or tool-equivalent caps) on command and SFTP reads; keep defaults modest.
- Prefer `tail` / `journalctl -n` / time-bounded greps over full file dumps. On truncation, **narrow** the query — do not raise caps blindly.
- **Forbidden by default:** `nginx -T`, unbounded `find` / recursive SFTP list of large trees, `cat` of huge logs, piping unlimited output into context.
- SFTP `list`: shallow paths with expected small directories; do not walk production roots. `sftp_list_directory` returns at most **500** entries by default (`maxEntries`, hard cap 5000) with `truncated`/`total` — when truncated, narrow the path rather than raising the cap blindly.

## Workflow

1. Call `get_terminal_context` unless the user already gave a clear `serverId` / `terminalId`. If multiple targets remain possible, ask; never guess.
2. Prefer read-only evidence. A diagnose request does not authorize a fix.
3. `run_remote_command`: bounded, non-interactive only. Start with a POSIX comment in the conversation language:

```sh
# Purpose: inspect recent failures for example.service
journalctl -u example.service -n 100 --no-pager
```

4. SFTP: `stat` / `read` before write; keep POSIX paths; bound `maxBytes`.
5. `list_ssh_servers` only returns servers with **Allow background connections**. `run_remote_command` may use a connected UI terminal, or background-authorized servers when no UI session is open.
6. Report target, evidence, actions, exit status, verification, remaining risk. Never claim an unverified result.

## Ops references (mandatory when applicable)

Before any write/exec or other remote state change, load [safe-operations.md](safe-operations.md). For host/runtime/incident work, load **one** matching ops reference from the series skill router (not every applicable file). Cap: 1 provider appendix + 1 ops reference per hypothesis.

## Related

- [jumpserver.md](jumpserver.md) for 堡垒机 sessions — do not mix short names.
- [workspace-troubleshooting.md](workspace-troubleshooting.md) when correlating this repo with a remote host.

## Common mistakes

- Guessing `serverId` / `terminalId` when multiple targets remain possible.
- Raising `maxOutputBytes` instead of narrowing the command after truncation.
- Using JumpServer `jumpserver_*` names on AT Terminal.
