# AT 系列优化 · 变更台账

> **这是本轮优化的唯一记忆载体。** 每完成一个 Task 必须在此追加一条，否则该 Task 视为未完成。
> 台账记录「改了什么 / 为什么 / 契约是否受影响 / 插件是否需要跟改」，用于回溯、回滚和跨仓对账。

**关联文档**
- 总纲：[`plans/2026-08-13-at-series-optimization-roadmap.md`](plans/2026-08-13-at-series-optimization-roadmap.md)
- 契约真源：[`docs/protocol/v1.md`](../protocol/v1.md)、[`docs/protocol/v2.md`](../protocol/v2.md)
- 硬门禁：[`AGENTS.md` §2.1](../../AGENTS.md)

---

## 条目格式

每条目必须填满以下字段。`契约影响` 为「是」时，`文档 diff` 不得为空——这是 AGENTS.md §2.1 的硬门禁。

```markdown
### YYYY-MM-DD · <Phase>-T<n> · <一句话标题>

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub / at-terminal-series / at-jumpserver-series / at-grafana-series |
| 动机 | 对应审计编号（如 H1、T3、X2）与一句话原因 |
| 代码 diff | `path/to/file.ts:行范围` 逐个列出 |
| 契约影响 | 是 / 否。是→列出触及 AGENTS.md §2.1 的哪一项 |
| 文档 diff | `docs/protocol/v1.md §7.1` 等；契约影响为否时填「无」 |
| protocolVersion | 不变(1/2) / 升至 N。升版必须写迁移说明 |
| 插件需跟改 | 否 / 是→列出仓库与具体动作 |
| 核心不变量 | 已核对 INV-1..INV-6 未被破坏（列出实际核对的编号） |
| 验证 | 实际运行的命令 + 观察到的输出摘要 |
| 提交 | commit sha |
```

---

## 台账

### 2026-08-13 · P-T0 · 建立优化计划与台账

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | 全量审计产出 14 个 P0 / 37 个 P1，需要可执行、可追溯的推进载体 |
| 代码 diff | 无（仅文档） |
| 契约影响 | 否 |
| 文档 diff | 新增 `docs/superpowers/optimization-change-log.md`、`docs/superpowers/plans/2026-08-13-at-series-optimization-roadmap.md`、`.../2026-08-13-phase0-restore-verifiability.md`、`.../2026-08-13-phase1-hub-outbound-hardening.md` |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | INV-1..INV-6 已在总纲中定义并冻结 |
| 验证 | 无需运行 |
| 提交 | 待提交 |

<!-- 新条目追加到本行以下，保持时间倒序或正序需全程一致：本台账采用正序（越新越靠下） -->
