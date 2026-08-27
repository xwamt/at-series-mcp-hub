# AT Grafana (`at.grafana`)

Select first:

```json
{ "mode": "replace", "pluginIds": ["at.grafana"] }
```

All tools are `risk: read`. Only instances with **Allow Agent background access** appear.

## Two families

- **Management** — Grafana's own config: dashboards, folders, alert rules/history.
- **Monitoring** — real metrics/logs behind a datasource (Prometheus, Loki, …), with Grafana as the auth boundary.

| Need | Tool |
| --- | --- |
| Discover usable instances | `grafana_list_instances` |
| Dashboards / folders | `grafana_list_dashboards`, `grafana_list_folders`, `grafana_get_dashboard` |
| Alert rules / history | `grafana_list_alert_rules`, `grafana_get_alert_rule`, `grafana_get_alert_history` |
| Prometheus query | `grafana_query_prometheus` |
| Loki query | `grafana_query_loki` |
| Other datasource / unusual path | `grafana_query_datasource` (escape hatch only) |

Prefer typed `grafana_query_prometheus` / `grafana_query_loki`. Do not use `grafana_query_datasource` for ordinary PromQL/LogQL.

## Payload discipline

- **Default for triage:** `grafana_get_dashboard` with `fields: "targets"` plus optional `titleContains` / `panelIds`. Returns expr + datasource only (no `fieldConfig` / `options` / layout).
- `fields: "summary"` — panel inventory (id/title/type/datasource) when choosing panels.
- `fields: "full"` — complete model; **only** for dashboard audit/edit, never for metric triage.
- Call `grafana_get_dashboard` at most **1–2 times** per investigation; reuse extracted targets instead of re-fetching.
- Loki / log queries: set `limit` ≤ **50–100**. If the result has `truncated: true`, **narrow** time range, labels, or query — never fix truncation by raising the limit or dumping more lines.
- Bound every Prom/Loki query by time window and selectors. No unrestricted log floods into agent context.

## Workflow

1. Always start with `grafana_list_instances`. Empty → tell the user no instance has background access; do not invent `instanceId`.
2. Management path: list → `get_dashboard` with `fields: "targets"` (or `summary` then `targets`). Use expressions + datasource uid only.
3. Monitoring path: `grafana_list_datasources` for `datasourceUid` → `grafana_query_prometheus` or `grafana_query_loki` with a tight window. Use `grafana_query_datasource` only for other datasources (`GET`/`POST`, path under the datasource proxy).
4. If a query result has `truncated: true`, narrow the time range or query and retry — do not treat truncation as a hard failure, and do not inflate limits.
5. Never surface Service Account tokens or credential-shaped values.

## Quick examples

**Dashboard panel spike:** `list_instances` → `list_dashboards` → `get_dashboard` `{ fields: "targets", titleContains: "QPS" }` (≤1–2) → `grafana_query_prometheus` with a tight window → then `grafana_query_loki` for business logs (see SuperOps fast path / [db-qps-spike.md](db-qps-spike.md) when QPS-related).

**Firing alerts:** `list_instances` → `list_alert_rules` (filter firing) → `get_alert_rule` / `get_alert_history`.

## Related

- [db-qps-spike.md](db-qps-spike.md) for time-boxed QPS.
- [compose-knowledge.md](compose-knowledge.md) when writing PromQL/LogQL, not querying live data.
- [observability.md](observability.md) for signal correlation rules.

## Common mistakes

- Calling `grafana_query_datasource` for ordinary PromQL/LogQL.
- Fetching `fields: "full"` during metric triage.
- Raising Loki `limit` when `truncated: true` instead of narrowing the query.
