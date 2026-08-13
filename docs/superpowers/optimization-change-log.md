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
| 验证 | `git check-ignore` 逐条确认白名单只放行本轮 4 个文件，未波及既有 plans/specs |
| 提交 | `9044141`（分支 `chore/at-series-optimization-phase0`） |

<!-- 新条目追加到本行以下，保持时间倒序或正序需全程一致：本台账采用正序（越新越靠下） -->

### 2026-08-13 · P0-T1 · 三仓补齐 .gitattributes，冻结换行策略

| 字段 | 内容 |
|---|---|
| 仓库 | at-terminal-series、at-jumpserver-series、at-series-mcp-hub |
| 动机 | X3：CRLF/LF 噪声淹没真实改动，terminal 仓 158 个文件变更中仅 20 个为真 |
| 代码 diff | 三仓各新增 `.gitattributes`（20 行，内容与 at-grafana-series 逐字节一致） |
| 契约影响 | 否 |
| 文档 diff | 无 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 INV-1..INV-6 均未涉及（纯仓库配置，不触及代码与协议） |
| 验证 | `cmp` 确认三份文件与 at-grafana-series 模板逐字节一致；`git check-attr text eol` 输出：at-terminal-series `src/extension.ts: text: auto` / `src/extension.ts: eol: lf`，at-jumpserver-series `src/extension.ts: text: auto` / `src/extension.ts: eol: lf`，at-series-mcp-hub `packages/mcp-hub/src/index.ts: text: auto` / `packages/mcp-hub/src/index.ts: eol: lf`；`git show --stat HEAD` 三仓均为 `1 file changed, 20 insertions(+)`；`git show HEAD:.gitattributes` 三仓 blob 均不含 CR |
| 提交 | at-terminal-series `c19bff1`、at-jumpserver-series `c903f46`、at-series-mcp-hub `652a00f`（均在分支 `chore/at-series-optimization-phase0`） |

### 2026-08-13 · P0-T2a · 甄别未提交在制品，修订阶段 0 Task 3/4

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub（仅计划文档） |
| 动机 | 阶段 0 Task 2 的人工裁决点：四仓 76 个文件的未提交改动来源不明，需定性后才能继续 |
| 代码 diff | 无 |
| 契约影响 | 否 |
| 文档 diff | `docs/superpowers/plans/2026-08-13-phase0-restore-verifiability.md` 的 Task 2 Step 3/4、Task 3 全部、Task 4 引言 |
| protocolVersion | 不变 |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 INV-4/INV-5：在制品 B（OPTIMIZE-P1）与核心 B 同向——渐进发现约束工具 schema 数量，本条约束工具返回值体积，予以保留 |
| 验证 | `git diff --ignore-cr-at-eol --stat` 四仓；逐一读取 `protocol/index.ts`、`package.json`、`toolCatalog.ts`、`bridgeSchemas.ts`、`SftpAgentService.ts` 的实际 diff 内容定性 |
| 提交 | 见下条 |

**甄别结论：** 76 个文件是两条连贯在制品，非实验残留。

- **在制品 A（hostApp 上收）**：hub 导出 `detectHostApp` / `slugifyHostAppId`，版本 `0.2.1 → 0.2.2`，`v1.md` +17，导出测试 +11；三插件删除本地 `src/mcp/hostApp.ts` 与其测试，改 `file:` 依赖。已遵守 AGENTS.md §2.1。
- **在制品 B（OPTIMIZE-P1）**：terminal 的 `sftp_list_directory` 加 `maxEntries`/`truncated`/`total`；jumpserver 的 `jumpserver_list_assets` 加 `search`+分页；grafana 的 `grafana_get_dashboard` 加 `fields`/`panelIds`/`titleContains` 投影；hub 的 `skills/super-ops/**` 同步。

**对计划的修正（重要）：** 原 Task 3「三插件回退到 npm `^0.2.1`」被证伪——在制品 A 已删除插件本地 `hostApp.ts` 并改从 hub 导入 `detectHostApp`，而该导出只存在于未发布的 0.2.2，回退会导致 import 不存在的符号。用户裁决：两条在制品均保留并拆分提交；先发布 hub 0.2.2 修复构建，阶段 1 再发 0.3.0。

