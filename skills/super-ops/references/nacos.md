# AT Nacos (`at.nacos`)

Select first:

```json
{ "mode": "replace", "pluginIds": ["at.nacos"] }
```

All MCP tools are `risk: read`. Only instances with **Allow Agent background access** appear. Publish / rollback / delete stay in the IDE UI.

## Two families

- **Plugin connections** — configured Nacos servers the agent may use (`nacos_list_instances`).
- **Nacos data** — namespaces, configs, services, cluster, listeners/subscribers on one `instanceId`.

| Need | Tool |
| --- | --- |
| Discover usable plugin connections | `nacos_list_instances` |
| Namespaces | `nacos_list_namespaces` |
| Config metadata (no bodies) | `nacos_list_configs` |
| Config body (redacted by default) | `nacos_get_config` |
| Config history | `nacos_list_config_history`, `nacos_get_config_history` |
| Registered services | `nacos_list_services`, `nacos_get_service` |
| Service **hosts** (IP/port/health) | `nacos_list_service_instances` |
| Listeners / subscribers | `nacos_list_config_listeners`, `nacos_list_listened_configs`, `nacos_list_service_subscribers` |
| Cluster nodes / metrics | `nacos_get_cluster_nodes` |

`nacos_list_instances` ≠ `nacos_list_service_instances`. Do not invent `instanceId`.

## Payload discipline

- Always start with `nacos_list_instances`. Empty → tell the user to enable **Allow Agent background access**.
- Default namespace id is `""` on Nacos 1.x/2.x and the literal `public` on 3.x — do not substitute one for the other.
- `nacos_list_configs` / `nacos_list_config_history` omit bodies. Use get tools for content.
- `nacos_get_config` / `nacos_get_config_history` redact secrets by default. Pass `raw: true` only when the user explicitly needs unredacted content.
- Pagination defaults `pageNo` 1 / `pageSize` 100 (max 500). Filter with `group` / `dataId` / `serviceName` instead of raising page size.
- `nacos_get_service` is metadata only; hosts require `nacos_list_service_instances` (group defaults to `DEFAULT_GROUP`).
- Never surface tokens, passwords, or AK/SK.

## Workflow

1. `nacos_list_instances` → pick `instanceId`.
2. Config path: `nacos_list_namespaces` → `nacos_list_configs` with filters → `nacos_get_config`. History: list then get by `nid`.
3. Service path: `nacos_list_services` → `nacos_get_service` and/or `nacos_list_service_instances`. Subscribers when diagnosing who consumes a service.
4. Listener path: config → `nacos_list_config_listeners`; client IP → `nacos_list_listened_configs`.
5. Cluster health: `nacos_get_cluster_nodes`. 3.x may omit metrics.

## Quick examples

**Missing or stale config:** `list_instances` → `list_namespaces` → `list_configs` `{ group, dataId }` → `get_config` (keep redaction) → optional `list_config_listeners`.

**Unhealthy service hosts:** `list_instances` → `list_services` `{ serviceName }` → `list_service_instances` (not `nacos_list_instances`) → `list_service_subscribers` if consumers look wrong.

## Related

- Plugin skill `at-nacos-mcp` for the full 13-tool table.
- [grafana.md](grafana.md) when correlating a bad config with QPS/latency (add Grafana; do not clear).
- [compose-knowledge.md](compose-knowledge.md) is not a Nacos cookbook.

## Common mistakes

- Using `nacos_list_instances` as the registered-host list.
- Treating 1.x/2.x empty namespace id as `public`.
- Passing `raw: true` on every `get_config`.
- Calling official `nacos-mcp-server` tools against AT Series.
