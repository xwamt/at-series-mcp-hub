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

### 2026-08-13 · P0-T2b · 按工作流拆分提交两条在制品

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub、at-terminal-series、at-jumpserver-series、at-grafana-series |
| 动机 | X3；甄别结论见 P0-T2a，两条在制品均保留。四仓混杂的未提交改动无法单独回溯或回滚，按工作流拆成 8 个提交（每仓先 A 后 B），使 hostApp 上收与 OPTIMIZE-P1 各自成为可独立 revert 的单元 |
| 代码 diff | **在制品 A（hostApp 上收）**：hub `b94d4f5`（9 文件）新增 `packages/mcp-hub/src/protocol/detectHostApp.ts` 与 `test/protocol.detectHostApp.test.ts`，`src/protocol/index.ts` +6 导出 `detectHostApp`/`slugifyHostAppId`/`DetectHostAppInput`，`packages/mcp-hub/package.json` 版本 `0.2.1 → 0.2.2`，`test/protocol.exports.test.ts` +11/-1，文档 4 篇。三插件 terminal `76c0b52` / jumpserver `535beb0` / grafana `01ee038` 各 5 文件、内容同构：`git rm src/mcp/hostApp.ts`（-44）与 `test/mcp/hostApp.test.ts`（-47），`src/extension.ts` 与 `src/mcp/McpConfigInstaller.ts` 改为 `import { detectHostApp } from '@at-series/mcp-hub'`，`scripts/copy-hub.mjs` 停止硬编码 `protocolVersion: 1`、改读 `AT_SERIES_HUB_PROTOCOL_VERSION`（+14/-4）。<br>**在制品 B（OPTIMIZE-P1 控制 Agent 工具返回值体积）**：hub `d1680ef`（8 文件）`skills/super-ops/SKILL.md` +38/-9、6 篇 references 同步、新增 `references/db-qps-spike.md`。terminal `d7c6284`（12 文件）`src/agent/SftpAgentService.ts` +18 加 `maxEntries`（默认 500 / 硬顶 5000）与 `truncated`/`total`，`src/agent/AgentToolService.ts`、`src/mcp/{BridgeProtocol,bridgeSchemas,toolCatalog}.ts` 透传并在工具描述写明默认值与上限，`test/agent/SftpAgentService.test.ts` +75、`test/mcp/toolCatalog.test.ts` +19、`test/docs/AtTerminalMcpSkill.test.ts` +3，`docs/features{,.zh-CN}.md`、`skills/at-terminal-mcp/**`。jumpserver `a60a621`（11 文件）`src/mcp/toolCatalog.ts` +42/-20 与 `bridgeSchemas.ts` 为 `jumpserver_list_assets` 加 `search`+`limit`/`offset`（默认 200 / 硬顶 500），`src/mcp/BridgeServer.ts` 走 schema 校验，`src/agent/JumpServerAgentToolService.ts` +50、`src/sftp/JumpServerSftpSession.ts` +41 加 `maxEntries` 与流式截断读，`src/agent/TerminalExecutors.ts` 输出上限 128K/512K → 64K/256K，3 个测试 +166，`skills/**`。grafana `4393012`（14 文件）新增 `src/agent/projectDashboard.ts` + 测试，`src/mcp/bridgeSchemas.ts` +28/-3 为 `grafana_get_dashboard` 加 `fields`(`full`/`summary`/`targets`) + `panelIds` + `titleContains`，`src/agent/GrafanaAgentToolService.ts` 服务端投影，`src/mcp/toolCatalog.ts`、`src/grafana/GrafanaDashboardsApi.ts`，3 个测试，`docs/{features,features.zh-CN,requirements}.md`、`docs/decisions/ADR-004-mcp-tool-catalog-and-permission-model.md`、`skills/at-grafana-mcp/SKILL.md` |
| 契约影响 | **是** —— 触及 AGENTS.md §2.1 的「publisher / hub sync / installer helper 的对外契约」：`@at-series/mcp-hub` 公共导出面新增 `detectHostApp` / `slugifyHostAppId` / `DetectHostAppInput`，并把 `hostApp` 由「枚举值」正式改述为「不透明 slug，表内取值仅为稳定别名而非白名单」 |
| 文档 diff | `docs/protocol/v1.md` **+15/-2**：`hostApp` 取值表标题改为「aliases only, not an allowlist」；`unknown` 行改为「无任何可用身份信号时才允许，且有信号时 MUST NOT 发布为 `unknown`」；新增 *(any other slug)* 行覆盖 VS Code 分支（`joycode-editor`/`antigravity`）；新增 `detectHostApp` 的 5 条 MUST 探测顺序（`extensionPath` → `uriScheme` → `appName`/`appRoot` → `uriScheme=vscode` → `unknown`）；新增「MUST NOT 把不同的未识别 IDE 收敛到共享 `unknown` 桶（破坏 host 隔离）」。配套 `docs/guides/plugin-integration.md` 1 行、`docs/requirements.md` D24 1 行、`README.md` 集成示例 +6/-1 |
| protocolVersion | 不变（Bridge 1 / Hub 2）。理由：本次是**纯新增导出 + 语义澄清**，无线协议字段增删、无字段语义反转、无既有导出签名变更；未引用新导出的插件在 0.2.1 下行为完全不变，向后兼容，因此不满足升版条件 |
| 插件需跟改 | **是** —— 三插件已删除本地 `hostApp.ts` 并改为从 hub 导入，而 `node_modules` 中的 0.2.1 尚无该导出，**三仓当前处于构建失败状态**。须在下一个任务发布 hub 0.2.2 并把三仓依赖提到 `^0.2.2`；按本任务约定，`package.json` / `package-lock.json` 的依赖改动已全部留在工作区未提交 |
| 核心不变量 | 已核对 INV-1..INV-6 未被破坏。INV-4/INV-5 与在制品 B **同向**：渐进发现约束的是「工具 schema 数量」，本条约束的是「工具返回值体积」，两者叠加而非冲突。B 的全部新增入参均为 optional 且默认值保持原语义（`grafana_get_dashboard` 缺省 `fields=full` 与旧行为逐字节一致），工具集合、工具名、risk 分级均未改变；jumpserver 输出上限从 128K/512K 收紧到 64K/256K 是唯一的默认值变化，与 terminal 对齐，且截断有 `truncated` 显式标记 |
| 验证 | 四仓 `git status --short`：**at-series-mcp-hub** 已跟踪文件 0 处改动，仅 4 条 untracked（`docs/handoffs/OPTIMIZE-S0-skills.md`、`docs/handoffs/PROXY-SETUP-antigravity-ide-macos.md`、`docs/reports/`、`docs/research/`）；**at-terminal-series** ` M docs/releases/0.3.0.md`、` M package-lock.json`、` M package.json`、`?? docs/handoffs/`；**at-jumpserver-series** ` M package-lock.json`、` M package.json`、` M test/mcp/p0c.functional.e2e.test.ts`、`?? test/docs/` 与 16 条 `?? docs/superpowers/{plans,specs}/*`；**at-grafana-series** 27 条 ` M`/` D` + 4 条 `??`，但 `git diff --name-only` 仅 6 项——对全部 26 个「已修改且存在」的文件逐一比对 `git hash-object <f>` 与 `git rev-parse :<f>`，结果 **21 个哈希完全一致**（工作区 CRLF / 索引 LF 造成 stat 尺寸不符的假阳性，`git diff` 为空），真实内容改动只有 `.vscodeignore`、`docs/plans/2026-07-30-at-grafana-entry-logo-design.md`、`scripts/package.mjs`、`package.json`、`package-lock.json` 加 ` D media/icon.svg`。**未达成「只剩 package.json / package-lock.json」的预期**，残留 3 个属于第三条工作流的文件，见下方说明 |
| 提交 | 在制品 A：at-series-mcp-hub `b94d4f5`、at-terminal-series `76c0b52`、at-jumpserver-series `535beb0`、at-grafana-series `01ee038`；在制品 B：at-series-mcp-hub `d1680ef`、at-terminal-series `d7c6284`、at-jumpserver-series `a60a621`、at-grafana-series `4393012`（均在分支 `chore/at-series-optimization-phase0`，未推送远程） |

**未归入 A/B 的残留（如实记录，未塞进任何提交）：**

- **第三条工作流「AT Grafana 入口 logo / 打包资产」**：grafana 的 `.vscodeignore`（+3 注释，保留 media 入口图标）、`scripts/package.mjs`（+17，VSIX 打包时断言三个 logo 资产与 manifest icon 路径）、`docs/plans/2026-07-30-at-grafana-entry-logo-design.md`（±14，G 弧线 path 调整到右半区）、` D media/icon.svg`、`?? media/at-grafana-{icon.png,icon.svg,activity.svg}`。与 hostApp 探测和返回值体积均无关，是独立的一条在制品，需单独裁决。
- **terminal `docs/releases/0.3.0.md`**：把 ADR-004/ADR-005 的仓内相对链接改为 GitHub 绝对 URL。两个 ADR 文件在本地 `docs/decisions/` 中均存在，因此不是修链接失效，而是面向已发布 README/Marketplace 渲染的改动，属「公开仓库文档」工作流。
- **jumpserver `test/mcp/p0c.functional.e2e.test.ts`**：唯一改动是 `it(...)` 标题里的乱码字节，由 `e2 86 3f`（`→` 的残缺 UTF-8）变为 `ef bf bd 3f`（U+FFFD 替换字符）。编辑器重存产生的编码噪声，无语义。
- **untracked 历史文档**：hub 的 `docs/handoffs/`、`docs/reports/`、`docs/research/`，jumpserver 的 16 篇 `docs/superpowers/{plans,specs}/*`（日期 2026-05 ~ 2026-08-05）与 `test/docs/JumpServerMcpDocs.test.ts`（6 月 2 日，断言 hub 化之前的 SKILL.md 文案），terminal / grafana 的 `docs/handoffs/`。均早于本轮优化，不属于 A/B。

**残留项的后续归属（2026-08-13 补充判定）：** 第三条工作流「入口 logo / 打包资产」不需要单独裁决——它与阶段 0 **Task 6**（把 grafana 打包所需图标纳入版本控制）是同一件事，已完成一半，并入 Task 6 收尾。terminal 的 `0.3.0.md` 链接改动随 Task 6 一并提交。jumpserver 的编码噪声随 **Task 4** 处理。

### 2026-08-13 · P0-T3a · 验证 hub 0.2.2 具备发版条件（发布动作被阻塞）

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | X2：三插件在 P0-T2b 后处于构建失败状态（已改从 hub 导入 `detectHostApp`，而 npm 上的 0.2.1 无该导出），必须发布 0.2.2 才能恢复 |
| 代码 diff | 无源码改动。`package-lock.json` 因 `rm -rf node_modules && npm install` 重新生成（本机重装以解决缺 `@rollup/rollup-darwin-arm64`、`.bin/tsc` 无执行位的跨平台拷贝问题） |
| 契约影响 | 否（本条目仅为验证，契约变更已记在 P0-T2b） |
| 文档 diff | 无 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 是——待 0.2.2 发布后三插件依赖提到 `^0.2.2`（Task 3 Step 3–7） |
| 核心不变量 | 已核对 INV-1..INV-6：本条仅构建与验证，未改任何运行时行为 |
| 验证 | `npm run typecheck` 通过；`npm run build` + `npm run build:hub` 成功，产出 `Bundled hub.js (0.2.2) -> dist/hub.js`；`npm test` 在沙箱内 4 失败（全部为 `EPERM: mkdir '.../.cursor'`，沙箱禁止创建该名目录），**沙箱外复跑 20 文件 / 109 用例全部通过**。导出链已双重确认：`dist/protocol/index.d.ts:48` 含 `detectHostApp`/`slugifyHostAppId` 类型导出；`node -e "require('./dist/index.js')"` 运行时 `typeof detectHostApp === 'function'`。`npm pack --dry-run` 产物含 `LICENSE`/`README.md`/`dist/**` |
| 提交 | 见下条（lockfile） |

**阻塞：`npm publish` 无法由 Agent 执行。** `npm whoami` 返回 `need auth`；包 maintainer 为 `xwaimt <xwaimt@gmail.com>`。需要用户本人登录后发布，命令见总纲下方的交接说明。

**顺带发现（记录不处理）：** `npm pack` 产物含 `dist/hub.js.map` **1.4 MB**，比 `dist/hub.js`（786 KB）还大，随包分发到三个插件。属审计的 P2-6，留待阶段 2 处理，不阻塞 0.2.2。

