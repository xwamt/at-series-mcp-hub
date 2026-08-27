# Compose external knowledge (do not duplicate)

SuperOps operates live AT Series tools. It does not teach IaC, PromQL, or compliance frameworks. When the user is **authoring** (not operating a live system), install an external skill instead of copying cookbooks into this folder.

Do **not** `npx skills add bagelhole/DevOps-Security-Agent-Skills` as a whole pack — that floods the skill index and fights the 1+1 reference cap.

| User is… | Install / read | Do not |
| --- | --- | --- |
| Writing or reviewing PromQL / LogQL / dashboard JSON | `npx skills add grafana/skills` (`promql`, `loki`, `dashboarding`, `alerting-irm`) | Duplicate query language here; do not add official `uvx mcp-grafana` unless asked |
| Writing Kubernetes manifests, Helm, or hardening baselines | A **single** relevant skill (e.g. `kubernetes-ops` or `kubernetes-hardening`) if they asked to author YAML | Replace [kubernetes.md](kubernetes.md) diagnosis; do not `kubectl exec -it` via this skill |
| Writing Terraform / cloud IaC / CI pipelines | The matching external skill for that tool | Run `terraform destroy` or apply via SuperOps without Safe operations |
| Hardening the Hub/plugin MCP itself (authors) | `mcp-server-security` as optional reading | Load 30 KB of MCP threat-model into every ops session |
| Talking to Nacos through MCP | AT Nacos (`at.nacos`) via SuperOps | Official `nacos-group/nacos-mcp-server` unless the user asked for that server |

Execution stays on AT Series tools. External skills are knowledge only.
