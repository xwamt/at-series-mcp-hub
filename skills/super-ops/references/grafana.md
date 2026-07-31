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
| Datasources / query | `grafana_list_datasources`, `grafana_query_datasource` |

## Workflow

1. Always start with `grafana_list_instances`. Empty → tell the user no instance has background access; do not invent `instanceId`.
2. Management path: list → get dashboard/rule by `uid`. Read panel `targets` for expressions and `datasource` uid.
3. Monitoring path: `grafana_list_datasources` → `grafana_query_datasource` with `method` (`GET`/`POST` only), datasource-native `path` (e.g. Prometheus `api/v1/query_range`, Loki `loki/api/v1/query_range`), and `query`/`body` from step 2.
4. If a query result has `truncated: true`, narrow the time range or query and retry — do not treat truncation as a hard failure.
5. Never surface Service Account tokens or credential-shaped values.

## Quick examples

**Dashboard panel spike:** `list_instances` → `list_dashboards` → `get_dashboard` → read panel expr + datasource uid → `query_datasource` with a tight window.

**Firing alerts:** `list_instances` → `list_alert_rules` (filter firing) → `get_alert_rule` / `get_alert_history`.
