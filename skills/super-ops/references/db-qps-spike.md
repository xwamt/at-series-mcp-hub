# DB / MySQL QPS Spike (fast runbook)

Use for time-boxed MySQL / database QPS, Com_*, or query-rate spikes. Cap references: this file + at most one provider appendix (`grafana.md` or `jumpserver.md`).

## Path

1. **Confirm QPS in a narrow window** — Grafana Prom/range or equivalent; compare short baseline vs peak. No wide dashboard dumps.
2. **Decompose SQL types** — Com_select / Com_insert / Com_update / Com_delete (or engine equivalents). Note which type drives the spike.
3. **Top amplifier only** — top HTTP endpoints, MQ consumers, or job names (top-N). Do not list everything.
4. **Business logs next** — Loki / app / access / job logs in the same window. Prefer keywords: `batch`, `approve`, `job`, `retry`, deploy/release markers. Loki `limit` ≤ 50–100; if `truncated`, narrow query — do not raise limit.
5. **Correlate batch / request IDs** — one batchId / trace / job id across metrics → logs → (optional) SQL sample. Stop when the chain breaks; do not invent links.
6. **Conclude** — confirmed root cause only with application-side trigger evidence in the spike window. MQ/RPS/QPS co-rising alone = propagation, not origin. No app trigger → hypothesis only.

## Do not

- Treat panel fieldConfig / dashboard options as evidence.
- Skip logs because metrics already “correlate”.
- Open Canvas before root cause is nailed or the user asks for a report.
- Clear tool selection mid-investigation.
