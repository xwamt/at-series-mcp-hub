# Phase S0 — SuperOps 技能层优化（本仓执行）

在 **本仓库** `at-series-mcp-hub` 落地技能优化。不要改插件业务代码；不要 commit，除非用户另说。

## 背景

一次 MySQL QPS 排障会话暴露：技能导致更慢、更费 token、结论停在指标相关性。方案见会话结论；本任务只做 **S0 技能层**。

## 必做

### 1. 改 `skills/super-ops/SKILL.md`

- 增加 **限时故障快路径**（QPS/延迟/错误尖峰）：确认尖峰 → 找放大面（只取 top）→ **立刻查业务日志** → 才写根因。
- Canvas：根因未确认前禁止；仅用户要报告或根因钉死后。
- Discovery：**每任务一轮** select；优先 `GetMcpTools(server, toolName=…)`；调查中途禁止 `at_clear_tool_selection`。
- Reference：**当前假设最多 1 份 provider appendix + 1 份 ops reference**；删除「凡适用都加载」。
- 停手条件：MQ/RPS/QPS 同涨 = 传播链；无应用侧触发事件 → 只能标假设，不得当根因。

### 2. 改 references

| 文件 | 改动 |
|------|------|
| `references/grafana.md` | 只摘 targets/datasource；禁止复述 fieldConfig/options；get_dashboard ≤1–2 次；Loki limit≤50–100；truncated 必须收窄；若工具支持 `fields=targets` 则优先用 |
| `references/incident-response.md` | 「不要只靠日志」≠ 可跳过日志；DB/队列尖峰必须有业务触发证据 |
| `references/observability.md` | 同上；强调禁止无限制日志灌进上下文 |
| `references/databases.md` | 补 Grafana→Com_*→上游业务日志路径 |
| `references/terminal.md` | maxOutputBytes/maxBytes/truncated；禁默认 nginx -T / 无界 list |
| `references/jumpserver.md` | 同上 + SQL 必须 LIMIT；truncated 时收窄查询而非加大输出 |

### 3. 新增 `references/db-qps-spike.md`

一页 runbook：窄窗确认 QPS → 分解 SQL 类型 → top HTTP/MQ → Loki 业务关键字（batch/approve/job）→ 批次号串链路 → 结论。

### 4. 同步安装副本（若存在）

同步更新：

- `C:\Users\alan\.agents\skills\super-ops\`
- `C:\Users\alan\.cursor\skills\super-ops\`（若与仓库是拷贝关系）

保持与 `skills/super-ops` 一致。

## 验收

- SKILL 明确快路径与停手条件。
- grafana/terminal/jumpserver 有 payload 纪律。
- 有 `db-qps-spike.md` 且被 SKILL 路由表引用。
- 不改 protocol / Hub runtime（H3 不做）。

## 完成后

用简体中文回复：改了哪些文件、关键要点摘要。不要 push、不要开 PR，除非用户要求。
