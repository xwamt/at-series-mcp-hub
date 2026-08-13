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

### 2026-08-13 · P0-T5b · 修正 .gitignore 的 CRLF 空模式并补齐缺失规则

| 字段 | 内容 |
|---|---|
| 仓库 | at-terminal-series、at-series-mcp-hub |
| 动机 | P0-T5 执行中发现：此前「三仓已忽略 `.ssh-terminal-manager/`」的结论是 `git check-ignore` 假阳性，四仓实际一个都没有 |
| 代码 diff | `at-terminal-series/.gitignore` +4（新增规则）；`at-series-mcp-hub/.gitignore` 全文 CRLF → LF 并新增规则（+28/-24） |
| 契约影响 | 否 |
| 文档 diff | 无 |
| protocolVersion | 不变 |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 INV-1..INV-6 均未涉及 |
| 验证 | 对照实验：不存在的路径 `zzz-not-ignored-xyz/` 在修正前于 terminal/jumpserver/hub 三仓均被报「已忽略」（匹配到空模式），grafana（LF）正确报未忽略；修正后四仓一致报未忽略，同时真规则 `.ssh-terminal-manager/` 在四仓均正确命中（terminal:59、jumpserver:23、hub:12、grafana:23） |
| 提交 | at-terminal-series `330ac81`、at-series-mcp-hub `6d523e9` |

**根因：** git 解析 `.gitignore` 时先判定「本行非空」、之后才剥掉行尾 `\r`，于是 CRLF 文件里的每个空行都变成一条**空模式**，而空模式会匹配任何带尾斜杠的查询路径。

**影响面：** 仅影响 `git check-ignore <path>/` 形式的验证结论；`git status` / `git add` 的目录遍历不受影响，**没有文件被误藏或误提交**。但它足以让人对忽略规则的存在性做出错误判断——本轮就发生了一次。

**教训（写给后续任务）：** 用 `git check-ignore` 验证忽略规则时，**必须先用一个不存在的路径做对照实验**，或直接 `grep` `.gitignore` 确认规则文本存在，不要只看 `check-ignore` 的返回。

**遗留：** `at-jumpserver-series/.gitignore` 工作区仍是 CRLF，但其索引已因 P0-T1 的 `.gitattributes` 归一为 LF，clone 出来是干净的；本地表现将在下次触碰该文件时自动消除。

### 2026-08-13 · P0-T3 · 改用本地构建依赖，恢复三插件可构建（不发 npm）

| 字段 | 内容 |
|---|---|
| 仓库 | at-terminal-series、at-jumpserver-series、at-grafana-series（+ at-series-mcp-hub 构建产物） |
| 动机 | X2：三插件在 P0-T2b 后构建失败（已改从 hub 导入 `detectHostApp`，npm 上的 0.2.1 无此导出） |
| 代码 diff | 无源码改动。三仓 `package-lock.json` 因 `rm -rf node_modules && npm install` 重新生成；`package.json` 的 `file:` 依赖声明保持不变 |
| 契约影响 | 否（契约变更已记在 P0-T2b） |
| 文档 diff | `plans/2026-08-13-phase0-restore-verifiability.md` 的 Task 3 全部重写、Task 7 加已解决说明、Task 8 的插件工作流改为跨仓检出 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否——依赖声明维持现状 |
| 核心不变量 | 已核对 INV-1..INV-6。INV-1 特别确认：VSIX 内 `hub-version.json` 为 `{"version":"0.2.2","protocolVersion":2}`，`syncHubBundle` 的单一入口语义未变 |
| 验证 | 三仓 `node_modules/@at-series/mcp-hub` 均为指向本地 hub 的符号链接，版本 `0.2.2`；terminal typecheck 干净 + **304/304** 测试通过；grafana typecheck 干净 + **294/294** 测试通过；jumpserver 余 4 个类型错误（交 Task 4）。VSIX 端到端验证：`npm run package:mcp` 产出的 `extension/dist/hub.js` 与本地 `packages/mcp-hub/dist/hub.js` sha256 **完全一致**（`af7add5ff61cca88f7da…`），`extension.js` 中 `slugifyHostAppId` 命中 9 次证明 hub 代码已内联 |
| 提交 | 待提交（用户要求先不提交） |

**决策变更（第三版，最终）：** 用户决定**不发布 npm 包**，改为保持 `file:` 本地构建依赖、hub 产物直接打进 VSIX。此前第一版「回退 `^0.2.1`」被 P0-T2a 证伪，第二版「发布 0.2.2」已完成全部发版前验证但不执行。

**这一决策的三项代价（已写进计划 Task 3，后续任务须遵守）：**

1. **构建顺序依赖**——必须先在 hub 仓 `npm run build && npm run build:hub`，插件才能装/构建；hub 的 `dist/` 是 gitignored，干净检出后不存在。
2. **CI 必须跨仓检出**——三个插件各自是独立 GitHub 仓库，`file:../at-series-mcp-hub/...` 在单仓 CI 里不存在。Task 8 的插件工作流已改为先 `actions/checkout` hub 仓、构建，再装插件依赖。
3. **VSIX 不可复现**——产物内容取决于构建时 hub 工作区的状态，含未提交改动。发布正式版本前应确认 hub 处于干净且已打标签的状态。

### 2026-08-13 · P0-T7 · 依赖漏洞随 lockfile 重建而清零（无需手动升级）

| 字段 | 内容 |
|---|---|
| 仓库 | 四仓 |
| 动机 | X5：jumpserver 7 个漏洞（4 high，含直接依赖 `ws@8.18.0` 的内存耗尽 DoS），hub 2 个（经 MCP SDK 传入的 hono） |
| 代码 diff | 无。`package.json` 的版本范围一行未改 |
| 契约影响 | 否 |
| 文档 diff | 计划 Task 7 加「已被 Task 3 解决」说明 |
| protocolVersion | 不变 |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 INV-1..INV-6 均未涉及 |
| 验证 | 四仓 `npm audit --omit=dev` 均输出 `found 0 vulnerabilities`；`ws` 解析到 **8.21.3**（越过 `8.0.0–8.20.1`），`@modelcontextprotocol/sdk` 解析到 **1.30.0** |
| 提交 | 随 P0-T3 的 lockfile 一并提交（待提交） |

**根因修正：** 漏洞来自**陈旧 lockfile 把传递依赖钉死在旧版本**，而非 `package.json` 的版本范围写错。原计划的「手动升级 ws / MCP SDK」是误判——删除 lockfile 重装即全部解决。**教训：报告依赖漏洞前，应先确认是版本范围问题还是 lockfile 陈旧问题。**

### 2026-08-13 · P0-T5 · 补 .gitignore 缺口并清理已跟踪的 bridge 测试残留

| 字段 | 内容 |
|---|---|
| 仓库 | at-jumpserver-series、at-grafana-series |
| 动机 | J16：4 个 `.tmp-jumpserver-bridge-*/.at-jumpserver-terminal/mcp-bridge.json` 被误提交进版本库——该文件按 Bridge 协议是 0600 的含 token 握手文件，不该进版本控制；at-grafana-series 缺 `.ssh-terminal-manager/` 忽略规则，而 at-terminal-series 的 SFTP 编辑功能会把远程文件明文副本落进其工作树，构成泄漏面 |
| 代码 diff | 无源码改动。`at-jumpserver-series/.gitignore` **+3**（`.worktrees/` 之后插入 `.tmp-*/`、`.agents/`、`.ssh-terminal-manager/`），并 `git rm -r --cached` 4 个 `.tmp-jumpserver-bridge-{client,client-error,discovery-invalid,discovery-read}` 目录（**-19 行**，磁盘文件全部保留）；`at-grafana-series/.gitignore` **+1**（`.tmp-*/` 之后插入 `.ssh-terminal-manager/`） |
| 契约影响 | 否 |
| 文档 diff | 无 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 INV-1..INV-6 均未涉及（纯仓库配置，不触及代码与协议） |
| 验证 | **凭据风险排除（移除前先读内容）：** `git show HEAD:<f>` 逐一读出 4 个 `mcp-bridge.json`，token 依次为 `"token-1"`、`"token-2"`、`""`、`"secret"`，port 为 `34567`/`34568`/`0`/`39451`，pid 为 `111`/`111`/`"bad"`/`123`——全部是测试占位值，无 32 位以上十六进制或 base64 高熵串，**不需要凭据轮换**。**jumpserver：** `git ls-files \| grep -c '^\.tmp-'` = **0**；`git check-ignore -v` 对 4 个目录及嵌套文件 `.tmp-jumpserver-bridge-client/.at-jumpserver-terminal/mcp-bridge.json` 均命中 `.gitignore:21:.tmp-*/`，`.agents` 命中 `.gitignore:22:.agents/`，`.ssh-terminal-manager/` 命中 `.gitignore:23:.ssh-terminal-manager/`；4 个目录的 `mcp-bridge.json` 经确认仍在磁盘上。**grafana：** `.ssh-terminal-manager` 命中 `.gitignore:23:.ssh-terminal-manager/`；磁盘残留 `.ssh-terminal-manager/sftp-edit/af238298-adfa-4948-9aad-fa96e5aa17c3/{def643d13558fe96,63b57d2b54d57aae}`（空目录，git 不可见）。**提交范围：** `git show --stat HEAD` jumpserver 为 `5 files changed, 3 insertions(+), 19 deletions(-)`（`.gitignore` + 4 个删除），grafana 为 `1 file changed, 1 insertion(+)`；jumpserver 的 `package.json` / `package-lock.json` / `test/mcp/p0c.functional.e2e.test.ts` 提交后仍为未暂存的 ` M`，未被夹带 |
| 提交 | at-jumpserver-series `6e33692`、at-grafana-series `d6eee89`（均在分支 `chore/at-series-optimization-phase0`，未推送远程） |

**修正 Task 5 的前提假设：`.ssh-terminal-manager/` 其实四个仓库全都没有。** 计划原文认为「只有 grafana 缺，另外三个已有」，该结论来自 `git check-ignore -v .ssh-terminal-manager/` 的输出，而这个输出在三个仓库里是**假阳性**：`at-terminal-series`、`at-jumpserver-series`、`at-series-mcp-hub` 的 `.gitignore` 在工作区是 CRLF 换行，git 解析忽略文件时先判定「本行非空」再剥掉行尾 `\r`，于是每个空行都变成一条**空模式**，而空模式会匹配任何**带尾斜杠**的查询路径。对照实验：`git check-ignore -v zzz-definitely-not-ignored-xyz/` 在这三个仓库同样返回「已忽略」（命中 terminal-series `.gitignore:51`、jumpserver `:52`、hub `:24`，模式字段为空），去掉尾斜杠后立即返回未忽略；`grep -n 'ssh-terminal-manager' <repo>/.gitignore` 在**四个仓库全部无匹配**。

该缺陷的实际影响面有限：`git status` / `git add` 的目录遍历不受影响（untracked 目录仍正常显示为 `??`），**只有 `git check-ignore` 加尾斜杠查询会说谎**。因此它不构成文件泄漏或文件被误藏，但会让任何以 `check-ignore <path>/` 形式做的忽略验证得出错误结论——本条目的验证一律改用**不带尾斜杠**的查询形式。

**由此产生的两项待办（本任务未处理，需单独裁决）：**

- `at-terminal-series` 与 `at-series-mcp-hub` 的 `.gitignore` **确实缺** `.ssh-terminal-manager/` 规则，需补。本任务按约束只改 jumpserver 与 grafana 两仓，未越界。
- 三仓 `.gitignore` 的 CRLF 需归一到 LF 以消除空模式。其中 `at-series-mcp-hub` 的 CRLF **已提交进索引**（`git show HEAD:.gitignore` 含 24 个 `\r`），terminal-series 与 jumpserver 只是工作区 CRLF、索引已是 LF（P0-T1 的 `.gitattributes` `* text=auto eol=lf` 生效）。修复 hub 那份需要真实改动 blob，与「本轮不做 renormalize」的约定冲突，留待后续阶段。

**遗留根因（本任务只做止血，未修）：** `at-terminal-series/src/sftp/SftpEditSessionManager.ts:74` 把 SFTP「编辑远程文件」的暂存目录放在**当前工作区根目录**下的 `.ssh-terminal-manager/`，而非扩展的 `globalStorageUri`。后果是：开发者把任意仓库当工作区打开并编辑远程文件时，服务器上的文件明文副本会直接落进那个仓库的工作树——grafana 仓里的空 `sftp-edit` 目录就是这么来的。本任务只给 grafana 补了忽略规则，属止血；把暂存目录迁到 `globalStorageUri` 的根因修复留待后续阶段。

### 2026-08-13 · P0-T6 · grafana 入口图标纳入版本控制，修复全新 clone 无法打包

| 字段 | 内容 |
|---|---|
| 仓库 | at-grafana-series |
| 动机 | **G8**：`package.json:8` 的 `"icon": "media/at-grafana-icon.png"`（Marketplace 图标）与 `package.json:39` 的 `contributes.viewsContainers.activitybar[0].icon: "media/at-grafana-activity.svg"`（活动栏容器图标）所引用的资产**从未纳入版本控制**（`?? media/at-grafana-*`），而 `scripts/package.mjs` 在打包时对三个 logo 资产做**硬断言**。二者叠加的后果是：从远端全新 clone 后执行 `npm run package` **必然失败**，此前只在恰好持有未跟踪文件的本机上能过。同时收尾 P0-T2b 记录的**第三条在制品「入口 logo / 打包资产」**（见本台账 L109、L114 的归属判定） |
| 代码 diff | **新增并跟踪 3 个资产**：`media/at-grafana-icon.png`（二进制 3124 B，git 记为 `Bin 0 -> 3124 bytes`）、`media/at-grafana-icon.svg`（+6）、`media/at-grafana-activity.svg`（+5）。**删除失效条目**：`media/icon.svg`（`git rm --cached`，-3）——原通用黑色柱状图占位符，已被新的 G 变体图标集取代且早已从工作树消失，索引里再留着就是指向不存在文件的悬空路径。**打包链路**：`scripts/package.mjs:20-33` +17/-1，把原先「拷 media 失败就静默吞掉」的 `.catch(() => {})` 改为强制拷贝，并逐个 `access()` 三个资产、校验 manifest 的 `icon` 与 activitybar icon 路径逐字匹配；`.vscodeignore:23-25` +3，写明保留 media 入口图标、禁止再加宽泛的 `media/**` 排除 |
| 契约影响 | 否。未触及 AGENTS.md §2.1 的任何一项：无线协议字段增删、无 hub 导出面变化、无 installer / hub sync 行为变化 |
| 文档 diff | `docs/plans/2026-07-30-at-grafana-entry-logo-design.md` ±14（G 弧线 path 移入**右半区**，与 chevron 拉开间隙不再重叠；crossbar 改为只探进开口）。仅设计文档，非 `docs/protocol/**` 契约文档 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 **INV-1..INV-6 均未涉及**（纯打包资产与构建脚本）。逐条确认：本次提交的 7 个文件中**无任何 `src/**`**，未触及 MCP 配置入口与 `~/.at-series/mcp/hub.js` 单条 server（INV-1/INV-2）、未触及 Hub 工具 registry 与 `GET /tools`（INV-3）、未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与渐进发现阈值（INV-4/INV-5）、未触及五个 Hub 元工具的暴露与 risk 分级（INV-6） |
| 验证 | **资产合法性：** `file` 输出 `at-grafana-icon.png: PNG image data, 128 x 128, 8-bit/color RGBA, non-interlaced`（`sips` 复核 `pixelWidth: 128` / `pixelHeight: 128`，满足 VS Code Marketplace 的 128×128 下限），另两个为合法 SVG。**未被忽略：** `git check-ignore -v` 对三个文件均无输出（exit 1）；按 P0-T5b 的教训做了**对照实验**——不存在的路径 `media/__definitely_not_real__.png` 同样 exit 1，说明**不存在 CRLF 空模式假阳性**（grafana 的 `.gitignore` 是 LF）。**路径逐字匹配：** `rg -n 'media/' package.json` 得 `8:"icon": "media/at-grafana-icon.png"` 与 `39:"icon": "media/at-grafana-activity.svg"`，与磁盘文件名大小写完全一致。**打包端到端：** `npm run build` 通过；`node scripts/package.mjs` 成功，vsce 3.9.2 输出 ` DONE  Packaged: .../.package-work/vsix/at-grafana-0.1.0.vsix (13 files, 255.9 KB)`，**无任何 missing asset / access 断言报错**。**产物内含图标：** `unzip -l` 得 `extension/media/at-grafana-icon.svg` **557 B**、`extension/media/at-grafana-icon.png` **3124 B**、`extension/media/at-grafana-activity.svg` **533 B**，三者与源文件字节数逐一相等，证明 `.gitattributes` 的 `*.png binary` 生效、PNG 未被换行符处理污染。**提交范围：** `git show --stat HEAD` 为 `7 files changed, 37 insertions(+), 11 deletions(-)`；提交后 `src/**`、`test/**`、`webview/**`、`package.json`、`package-lock.json` 均仍为未暂存的 ` M`，未被夹带。**全新检出复验（对本条标题的决定性证据）：** 上面的打包验证跑在工作区，无法区分「资产已入库」与「资产只是碰巧躺在本机磁盘上」——而这正是本条要修的 bug。故追加 `git archive HEAD media package.json \| tar -x` 到临时目录，只用**提交树里的内容**复验：三个资产全部 `PRESENT`，`file` 仍报 `PNG image data, 128 x 128, 8-bit/color RGBA`，`cmp` 与源文件**逐字节相同**（再次证明 `*.png binary` 未被换行符处理污染），manifest 的 `icon` 与 activitybar icon 均 `OK`，脚本判定 `>>> ALL PACKAGING ASSERTIONS WOULD PASS`。另 `git rev-parse HEAD:<f>` 与 `git hash-object <f>` 对三个资产哈希逐一相等，`git cat-file -e HEAD:media/icon.svg` 返回非零确认旧资产已离开提交树 |
| 提交 | at-grafana-series `a1b2159`（分支 `chore/at-series-optimization-phase0`，未推送远程） |

**为什么这是「必然失败」而非「偶发」：** `scripts/package.mjs` 原本写的是 `await cp(root/media, stage/media).catch(() => {})`——媒体目录拷不到就静默吞掉，因此缺图标时打包**不会报错，只会产出一个没有图标的 VSIX**。本条在制品把它改成强制拷贝 + 三个 `access()` 断言后，缺失才变成显式失败。也就是说断言本身是**正确的加固**，但它与「资产未跟踪」同时存在，就把一个静默降级问题升级成了全新 clone 的硬失败。两者必须一起提交，只提交其中一半都会让仓库处于更坏的状态。

**与预期不符处（如实记录）：**

- **多出一个 ` M docs/plans/2026-07-29-at-grafana-v1-implementation-plan.md`**，任务书未提及。核查后确认其 `git diff` **为空**，仅有 `warning: CRLF will be replaced by LF` ——是工作区 CRLF / 索引 LF 造成的 stat 假阳性，与 P0-T2b 中记录的 21 个同类假阳性同源，**无实际内容改动**，故未纳入本次提交。
- **P0-T2b 的 L114 判定「terminal 的 `0.3.0.md` 链接改动随 Task 6 一并提交」未执行。** 本任务的约束明确限定只改 `at-grafana-series`（台账除外）、不得触碰其他仓库，两者冲突时以任务约束为准。`at-terminal-series/docs/releases/0.3.0.md`（ADR 相对链接改 GitHub 绝对 URL）**仍为未提交状态**，需另行安排归属。

### 2026-08-13 · P0-T4 · 修复 jumpserver p0c e2e 测试的 4 个类型错误

| 字段 | 内容 |
|---|---|
| 仓库 | at-jumpserver-series |
| 动机 | **J11**：P0-T3 收尾后 terminal（304/304）与 grafana（294/294）已 typecheck 干净，jumpserver 是三插件中唯一无法通过 `tsc --noEmit` 的仓，余 4 个错误全部集中在 `test/mcp/p0c.functional.e2e.test.ts` |
| 代码 diff | `test/mcp/p0c.functional.e2e.test.ts` **+30/-10**（单文件）：`:10-14` 从 `@at-series/mcp-hub` 增补 `BridgeErrorBody` / `BridgeHealthResponse` / `BridgeInvokeSuccess` / `BridgeToolsResponse` 四个类型导入；`:49` 资产 fixture 补 `zoneName: 'default'`（插在 `type` 与 `nodePath` 之间，与 `cachedJumpServerAssetSchema` 字段序一致）；`:96`、`:106`、`:119`、`:126` 四处 `fetchJson` 调用补类型实参；`:108-110`、`:130-132` 两处新增 `isBridgeError` 收窄分支；`:214-231` `fetchJson` 改为泛型 `<T = unknown>` 并返回 `Promise<{ status: number; json: T \| BridgeErrorBody }>`，`as never` → `as T \| BridgeErrorBody`，新增 `isBridgeError` 类型守卫。**未触碰任何生产代码** |
| 契约影响 | 否。未触及 AGENTS.md §2.1 的任何一项：无线协议字段增删、无 hub 导出面变化、无 installer / hub sync 行为变化（本条只消费 hub 已有的导出类型） |
| 文档 diff | 无 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 **INV-1..INV-6 均未涉及**（改动范围为单个测试文件，`src/**` 零改动）：未触及 MCP 配置入口与 `~/.at-series/mcp/hub.js` 单条 server（INV-1/INV-2）、未触及 Hub 工具 registry 与 `GET /tools`（INV-3）、未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与渐进发现阈值（INV-4/INV-5）、未触及五个 Hub 元工具的暴露与 risk 分级（INV-6） |
| 验证 | **typecheck：** 修复前 4 个错误（TS2741 `:38`、TS2339 `:101`/`:102`/`:120`）；修复后 `npm run typecheck` **退出码 0、零诊断输出**。**测试：** 沙箱内 `35 文件 / 224 用例` 中 6 失败，其中 4 个为 `EPERM: operation not permitted, mkdir '/var/folders/.../.cursor'`（沙箱禁止创建该名目录，与 P0-T3a 记录的同源）；**沙箱外复跑 222 通过 / 2 失败**，4 个 EPERM 全部消失。本任务目标文件 `test/mcp/p0c.functional.e2e.test.ts` 沙箱外 **`✓` 通过（105ms）**——测试真实跑完，证明 15 工具数量断言、目录名排序比对、`USER_CANCELLED` 断言均实际执行而非被类型层绕过。**提交范围：** `git show --stat HEAD` 为 `1 file changed, 30 insertions(+), 10 deletions(-)`；提交后 `package.json` / `package-lock.json` / `.gitignore` 仍为未暂存的 ` M`，未被夹带 |
| 提交 | at-jumpserver-series `955046d`（分支 `chore/at-series-optimization-phase0`，未推送远程） |

**归属判断结论：4 个错误全部是历史遗留，与本轮两条在制品均无关。** 三条依据：

1. **该文件的未提交改动不可能致错。** `git diff` 确认工作区相对 HEAD 只改了第 27 行 `it(...)` 标题里的乱码字节（`e2 86 3f` → `ef bf bd 3f`，即 P0-T2b 的 L111 已记录、L114 判定「随 Task 4 处理」的那处编码噪声）。它是一个字符串字面量，与报错的第 38/101/102/120 行无类型关联。
2. **TS2741 的必填字段早于测试文件存在。** `zoneName` 由 `4e81509`（`chore: import JumpServer snapshot for AT Series Hub adaptation`）引入 `src/config/schema.ts:28` 的 `cachedJumpServerAssetSchema`，而 `git merge-base --is-ancestor 4e81509 260236a` 确认它是测试文件引入提交 `260236a` 的**祖先**——fixture 从写下的第一天就缺这个必填字段。
3. **3 个 TS2339 与 hub 依赖版本无关。** 根因在 `fetchJson` 里的 `as never`，同样出自 `260236a`，是纯本地代码，不随 `@at-series/mcp-hub` 由 npm `^0.2.1` 换成 `file:` 本地 0.2.2 而改变。

**由此推出一个应当记录的事实：这个 e2e 测试自 `260236a` 合入起从未通过过 `tsc --noEmit`。** 它能长期潜伏，说明合入时既没有类型门禁、CI 也未对 `test/**` 做类型检查（`tsconfig.json` 的 `include` 明明覆盖了 `test`）。这正是阶段 0「恢复可验证性」要解决的问题本身，Task 8 的 CI 工作流须把 `npm run typecheck` 设为必过项，否则同类问题会再次沉底。

**对任务前提的一处修正：** 任务书推测 3 个 TS2339 是「联合类型被穷尽判断收窄成 `never` 后仍继续访问」。实际根因不同——`fetchJson` 无条件把 `await res.json()` 断言成了 `never`，与任何控制流收窄无关。附带解释了一个反常现象：为什么 5 处读取 `.json` 只有 3 处报错——`never` 可赋值给任何类型，因此 `expect(health.json).toMatchObject(...)`、`expect(list.json).toMatchObject(...)` 这两处把整个 body 作为值传参的调用悄悄通过了，只有真正**取属性**的 3 处（`.tools` ×2、`.error`）才触发 TS2339。

**修法选择（为什么用显式联合而非断言）：** 全程**未使用** `any` / `as any` / `@ts-expect-error` / `@ts-ignore`——该仓全项目仅 14 处 `any` 且都在 JumpServer API 响应边界，这条类型纪律予以保持。`fetchJson` 改为泛型并返回 `T | BridgeErrorBody`，复用 hub 的 `protocol/index` 已导出的四个线协议契约类型，未自造重复定义。HTTP 边界上把无类型的 `res.json()` 落到具体联合仍需一次断言（这是边界上不可消除的一次，任务书给出的参考写法同样如此），但**所有读取点一律走 `isBridgeError` 运行时守卫**而非用断言把联合抹平：这样 Bridge 若真返回错误体，测试会带着实际 error code 显式失败，而不是在 `undefined` 上抛 `TypeError`。断言意图零改动。顺带移除了 `:102` 上冗余的内联结构标注 `(t: { name: string })`——`BridgeToolsResponse.tools` 已是 `ToolCatalogEntry[]`，`t` 可正确推断。

**顺带发现（未处理，不属本任务）：** 沙箱外仅剩的 2 个失败均在 `test/docs/JumpServerMcpDocs.test.ts`。该文件是 **untracked**（`git ls-files test/docs/` 输出为空），P0-T2b 的 L112 已记录它「6 月 2 日，断言 hub 化之前的 SKILL.md 文案」。两条断言分别要求 skill 含 `Do not read local VS Code secret storage`（现文案已改为 `Never read local IDE secret storage, cookies, or JumpServer tokens`）、README 含 `JumpServer: Install MCP Config`。属**文案漂移**而非代码缺陷，与本次类型修复无因果关系；需单独裁决是纳入版本控制并更新断言，还是废弃该文件。因其未跟踪，本次未纳入提交。

### 2026-08-13 · P0-T8 · 四仓建立最小 CI 门禁

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub、at-terminal-series、at-jumpserver-series、at-grafana-series |
| 动机 | **X4**：四仓此前无任何 CI。前 7 个任务恢复的可验证性（构建可用、typecheck 干净、测试全绿、生产依赖 0 漏洞）只存在于本机工作区，没有门禁就会随下一次改动重新腐化。P0-T4 已给出实证：`test/mcp/p0c.functional.e2e.test.ts` 自 `260236a` 合入起从未通过 `tsc --noEmit`，能潜伏数月正因为没有类型门禁 |
| 代码 diff | 四个**新增**文件，无任何既有文件改动。`at-series-mcp-hub/.github/workflows/ci.yml`（+36）单 job 8 步：checkout → setup-node 20（`cache: npm`）→ `npm ci` → `npm run typecheck` → `npm run build` → `npm run build:hub` → `npm test` → `npm audit --omit=dev --audit-level=high`。三插件各 `.github/workflows/ci.yml`（各 +52）内容同构，仅 `path` 与 4 处 `working-directory` 的目录名不同（`diff` 确认三份两两只差这 5 行）：先 checkout 插件到 `<插件目录>`、再 checkout `xwamt/at-series-mcp-hub` 到 `at-series-mcp-hub` 以还原 `file:` 依赖所需的兄弟目录布局，然后在 hub 目录 `npm ci && npm run build && npm run build:hub`，最后在插件目录跑 typecheck / test / audit |
| 契约影响 | 否。未触及 AGENTS.md §2.1 的任何一项：无线协议字段增删、无 hub 导出面变化、无 installer / hub sync 行为变化。四个文件全部位于 `.github/`，不参与任何构建产物 |
| 文档 diff | 无 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 **INV-1..INV-6 均未涉及**（纯 CI 配置，`src/**` 零改动）：未触及 MCP 配置入口与 `~/.at-series/mcp/hub.js` 单条 server（INV-1/INV-2）、未触及 Hub 工具 registry 与 `GET /tools`（INV-3）、未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与渐进发现阈值（INV-4/INV-5）、未触及五个 Hub 元工具的暴露与 risk 分级（INV-6） |
| 验证 | **本地逐条预演 CI 命令，四仓 14 条全部 exit 0**；本轮**未出现** P0-T3a / P0-T4 记录的 `EPERM mkdir '.../.cursor'` 沙箱失败，四仓测试均在沙箱内真实跑完。**hub：** `npm run typecheck` 0；`npm run build` 0；`npm run build:hub` 0，输出 `Bundled hub.js (0.2.2) -> dist/hub.js`；`npm test` 0，`20 文件 / 109 用例` 全通过（其中依赖 `dist/hub.js` 的 `p0a.e2e.functional.test.ts` 通过，证明工作流把 `build:hub` 排在 `test` 之前既必需又充分）；`npm audit --omit=dev --audit-level=high` 0，`found 0 vulnerabilities`。**at-terminal-series：** typecheck 0；test 0，`59 文件 / 304 用例`；audit 0。**at-jumpserver-series：** typecheck 0；test 0，`35 文件 / 225 用例`；audit 0。**at-grafana-series：** typecheck 0；test 0，`33 文件 / 294 用例`；audit 0。按约定**未**在本地跑 `npm ci`。**工作流本体：** js-yaml 解析四份文件均成功，`jobs.check` 各 8 步、触发器 `push`+`pull_request`、`runs-on: ubuntu-latest`；写入时产生的 CRLF 已归一为 LF，`git show HEAD:.github/workflows/ci.yml` 四仓 blob 的 CR 计数均为 **0**，且从**提交树**取出的内容再次解析成功——这一步必要，因为插件工作流的 `run: \|` 块若残留 `\r`，runner 上的 bash 会把 `npm ci\r` 当作带 CR 的命令而失败。**`.vscodeignore`：** 三插件**原本就已排除** `.github`（terminal `:2`、grafana `:2`、jumpserver `:15` 均为 `.github/**`），Step 3 无需补行。**提交范围：** 四仓 `git show --stat HEAD` 均为 `1 file changed`（36 / 52 / 52 / 52 insertions），提交后 `package.json`、`package-lock.json` 及源码改动仍为未暂存的 ` M`，未被夹带 |
| 提交 | at-series-mcp-hub `ba5880c`、at-terminal-series `c791e82`、at-jumpserver-series `9910811`、at-grafana-series `ef4b80a`（均在分支 `chore/at-series-optimization-phase0`，未推送远程） |

**已知前提一：插件 CI 依赖跨仓检出，且 hub 检出的是默认分支。** 三个插件工作流用 `actions/checkout` 拉 `xwamt/at-series-mcp-hub` 时**未指定 `ref:`**，因此永远检出该仓的默认分支 `master`。四个仓库经 GitHub API 确认均为 **public**（`private=false`），所以跨仓检出用默认 `GITHUB_TOKEN` 即可，不需要额外 PAT。但代价是：**任何需要 hub 与插件联动的改动，在 hub 侧合入 `master` 之前，插件 CI 都会失败**——因为插件拿到的是旧 hub。此类改动期间需临时给插件工作流加 `ref: <hub 分支名>`，合入后再撤掉。

**已知前提二：四仓 lockfile 的提交状态（对任务预期的一处修正）。** 任务书预期「四仓的 lockfile 都有未提交改动」，实测**只有三个插件如此，hub 不是**：

| 仓库 | lockfile 已跟踪 | 工作区有改动 | package.json 有改动 |
|---|---|---|---|
| at-series-mcp-hub | 是 | **否（已于 `5aa74b6` 提交）** | 否 |
| at-terminal-series | 是 | 是（+368 / -1447） | 是 |
| at-jumpserver-series | 是 | 是（+900 / -888） | 是 |
| at-grafana-series | 是 | 是（+304 / -1388） | 是 |

hub 的 lockfile 在 P0-T3a 收尾时已随 `5aa74b6`（`build: reinstall dependencies on this machine…`）提交，因此 hub 的 `npm ci` 在远端有一致的 lockfile 可用。三插件的依赖状态按用户要求继续留在工作区不提交。

**首次运行预判（重要，需用户裁决后才能变绿）：hub 会绿，三个插件会红。** 且插件变红的**首要原因不是 lockfile 不一致，而是「已提交的依赖声明仍指向 npm 上的 0.2.1」**——这比原先设想的更靠前、更硬。证据链逐环已验证：

1. 三插件**已提交**的 `package.json` 与 `package-lock.json` 声明的都是 `"@at-series/mcp-hub": "^0.2.1"`，**不是** `file:../at-series-mcp-hub/packages/mcp-hub`。`file:` 只存在于**未提交的工作区**（属 P0-T3 那批「用户要求先不提交」的依赖改动）。
2. 因此 CI 的 `npm ci` 会**从 npm registry 装 0.2.1**，跨仓检出来的 hub 目录根本不会被引用——「Check out the hub / Build the hub」两步在当前提交状态下是空转。
3. 三插件**已提交**的源码（`src/extension.ts`、`src/mcp/McpConfigInstaller.ts`）都 `import { detectHostApp } from '@at-series/mcp-hub'`，且本地兜底 `src/mcp/hostApp.ts` 已在 P0-T2b 被删除（`git cat-file -e HEAD:src/mcp/hostApp.ts` 三仓均返回非零）。
4. npm 上 `@at-series/mcp-hub` 的已发布版本只有 `0.1.0 / 0.1.1 / 0.2.0 / 0.2.1`，`latest` 为 **0.2.1**；拉取 `0.2.1` 的 `dist/index.d.ts` 与 `dist/protocol/index.d.ts` 均**不含** `detectHostApp` / `slugifyHostAppId`。

⇒ 插件 CI 会走到 **`Typecheck` 步失败**（`@at-series/mcp-hub` 无导出成员 `detectHostApp`），`npm ci` 本身反而不会失败（已提交的 package.json 与 lockfile 互相自洽，都是 `^0.2.1`）。

**第二重阻塞（即使提交了 `file:` 依赖也仍会红）：** hub 的 `origin/master` 比本地分支**落后 16 个提交**，`packages/mcp-hub/src/protocol/detectHostApp.ts` 在 `origin/master` 上**根本不存在**（`git cat-file -e origin/master:…` 报 `exists on disk, but not in 'origin/master'`），其 `protocol/index.ts` 也不含该导出。而插件工作流检出的正是 hub 的 `master`。`git ls-remote` 确认远端 `master` 与本地 `origin/master` 同为 `891f953`，排除本地引用陈旧的可能。

**要让插件 CI 变绿，需用户依次裁决三件事：** (1) 把 hub 的 `chore/at-series-optimization-phase0` 合入 `master` 并推送，使 `detectHostApp` 进入 hub 默认分支；(2) 提交三插件的 `package.json`（`^0.2.1` → `file:`）与重建后的 `package-lock.json`，否则 `npm ci` 装的仍是 npm 上的旧包；(3) 推送各插件分支。另注意 `on.push.branches` 只含 `[master, main]`，**推送 `chore/at-series-optimization-phase0` 分支本身不会触发任何 job**，需开 PR（`pull_request` 触发）或合入默认分支后才会跑。

### 2026-08-13 · P1-A · Hub 出站客户端加固：拒绝重定向、超时、响应体上限

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | **H1**：`src/bridgeClient/http.ts` 三处 `fetch` 均使用 Node 默认的 `redirect: 'follow'`。fetch 规范只在跨源跳转时剥离 `Authorization`，**自定义头 `x-at-series-token` 会被原样转发**，`307` 更会连请求体一起转发——任何能抢占或伪造 Bridge 端口的本地进程，**不需要知道 token 就能同时拿到 token 和全部工具参数**（SSH 命令、JumpServer 资产、Grafana 查询）。**H2**：只有 `/health` 有 2s 超时，`/tools` 与 `/invoke` 无任何超时；而 `listToolsForMcp` 与 `callTool` 在做任何事之前都 `await refreshCatalog()`，后者遍历所有 bridge 调 `/health` + `/tools`，因此一个「`/health` 正常但 `/tools` 挂起」的 Bridge（扩展宿主主线程繁忙、死锁、被调试器暂停均会造成）会让整个 Hub 的 `tools/list` 和**所有** `tools/call` 永久无响应。**第三项**：`BRIDGE_MAX_BODY_BYTES = 2 * 1024 * 1024`（`src/protocol/index.ts:40`）自协议写就起**全仓零引用**，`parseJsonBody` 无条件 `await res.text()`，异常或恶意 Bridge 返回 1 GB 响应即可 OOM 掉 Hub 进程 |
| 代码 diff | 全部集中在 **1 个源文件 + 1 个导出文件 + 2 个测试文件**，`src/hub/**` 零改动。`packages/mcp-hub/src/bridgeClient/http.ts`（三次提交累计 **+79/-3**）：文件头块注释 `:4-7` **+5**，把「拒绝重定向」这条不变量的**理由**（fetch 只剥 `Authorization`、自定义头原样转发）写进注释而非仅留代码；`:22` 导入 `BRIDGE_MAX_BODY_BYTES`；`:38-50` 新增 `TOOLS_TIMEOUT_MS = 5000`、`INVOKE_TIMEOUT_MS = 120_000` 与导出类型 `BridgeRequestOptions`，两个常量各带一行说明**为什么是这个数**；`bridgeGetHealth` / `bridgeGetTools` / `bridgeInvoke` 三个函数各加 `options: BridgeRequestOptions = {}` 尾参（`bridgeInvoke` 在 `req` 之后，三者签名风格一致），三处 `fetch` 各加 `redirect: 'error'` 与 `signal: AbortSignal.timeout(options.timeoutMs ?? <各自默认值>)`；新增 `readLimitedText`（**+37**）取代 `parseJsonBody` 里的裸 `res.text()`。`packages/mcp-hub/src/index.ts` **+1/-1**：bridge HTTP client 导出段追加 `type BridgeRequestOptions`，既有导出项一字未动。`packages/mcp-hub/test/fixtures/hostileBridge.ts` **新增 82 行**：`redirect` / `hang` / `oversized` 三态敌意 Bridge 测试双，`captured[]` 记录它**实际收到**的请求（含 headers 与 body），这是「token 有没有泄露」的判据。`packages/mcp-hub/test/bridgeClient.http.test.ts` **+98**：3 个 describe / 6 个新用例 |
| 契约影响 | **是** —— 触及 AGENTS.md §2.1 的「Bridge HTTP：路径、方法、请求/响应体、错误码、鉴权头、body 限制」。具体为三条 Hub 侧新增行为约束，同时构成对 Bridge 侧的**澄清性要求**：(1) Bridge **MUST NOT** 返回任何 3xx，Hub 遇 3xx 一律 `BridgeHttpError` 而非跟随；(2) Hub 对 `/tools` 施加 5s、对 `/invoke` 施加 120s 出站超时上限；(3) 响应体 **MUST** 不超过 2 MiB，与 §7.1 已为请求方向声明的限额对称 |
| 文档 diff | **已由阶段 1-C 收口（commit `4dd68b2`），AGENTS.md §2.1 硬门禁欠账已清。** `docs/protocol/v1.md` 实际改动章节：**§7.1** Transport（新增「Bridge MUST NOT 返回任何 3xx」条款；原「Body limit 2 MiB → 413」单向表述改为**双向**，并写明超限响应由 Hub 中途中止并以 `INTERNAL_ERROR` 上报）；**§7.8 Hub-side timeouts (normative)**（新增小节，表格固化 `/health` 2 s、`/tools` 5 s、`/invoke` 120 s 三档上限与各自的降级后果，并说明 `BridgeRequestOptions.timeoutMs` 逐调用覆盖）；**§7.4 / §7.5 / §7.6** 各加一行 `Timeout: see §7.8` 交叉引用；**§14** 追加第 6 条安全不变量（Hub 永不跟随出站重定向，token 与 invoke 参数只到达 registry `port`）；**§15.10-12** 把本任务已写就的重定向拒绝、`/tools` 挂起中止、响应体超限中止三个测试提升为对所有 Hub 实现的一致性要求 |
| protocolVersion | 不变（Bridge 1 / Hub 2）。理由：新增的是 **Hub 侧行为约束**与对 Bridge 的**澄清性要求**，无线协议字段增删、无字段语义反转、无既有导出签名破坏（三个函数的新参数均有默认值，一参/两参旧调用点全部保持编译与行为不变）。现有三个插件的 Bridge 均已满足新要求：不返回 3xx、响应体远小于 2 MiB、`/tools` 为内存中的静态目录读取远快于 5s |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 **INV-1..INV-6 未被破坏**。逐条：未触及 MCP 配置入口与 `~/.at-series/mcp/hub.js` 单条 server（INV-1/INV-2）；未增删 Hub 工具 registry 条目、未改 `GET /tools` 的线上形状（INV-3）；未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与渐进发现阈值（INV-4/INV-5）；未触及五个 Hub 元工具的暴露与 risk 分级（INV-6）。**特别说明：本次未触碰 `src/hub/discovery.ts` 与 `src/hub/aggregate.ts`**——`git show --stat` 逐一确认三个 commit 的文件清单仅含上述 4 个路径，**渐进暴露语义与工具裁决逻辑逐字未变** |
| 验证 | **严格 TDD，每个缺陷都先写失败测试并留证。** **A1（重定向）RED：** 两个用例均失败——GET `/tools` 报 `AssertionError: promise resolved "{ protocolVersion: 1, tools: [], …(1) }" instead of rejecting`（返回的正是**攻击者 sink** 的响应体，证明重定向被跟随），307 POST `/invoke` 报 `expected [ { url: '/stolen', …(2) } ] to have a length of +0 but got 1`（`sink.captured` 长度 **1**）。另用独立 node 脚本取得**决定性证据**：sink 实收 `{"url":"/stolen","method":"POST","token":"SECRET-TOKEN-123","body":"{\"name\":\"run_remote_command\",\"arguments\":{\"cmd\":\"cat ~/.ssh/id_rsa\"}}"}`——**token 与完整工具参数双双越源送达攻击者**。GREEN：加 `redirect: 'error'` 后 7/7 通过，`sink.captured` 长度 0。**A2（超时）RED：** 两个用例均 `Test timed out in 10000ms`，即调用**永不返回**（用例自身只允许 elapsed < 3000ms）。GREEN：9/9 通过，两个挂起用例分别在 **303ms / 302ms** 中止。**A3（响应体上限）RED：** 3 MiB 用例 `promise resolved … instead of rejecting`（整个超大 body 被完整缓冲进内存），同 describe 的「under the limit」用例**当时已通过**——一红一绿证明该用例组不是恒真也不是恒假。GREEN：11/11 通过。**全量：** `npm run typecheck` 退出码 0、零诊断；`npm test` 沙箱外 **22 文件 / 125 用例全部通过**（含另一 subagent 并行加入的 `hub.logger.test.ts` 与 `hub.resilience.test.ts`）。**最敏感回归点已确认：** 走真实 HTTP 路径的 `hub.conformance.test.ts`（9 用例）与 `p0a.e2e.functional.test.ts`（3 用例）**全绿**。**类型纪律：** `rg '\bany\b\|@ts-ignore\|@ts-expect-error' src/` 在 22 个文件中 **0 匹配**，本包 src 树零 `any` 的纪律保持 |
| 提交 | `a9f45e0`（A1 拒绝重定向）、`952832c`（A2 出站超时）、`ae84e6b`（A3 响应体上限），另台账 1 条。均在分支 `chore/at-series-optimization-phase0`，**未推送远程** |

**与任务预期不符处（如实记录）：A2 的失败发生在运行期而非编译期，因为本包的测试树根本不参与类型检查。** 任务书预期「给 `bridgeGetTools` 多传一个参数会在编译期报 TS2554」，实测 `npm run typecheck` **退出码 0、零诊断**。根因是 `packages/mcp-hub/tsconfig.json:13` 的 `"include": ["src/**/*.ts"]` —— `test/**` 不在编译范围内，而 vitest 走 esbuild 转译只剥类型不做检查，因此**测试代码里的任何类型错误都不会被任何门禁拦住**。

这与 P0-T4 在 at-jumpserver-series 记录的情况正好相反：那个仓的 `tsconfig.json` 的 `include` **覆盖了 `test`**，所以 `p0c.functional.e2e.test.ts` 的 4 个类型错误虽然潜伏数月，至少还能被 `tsc --noEmit` 抓出来；hub 这边则连抓都抓不到。P0-T4 的结论「合入时既没有类型门禁、CI 也未对 `test/**` 做类型检查」在 hub 仓是**结构性成立**的，不是疏忽而是配置使然。

**建议（本任务未做，需单独裁决）：** 给 hub 包补一份覆盖 `test/**` 的类型检查（例如新增 `tsconfig.test.json` 或把 `include` 扩到 `test`，注意 `rootDir: "src"` 与 `declaration: true` 会冲突，不能直接改主 tsconfig 的 `include`）。在此之前，hub 的测试代码没有任何类型安全网。

**另一处观察：A2 的运行期失败其实是比编译期失败更强的证据。** 编译错误只能说明「API 还不存在」，而实测的 `Test timed out in 10000ms` 直接演示了缺陷本身——敌意 Bridge 接受连接后一言不发，`/tools` 与 `/invoke` 就**永远不返回**，正是 H2 描述的「一个挂起的 Bridge 卡死整个 Hub」在测试台上的复现。

**并发协作说明：** 本任务与另一 subagent 并行修改同一仓库，文件集完全不重叠（对方为 `src/hub/{server,logger,main}.ts` 与 `test/hub.resilience.test.ts`）。对方的两个提交 `93022c1`、`239597a` 与本任务的三个提交在同一分支上**交错落地且无任何冲突**，全程未出现 `index.lock` 争用。三次 `git add` 均只列举本任务的明确路径，`git status` 复核确认对方的未跟踪文件从未被夹带进暂存区。

### 2026-08-13 · P1-B · Hub 运行时健壮性：刷新降级、并行探测、stderr 日志

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | **H3**（registry 异常杀进程）：`src/registry/read.ts` 的 `listBridgeRecords` 只吞 `ENOENT`，其余一律重抛；而 `src/hub/server.ts` 的两个后台触发点（watch 回调、健康检查定时器）都用 `void refreshCatalog()` 丢弃 Promise 且无 catch。`EACCES` / `EMFILE` / `ENOTDIR` 中任意一个瞬时错误都会让 Hub 以 unhandled rejection 终止，IDE 侧 MCP server 直接消失。**H12**（零可观测性）：`src/hub/main.ts` 只有启动期一行 `console.error`，运行期任何异常都不留痕，用户拿不到线索。**H2 的并行化部分**：`refreshCatalogOnce` 用 `for...of` 串行遍历所有 bridge，每个两次 HTTP（`/health` + `/tools`），N 个插件时 `tools/list` 延迟为 O(N × RTT) |
| 代码 diff | **新增** `packages/mcp-hub/src/hub/logger.ts`（34 行）：`AT_SERIES_LOG_LEVEL` 四档级别（`silent`/`error`/`warn`/`info`，默认 `warn`，非法值回落 `warn`）+ `describeError` token 打码。选 stderr 而非 stdout 是硬约束——stdio MCP 下 stdout 被 JSON-RPC 独占，任何写入都会破坏帧；stderr 则会被 MCP 客户端捕获展示。`packages/mcp-hub/src/hub/server.ts`（两次提交累计 **+62/-25**）：`:38` 导入 `describeError`/`hubLog`；`refreshCatalog` 的 `while` 循环内把 `refreshCatalogOnce()` 包 try/catch，失败时回落到 `{ ...catalog, providers: providersResult }` 保留上一版目录（两个状态变量经核对本就初始化为空目录而非 `undefined`，无需补初值）；两处 `void refreshCatalog()` 各加显式 `.catch`；`watchBridgeRegistry(...)` 调用包 try/catch（**超出任务书的必要追加，见下方说明**）；`refreshCatalogOnce` 的串行 `for...of` 换成 `Promise.all` + `ProbeResult` 判别联合 + **按 records 原序装配**。`packages/mcp-hub/src/hub/main.ts` **+15**：`process.on('unhandledRejection')` 与 `process.on('uncaughtException')` 兜底，**刻意不退出进程**（Hub 是 IDE 长驻子进程，一次瞬时错误不该让整套工具消失；真正致命的启动失败仍由既有 `main().catch` 处理），该理由已写入代码注释。**测试** `test/hub.logger.test.ts` 新增 93 行 / 8 用例，`test/hub.resilience.test.ts` 新增 214 行 / 3 用例 |
| 契约影响 | **是** —— 新增环境变量 **`AT_SERIES_LOG_LEVEL`**（`silent`/`error`/`warn`/`info`，缺省 `warn`）。纯增量、纯可观测性开关：不读不写 registry、不参与工具裁决、不影响 `tools/list` 与 `tools/call` 的任何输出，未设置时行为与改动前唯一的差别是失败路径改为写 stderr 而非终止进程 |
| 文档 diff | **已由阶段 1-C 收口（commit `4dd68b2`），AGENTS.md §2.1 硬门禁欠账已清。** `docs/protocol/v2.md` **§7 Diagnostics**（新增小节，表格记录 `AT_SERIES_LOG_LEVEL` 的四档取值与 `warn` 缺省，明确诊断只写 **stderr**、stdout 由 JSON-RPC 传输独占，并将「日志行 MUST NOT 含 Bridge token」写为规范要求）。另在 `docs/protocol/v1.md` **§15.13** 追加一致性要求：registry 目录不可读（非 `ENOENT`）时 Hub 必须保留上一份 catalog 并存活——即本任务 B2 降级用例的规范化 |
| protocolVersion | 不变（Bridge 1 / Hub 2）。无线协议字段增删、无字段语义反转、无既有导出签名破坏；`logger.ts` 未经 `src/index.ts` 对外导出（该文件属另一 subagent 地盘，本任务未触碰） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 **INV-1..INV-6 未被破坏**，其中 **INV-5 是本任务的主要风险面，需重点说明**。INV-5 要求「渐进暴露只影响 MCP `tools/list`，**selection 不是 ACL**，Hub 仍必须能路由任何当前 winner 工具」。并行化的威胁不在 selection 语义本身，而在其上游：`aggregateTools` 对同名工具冲突的最终裁决依赖 `healthyBridges` 的**顺序**做 tie-break（`compareScoreDesc` 在 connectedTargets 与 updatedAt 全等时退化为 `Array.sort` 的稳定序，即插入序）。`Promise.all` 的完成顺序由各 bridge 的响应快慢决定，若按完成序装配，**winner 会随网络抖动漂移**，`tools/list` 内容在多次刷新间抖动，进而使 selection 指向的工具名在刷新后失效——这正是 INV-5 所禁止的「暴露面变成不可预期的边界」。已通过**强制按 records 原序装配**（`Promise.all` 只负责并发，装配走独立的顺序循环）守住，并配**专门的确定性回归测试**锁定。**特别说明：本次未触碰 `src/hub/discovery.ts` 与 `src/hub/aggregate.ts`**——`git diff --name-only 93022c1~1..7313fe7` 对这两个路径与 `docs/protocol/**` 的输出为**空（0 行）**，渐进暴露语义与工具裁决逻辑逐字未变。其余各条：未触及 MCP 配置入口与 `~/.at-series/mcp/hub.js` 单条 server（INV-1/INV-2）；未增删 Hub 工具 registry 条目、未改 `GET /tools` 线上形状（INV-3）；未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与阈值（INV-4）；未触及五个元工具的暴露、名称、`risk: read` 与 autoApprove（INV-6，并由 B2 的降级用例正面断言 `at_list_providers` / `at_select_tools` 在 registry 崩坏时仍在 `tools/list` 中） |
| 验证 | **三组测试如下。** **① B1 logger（严格 TDD）：** RED 为 `Cannot find module '../src/hub/logger'`；GREEN 后 8/8 通过（默认 `warn`、`silent` 全静音、非法值回落、大小写不敏感、`token=` 与 `"token":"` 双形态打码）。环境变量一律走 `vi.stubEnv` + `vi.unstubAllEnvs`，不手工存取 `process.env`。**② B2 降级（严格 TDD，崩溃证据留存）：** RED 输出 `Error: ENOTDIR: not a directory, scandir '…/.at-series/bridges/cursor'`，栈为 `listBridgeRecords (src/registry/read.ts:89) → refreshCatalogOnce (src/hub/server.ts:294) → createHubRuntime (src/hub/server.ts:594)`。GREEN 后用例通过，stderr 留下 `[at-series-hub] error: catalog refresh failed: ENOTDIR…`。**③ B3 并行化（重构，非新增行为，红绿顺序与常规 TDD 不同）：** 确定性回归测试**在改造前即应通过**，其作用是在改造后仍必须通过。**但任务书原版的该用例经实测无鉴别力**（详见下方说明），已加强后方才具备。加强版在**故意写成「按完成序装配」**的实现下失败：`expected 'from at.beta' to be 'from at.alpha'`——即冲突 winner 确实发生了漂移；改回原序装配后通过。另补一个不依赖墙钟的并发性用例（统计 `/health` 最大在飞数），在串行实现下失败 `expected 1 to be 2`，并行实现下通过。**连跑三次全部 3/3 通过，无 flaky**（tests 753ms / 756ms / 747ms）。**全量：** `npm run typecheck` 退出码 0、零诊断；`npm test` 沙箱外 **22 文件 / 126 用例全部通过**。**四个敏感回归点逐一确认全绿：** `hub.aggregate.test.ts` 3/3、`hub.routing.test.ts` 3/3、`hub.conformance.test.ts` 9/9、`hub.server.test.ts` 4/4（含「慢刷新不能复活已删除工具」的竞态用例，本次改动最敏感处）。**类型纪律：** `rg '\bany\b\|@ts-ignore\|@ts-expect-error' src/` **0 匹配**，本包 src 树零 `any` 的纪律保持 |
| 提交 | `93022c1`（B1 stderr logger）、`239597a`（B2 刷新降级）、`7313fe7`（B3 并行探测），另台账 1 条。均在分支 `chore/at-series-optimization-phase0`，**未推送远程** |

**超出任务书的必要追加：`watchBridgeRegistry` 是同一缺陷的第二个调用点。** 任务书的 B2.2 只要求包住 `refreshCatalogOnce`。按此实施后重跑，用例仍失败，但失败点已前移：`Error: EEXIST: file already exists, mkdir '…/bridges/cursor'`，栈为 `watchBridgeRegistry (src/registry/watch.ts:34) → createHubRuntime (src/hub/server.ts:604)`。根因是 `watch.ts:34` 的 `fs.mkdirSync(dir, { recursive: true })`——`recursive: true` 只在目标**已是目录**时静默成功，目标是**文件**时抛 `EEXIST`。这与 H3 是同一类缺陷（一条损坏的 registry 路径杀死 Hub），只是任务书未枚举到该调用点。已在 `src/hub/server.ts` 内就地包 try/catch 并记日志，**刻意不改 `src/registry/watch.ts`**，以免改变该函数对其他调用方的语义。降级后 Hub 失去实时变更事件，但下方 5s 健康检查定时器仍在驱动刷新，不致失能。

**任务书原版的确定性回归测试无鉴别力，已加强（重要）。** 原版让 `alpha` 慢 150ms、`beta` 快，然后断言「三次刷新的 winner 一致」。实测把实现**故意改成按完成序装配**后，该用例**依然通过**——因为快的一方每次都先完成，顺序恒为 `[beta, alpha]`，winner 稳定地**错**着，而「三次一致」这个断言看不见错。换言之原版只能抓「抖动」，抓不到「整体偏移」，而并行化的真实风险恰是后者。

加强做法两处：(1) `baseRecord` 的 `updatedAt` 改为两条记录**共用同一常量** `TIED_UPDATED_AT`，配合两个 fixture 相同的 `connectedTargets: 1`，使 `compareScoreDesc` 完全打平、裁决**只能**落到顺序 tie-break 上——原版用 `Date.now()` 会让两条记录相差几毫秒，winner 由 `updatedAt` 而非顺序决定，根本走不到要保护的那条分支；(2) 断言从「三次自比」改为**与真实 registry 顺序对比**：测试直接调 `listBridgeRecords` 读出顺序，把延迟施加给**排在首位**的那个 bridge（延迟在发布后才赋值，故与 `fs.readdir` 的实际返回序无关），再断言 winner 等于首位记录的 pluginId。这样「完成序装配」必然与「registry 序」相悖，用例必然失败。三次自比的原断言予以保留。

**并发协作说明：** 本任务与另一 subagent 并行修改同一仓库，文件集完全不重叠（对方为 `src/bridgeClient/http.ts`、`src/index.ts`、`test/bridgeClient.http.test.ts`、`test/fixtures/hostileBridge.ts`）。四次 `git add` 均只列举本任务的明确路径，从未使用 `git add .` / `-A` / `-u`；`git status` 复核确认对方的三个未提交文件与四项未跟踪路径从未被夹带进暂存区。**全程零冲突、零 `index.lock` 争用**，双方提交在同一分支上交错落地（`93022c1` → `239597a` → 对方 `952832c`/`ae84e6b`/`d2d53bd` → `7313fe7`）。本条台账在 `git add` 前重新读取了文件，追加于对方 P1-A 条目之后，未覆盖任何既有条目。

**一处环境噪声，非代码回归（如实记录）：** 在 Cursor 默认沙箱内跑 `npm test` 会有 5 个失败——`installer.cursor.test.ts` 3 个与 `p0a.e2e.functional.test.ts` 1 个均报 `EPERM: operation not permitted, mkdir '…/.cursor'`（沙箱拦截 `.cursor` 目录创建），另 1 个是对方当时在改的 `bridgeClient.http.test.ts` 超时用例。沙箱外重跑 **22 文件 / 126 用例全绿**，确认二者均与本任务改动无关。台账中引用的所有测试结论均以沙箱外结果为准。

### 2026-08-13 · P1-C/D · 契约文档同步与 0.3.0 发版准备

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub（三插件仓仅只读回归，未产生任何提交） |
| 动机 | P1-A 与 P1-B 按分工只改实现、未动 `docs/protocol/**`，两条台账各自记下一笔 **AGENTS.md §2.1 硬门禁的显式欠账**；§10 明确把「先改实现、后补文档」列为硬停偏航。本条是收口动作：把已落地的出站行为写回契约真源，再据此备版 0.3.0 |
| 代码 diff | **`src/**` 零改动**（本任务约束）。仅 `packages/mcp-hub/package.json` **+2/-1**：`version` `0.2.2` → `0.3.0`，`files` 数组补 `CHANGELOG.md`。新增 `packages/mcp-hub/CHANGELOG.md` **49 行** |
| 契约影响 | **是** —— 本条即收口动作本身。触及 AGENTS.md §2.1 的「Bridge HTTP：请求/响应体、body 限制」与 Hub 暴露契约的环境变量面。文档为**唯一**改动载体，无实现漂移 |
| 文档 diff | `docs/protocol/v1.md` **+44/-1**：**§7.1** 新增 3xx 禁止条款 + body 限额改双向表述；**§7.8** 新增 Hub-side timeouts 小节（2 s / 5 s / 120 s 表格、降级后果、`BridgeRequestOptions.timeoutMs` 覆盖、兼容性声明）；**§7.4 / §7.5 / §7.6** 各加一行 `Timeout: see §7.8`；**§14** 追加第 6 条安全不变量；**§15.10-13** 追加四条一致性要求。`docs/protocol/v2.md` **+6**：**§7 Diagnostics** 新增（`AT_SERIES_LOG_LEVEL` 四档 + `warn` 缺省 + stderr-only + token 不得入日志）。**交叉引用格式**：v1.md 全文无 intra-doc markdown 锚点链接，既有写法为 `See section 4.1`（表格）与 `§8.6`（正文），故新增引用统一采用 `§7.8` 裸引形式，未引入锚点链接 |
| protocolVersion | **不变（Bridge 1 / Hub 2）**。理由依 v1.md §13.1：仅当既有字段语义反转、必填字段移除、或新增必需端点时才升版。本次全部条款均为**加性澄清**——原 v1 文本下的合规 Bridge（不返回 3xx、响应体远小于 2 MiB、`/health` `/tools` 走内存缓存）**已然满足**，无需任何改动。该理由已写入 §7.8 的 Compatibility 段与 commit body |
| 插件需跟改 | **否**。但三插件已通过 `file:` 本地路径消费 0.3.0（hub 构建产物直接打进各自 VSIX，用户已决定不发 npm），因此 D4/D5 的回归结果**就是本条的证据**：三仓 typecheck 全清、测试数与基线逐一持平、VSIX 内 `hub.js` 与源构建产物 sha256 逐字节一致 |
| 核心不变量 | 已核对 **INV-1..INV-6 未被破坏**。本任务不改 `src/**`，故六条的实现面天然不受影响；逐条以文档面复核：新增条款只约束 Hub **出站 HTTP** 与 **stderr 诊断**，未触及 MCP 配置入口与单条 server 语义（INV-1/INV-2）、未在 Hub 内写死任何插件工具清单（INV-3）、未改 `AT_SERIES_TOOL_DISCOVERY` 默认 `auto` 与阈值 `20`（INV-4）、未把 selection 表述为授权边界（INV-5，v2.md §1 原文未动）、未改五个元工具的暴露/名称/`risk: read`/autoApprove（INV-6）。**特别确认 VSIX 内 `hub-version.json` 仍是单一入口语义**：D5 解包得 `{"version":"0.3.0","protocolVersion":2}`——`version` 随 D2 的 0.3.0 正确流转，`protocolVersion` 保持 `2` 未被版本号变更带偏，版本选举语义（INV-1/INV-2 依赖的单一 `~/.at-series/mcp/hub.js` 入口）完好 |
| 验证 | **① C7 文档/实现一致性核对（三条命令，全部一致，零漂移）：** 命令一 `rg 'HEALTH_TIMEOUT_MS\|TOOLS_TIMEOUT_MS\|INVOKE_TIMEOUT_MS\|BRIDGE_MAX_BODY_BYTES'` 得 `http.ts:37 HEALTH_TIMEOUT_MS = 2000`、`:39 TOOLS_TIMEOUT_MS = 5000`、`:45 INVOKE_TIMEOUT_MS = 120_000`、`protocol/index.ts:40 BRIDGE_MAX_BODY_BYTES = 2 * 1024 * 1024`（= `2097152`），另 `:171/:207/:251` 三处 `AbortSignal.timeout(options.timeoutMs ?? …)` 与 `:93/:114` 两处限额判定。命令二 `rg '2 s\|5 s\|120 s\|2 MiB' docs/protocol/v1.md` 得 `:314` 双向 2 MiB、`:356` `413` 表行、`:474-476` §7.8 三行（2 s / 5 s / 120 s）、`:776` §15.12。**逐一比对：2 s↔2000、5 s↔5000、120 s↔120_000、2 MiB↔2097152 全部吻合。** 命令三 `rg 'AT_SERIES_LOG_LEVEL'` 得 `logger.ts:9`（缺省 `warn`）与 `v2.md:178`（缺省 `warn`），吻合。**② D4 三插件回归（`file:` 消费 0.3.0，沙箱外运行）：** hub 自身 `npm run build && npm run build:hub` 成功（`Bundled hub.js (0.3.0)`）、`npm test` **22 文件 / 126 用例全绿**；at-terminal-series typecheck 零诊断 + **59 文件 / 304 用例**（基线 304，持平）；at-jumpserver-series typecheck 零诊断 + **35 文件 / 225 用例**（基线 225，持平）；at-grafana-series typecheck 零诊断 + **33 文件 / 294 用例**（基线 294，持平）。**三仓零变红。** **③ D3 分发清单：** `npm pack --dry-run` 输出含 `1.9kB CHANGELOG.md`，确认随包分发。**④ D5 VSIX 端到端：** `npm run package:mcp` 产出 `at-terminal-mcp-0.3.0.vsix`（75 文件 / 593.15 KB）；VSIX 内 `extension/dist/hub.js` 与 `packages/mcp-hub/dist/hub.js` sha256 **均为 `18d2587c11e43442cbf87986ce759a0cf504433caa0904be2cd5e27355952193`，逐字节一致**；`extension/dist/hub-version.json` = `{"version":"0.3.0","protocolVersion":2}`，符合预期 |
| 提交 | `4dd68b2`（契约文档同步）、`5a68011`（0.3.0 发版准备），另本条台账 1 条。均在分支 `chore/at-series-optimization-phase0`。**未 `npm publish`、未 `git tag`、未推送远程**（用户已裁决不发布） |

**P1-A / P1-B 的欠账标记已回填。** 两条条目的 `文档 diff` 字段已由「待阶段 1-C」占位改为实际章节并标注收口（引用 commit `4dd68b2`）：P1-A → `v1.md §7.1 / §7.8 / §7.4-7.6 / §14 / §15.10-12`，P1-B → `v2.md §7` 与 `v1.md §15.13`。章节归属按**实际因果**拆分而非笼统合并——§15.13（registry 目录不可读时保留上一份 catalog）源自 P1-B 的 B2 降级改造，其余三条一致性要求（重定向、`/tools` 挂起、响应体超限）源自 P1-A。两条条目的其他字段一字未动。

**§15.10-13 的四条一致性要求均有已存在的测试背书，非空头规范。** 逐一对应：#10 → `test/bridgeClient.http.test.ts:101,120`（`describe('outbound redirect refusal')`，GET `/tools` 与 307 POST `/invoke` 两个方向，均断言 `sink.captured` 长度为 0，即攻击者**一个请求都没收到**）；#11 → 同文件 `:146,162`（`{ timeoutMs: 300 }` 显式覆盖上限以缩短用例耗时，实测 304ms / 302ms 中止）；#12 → 同文件 `:171`（3 MiB 响应，断言 `/too large/i`）；#13 → `test/hub.resilience.test.ts:12`（把 `bridges/cursor` 造成文件而非目录以触发 **ENOTDIR**，属非 `ENOENT` 分支，断言 runtime 正常 resolve 且 `at_list_providers` / `at_select_tools` 仍在 `tools/list` 中）。本次是把这四个既有测试**提升为对所有 Hub 实现的规范要求**，测试本身未改。

**§7.8 表格「On timeout」列的三种降级后果已逐一对照实现确认，非推断：** `/health` 超时 → `bridgeGetHealth` 抛错 → `src/hub/server.ts:328` 外层 `catch` 归入 `{ kind: 'unhealthy' }`；`/tools` 超时 → `bridgeGetTools` 抛错 → `:311-316` 内层 `catch` 回落 `tools = record.tools`（registry 快照），注释原文即「Fall back to registry snapshot when live catalog fetch fails」；`/invoke` 超时 → `bridgeInvoke` 抛 `BridgeHttpError{code:'UNAVAILABLE'}` → `:569-609` 最多试 2 个 bridge 后 `errorText('UNAVAILABLE', message)`。**一处措辞精度说明：** `/invoke` 行写作「`tools/call` returns `UNAVAILABLE`」描述的是**终态**；实现在返回前会对同名工具的候选 bridge 做至多 2 次尝试，故单次超时未必立刻返回。此为规范陈述结果而非过程，不构成漂移。

**一处非阻塞的元数据漂移（如实记录，本任务未修）：** `package-lock.json:3355` 仍记 `packages/mcp-hub` 的 `version` 为 `0.2.2`，与 D2 改后的 `package.json` 0.3.0 不同步。已实测 **`npm ci --dry-run` 退出码 0**（npm 对 workspace 链接包的 version 字段不做硬校验），故 `.github/workflows/ci.yml:20` 的 `npm ci` 不受影响，判定为非阻塞。未随手修复的原因：D6 的 `git add` 被明确限定为 `CHANGELOG.md` 与 `package.json` 两个文件，跑 `npm install` 刷新 lockfile 会引入范围外改动。**建议在下一次需要动 lockfile 的任务中顺带刷新。**

### 2026-08-13 · P2-D · risk 透传 MCP annotations 与 hostApp 规范化

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | **H11**（`risk` 在调用路径上完全失效）：`src/protocol/index.ts` 的 `normalizeToolRisk` / `isAutoApproveRisk` 方向正确（缺失或非法归一为 `exec`，fail-closed），但**唯一调用方是 `defaultAutoApproveToolNames`**，而该 helper 已被 installer 明确弃用。实测 `rg 'risk' src/` 仅 9 处命中，Hub 主路径一次都没读过它：`src/hub/main.ts` 的 `ListToolsRequestSchema` handler 只映射 `name` / `title` / `description` / `inputSchema` 四个字段，`risk` 在此被静默丢弃。后果是一个 `risk: 'exec'`（在远程主机执行任意命令）的工具在 MCP `tools/list` 里与一个只读查询**逐字节同形**，IDE 客户端拿不到任何区分依据，也就无法据此决定是否需要用户确认。**`main.ts` hostApp 遗留**：`main.ts:13` 的 `process.env[AT_SERIES_HOST_APP_ENV] ?? 'unknown'` 把环境变量原值直接当 `hostApp`，未过 `slugifyHostAppId`——而该函数早已存在并导出于 `src/protocol/detectHostApp.ts`，只是这里没用上；插件侧发布时**一律**经过 slugify，两侧遂不对齐 |
| 代码 diff | **新增** `packages/mcp-hub/src/hub/annotations.ts`（49 行）：纯函数 `toolAnnotationsForRisk(risk: unknown): ToolAnnotations` + `toMcpToolDescriptors(tools)` + 出参类型 `McpToolDescriptor`。放在 `src/hub/` 下跟随 `hub/discovery.ts`、`hub/aggregate.ts` 的纯函数模块先例。**入参刻意声明为 `unknown` 而非 `ToolRisk`**——`risk` 经 Bridge HTTP 入境且**全链路无运行期校验**（`bridgeGetTools` 直接把 JSON 断言成 `BridgeToolsResponse`），类型系统里的 `risk: ToolRisk` 是一句无人兑现的承诺，`unknown` 才是诚实签名，归一交给复用的 `normalizeToolRisk`。**新增** `packages/mcp-hub/src/hub/hostApp.ts`（16 行）：`resolveHostAppFromEnv(env)`，`slugifyHostAppId(...) ?? 'unknown'`。**未把该函数放进 `main.ts`**——`main.ts` 是自执行进程入口（模块尾部即 `main().catch(...)`，且依赖 esbuild 注入的 `declare const __HUB_VERSION__`），从测试里 import 会直接把 Hub 跑起来，故必须外提才可单测。`packages/mcp-hub/src/hub/main.ts` **+3/-9**：`tools.map(...)` 九行内联映射换成一行 `toMcpToolDescriptors(...)`；`hostApp` 解析换成 `resolveHostAppFromEnv(process.env)`；`AT_SERIES_HOST_APP_ENV` 的 import 随之移除（已下沉到 `hostApp.ts`）。**测试** `test/hub.annotations.test.ts` 新增 15 用例、`test/hub.hostApp.test.ts` 新增 8 用例。**未触碰** `src/hub/discovery.ts`、`src/hub/aggregate.ts`、`src/hub/server.ts`、`src/protocol/**` |
| 契约影响 | **是** —— Hub 的 MCP `tools/list` 出参形状新增 `annotations` 字段。**纯增量**：既有四字段一字未改，新增字段是 MCP 规范内的可选项，不认识它的客户端按规范忽略即可。**未新增任何协议类型**——`ToolCatalogEntry.risk` 早已存在，`ToolAnnotations` 直接取自 SDK，故 AGENTS.md §2.1 第 2 项（`packages/mcp-hub/src/protocol` 类型同步）本次无需改动，也就无需请 2-C 代改其地盘内的 `src/protocol/index.ts` |
| 文档 diff | `docs/protocol/v2.md` **+29**：**§8 Tool annotations in `tools/list`** 新增（§8.1 映射表、§8.2 fail-closed 归一、§8.3「annotations 是建议而非强制」），另在 **§2** 末尾加一行交叉引用指向 §8。**刻意选择追加 §8 而非插入新 §3**：后者会把现有 §3–§7 全部顺移，而 §7 Diagnostics 已被 P1-B/P1-C 台账按号引用，且 v1.md §15.x 与并发中的另两个 subagent 都可能引用现有编号，重排的代价与风险远大于章节顺序上的一点不完美。`docs/protocol/v1.md` **+3/-1**：**§4.1** 末段拆为两段，第二段写明 Hub 必须以与发布侧相同的 `slugifyHostAppId` 规则（小写、非 `[a-z0-9]` 连续段折叠为 `-`、首尾 `-` 去除、截断 64 字符）规范化 `AT_SERIES_HOST_APP` 后再使用，并说明缺失/为空/规范化后为空一律回落 `unknown` |
| protocolVersion | **不变（Bridge 1 / Hub 2）**。依 v1.md §13.1，仅字段语义反转、必填字段移除、新增必需端点才升版。`annotations` 是 Hub 侧**可选出参**的加性扩展，既有客户端不读它时行为与改动前完全一致；Bridge 线协议一个字节都没动。hostApp 规范化对**已经导出 slug 的宿主**（即 installer 今天配置的每一个宿主）是恒等变换 |
| 插件需跟改 | **否**。插件继续照常在 `GET /tools` 与 registry 快照里声明 `risk`，Hub 单向读取并映射；插件侧的 slugify 行为本就正确，本次是 Hub 追上插件，不是反过来 |
| 核心不变量 | 已核对 **INV-1..INV-6 未被破坏**，其中 **INV-5 与 INV-6 是本任务的正面风险面，逐条说明。** **INV-5（渐进暴露只影响 `tools/list`；selection 不是 ACL；Hub 必须能路由任何当前 winner 工具）：** 审计阶段曾提过「未 select 的工具禁止 `tools/call`」，该建议**已被明确撤回**，本次**一行都没有实现它**。证据有三：(1) 改动集里**完全没有 `src/hub/server.ts`**，`callTool` 的路由分支（`catalog.winners.get(name)`）逐字未变，`git show --stat` 可核；(2) `annotations` 只在 `ListToolsRequestSchema` handler 内产生，`CallToolRequestSchema` handler 一字未改，annotations 在调用路径上**不可达**；(3) `toMcpToolDescriptors` 是纯映射，**不增删数组元素**——入参是什么，出参就是什么，暴露集合仍完全由 `computeExposedBusinessTools` 决定。此外 v2.md §8.3 已把「annotations MUST NOT change routing / MUST NOT change which tools are exposed / selection remains not an ACL」写成规范条款，把这条不变量从「当前实现恰好没破坏」升格为「后续实现不得破坏」。回归上由 `hub.progressiveExposure.test.ts` 13/13 与 `hub.routing.test.ts` 3/3 守住。**INV-6（五个元工具始终暴露、名称保留、`risk: read`）：** `HUB_META_TOOLS` 在 `src/hub/server.ts` 内，本次未触碰，五条 `risk: 'read'` 原样保留。新增用例 `annotates every Hub meta tool as read-only (INV-6)` **不是对着常量数组自证**，而是真起一个空 registry 的 `createHubRuntime`、走 `listToolsForMcp()` 拿到实际暴露集合，先断言其恰好等于 `HUB_BUILTIN_TOOL_NAMES`（顺序敏感），再断言每一条都映射出 `readOnlyHint: true` / `destructiveHint: false`——即把 INV-6 的「全部暴露」与「全部 read」两半一起锁死。其余各条：未触及 MCP 配置入口与单条 server（INV-1/INV-2）；Hub 内未写死任何插件工具清单，annotations 全部由 Bridge 声明的 `risk` 推导（INV-3）；未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与阈值 20（INV-4） |
| 验证 | **① D1 annotations（严格 TDD）：** RED 为 `Cannot find module '../src/hub/annotations'`；GREEN 后 15/15。**fail-closed 语义的证据是三层的**：`toolAnnotationsForRisk(undefined)` 精确 `toEqual({readOnlyHint:false, destructiveHint:true, openWorldHint:true})`；`it.each(['readonly','READ','',42,null,{}])` 六个非法值（含大小写错、空串、数字、`null`、对象）逐一断言 `destructiveHint: true`；以及整条目录路径的端到端用例——构造一个**被 Bridge 漏掉 `risk` 字段**的 `ToolCatalogEntry`，断言 `toMcpToolDescriptors` 输出 `destructiveHint: true`，即「插件忘写 risk 不会换来更宽松的标注」。**② SDK 字段名的双重护栏（做了鉴别力验证，非空断言）：** 新增用例把描述符喂给 SDK 真实的 `ListToolsResultSchema.parse()` 再断言 `annotations` 未被剥离。为确认它真有鉴别力，**故意把实现里的 `readOnlyHint` 改成 `readonlyHint` 重跑**：该用例失败并打印 `- "readOnlyHint": false`（zod 的 `$strip` 把拼错的键静默丢弃）；同一次实验中 `npm run typecheck` 也报 `TS2561: ... Did you mean to write 'readOnlyHint'?`，并在诊断里完整回显了 SDK 的 `ToolAnnotations` 形状 `{ title?, readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint? }`（全部可选、无索引签名、非 passthrough）。随后改回正确拼写。**③ D2 hostApp（严格 TDD，且 RED 直接复现缺陷）：** 第一次 RED 是模块缺失，属弱 RED；遂**先把 `hostApp.ts` 写成与改动前 `main.ts:13` 逐字相同的 `env[X] ?? 'unknown'`** 再跑，得 **6 failed / 2 passed**——`'Cursor'` 未降为 `'cursor'`、`'Visual Studio Code/Insiders'` 原样穿透、`'///'` 未回落 `unknown`、`'My IDE/../escape'` 不匹配 `/^[a-z0-9-]+$/`。这组失败即缺陷本身的复现，其中最后一条正面展示了未规范化的环境变量会造出何种目录名。换成 `slugifyHostAppId` 后 8/8 通过。环境变量一律走 `vi.stubEnv` + `afterEach` 的 `vi.unstubAllEnvs()`，缺失场景用 `vi.stubEnv(name, undefined)`，全程未手工存取 `process.env`。**④ 回归三组（守 INV-4/5/6）全绿：** `hub.progressiveExposure.test.ts` **13/13**、`hub.conformance.test.ts` **9/9**、`hub.server.test.ts` **4/4**。另 `hub.routing.test.ts` 3/3、`hub.aggregate.test.ts` 3/3、`protocol.detectHostApp.test.ts` 6/6 一并确认。**⑤ 全量（沙箱外）：** `npm run typecheck` 退出码 0、零诊断；`npm test` **27 文件 / 288 用例全部通过**（该数字含并发中另两个 subagent 同期落地的新用例；本任务贡献 2 文件 / 23 用例）。**类型纪律：** `rg '\bany\b\|@ts-ignore\|@ts-expect-error' src/` **0 匹配**，src 树零 `any` 保持 |
| 提交 | `366b4fb`（D1 risk → MCP annotations，含 `v2.md` §8）、`2e546a4`（D2 hostApp 规范化：`src/hub/hostApp.ts` + `src/hub/main.ts` + `test/hub.hostApp.test.ts`），另台账 2 条（`94341ee` 及本次修订）。**D2 的 `docs/protocol/v1.md` §4.1 段落落在 `9f7388a` 中**（2-C 的 v1.md 文档提交，两侧改动位于同一 hunk 无法拆分，详见下方说明）。均在分支 `chore/at-series-optimization-phase0`，**未推送远程、未 tag、未 publish、未改 package.json 版本号** |

**`idempotentHint` 刻意不输出（偏离「四个 hint 都填」的直觉解读，理由如下）。** MCP 规范对该字段的定义是「以相同参数重复调用不会产生额外影响」，且注明「仅当 `readOnlyHint == false` 时有意义」。而 `risk` 的三值域**不携带任何幂等性信息**：一个 `write` 工具既可能是幂等的 `sftp_put`（覆盖写），也可能是非幂等的 `append_log`，Hub 无从分辨。可选的两种做法里，填 `false` 是在替插件做一个它没做过的声明，而**留空**在 MCP 语义下表示「未知」而非「否」——后者才是诚实的。该决定已写入 v2.md §8.1 并升格为 `MUST NOT emit` 的规范条款，避免后续实现「顺手补全」。相对地 `openWorldHint` 对所有工具恒为 `true` 是有据可依的：AT 系列工具无一例外作用于 Hub 进程之外的远程系统。

**`listToolsForMcp()` 无需改动（与任务书的预设不同，如实记录）。** 任务书提示「如果 `listToolsForMcp()` 当前返回的类型丢掉了 `risk`，你需要让它保留 risk」。实测其返回类型即 `ToolCatalogEntry[]`，而 `ToolCatalogEntry`（`src/protocol/index.ts:116-122`）本就含 `risk: ToolRisk`——`risk` 一路完好地送到了 `main.ts`，**丢弃发生在最后一跳的 `tools.map(...)` 里**。因此 `src/hub/server.ts` 本次**零改动**，这同时也是 INV-5/INV-6 未被触碰的最强证据。

**出参类型为何是自定义的 `McpToolDescriptor` 而不是 SDK 的 `Tool`。** 直接声明 `toMcpToolDescriptors(...): Tool[]` 会编译失败：SDK 的 `Tool['inputSchema']` 要求 `type` 为字面量 `'object'`，而本包的 `JsonSchemaObject`（`protocol/index.ts:108`）声明为 `type?: string`——这是既有类型宽窄不匹配，与本次改动无关，收敛它需要动 2-C 地盘内的 `src/protocol/index.ts`。折中做法是自定义出参类型、但**其 `annotations` 字段仍精确引用 SDK 的 `ToolAnnotations`**，从而在不改协议类型、不写任何 `as` 断言、不引入 `any` 的前提下，把最需要对齐 SDK 的那部分牢牢锚在 SDK 上；`ListToolsResultSchema.parse()` 用例则从运行期补上另一半保证。**留给后续裁决：** 若 2-C 或后续任务愿意把 `JsonSchemaObject.type` 收紧为 `'object'` 字面量，本模块可直接改用 SDK 的 `Tool` 类型，`McpToolDescriptor` 即可删除。

**并发协作说明：与 2-C 发生两次共享 git index 竞态，最终收敛正确，全程未做任何历史改写。** 本任务只 `git add` 明确路径，从未用 `.` / `-A` / `-u`，每次 `git add` 后都 `git status` 复核过暂存区恰为本任务文件。但**竞态发生在 `git add` 与 `git commit` 之间的窗口里**，与 `git add` 的写法无关：并行 subagent 在该窗口内提交时，会把当时索引中的全部内容（含本任务已暂存的文件）一并带走，本任务随后的 `git commit` 遂报 `no changes added to commit`。**第一次**（D2 首次提交尝试）四个文件被并入 `755e18f`；2-C 随后自行发现并改写了该 commit 把外来文件摘出，本任务的改动**完好退回工作区**（`755e18f` → `16b4250`）。**第二次**（D2 重新提交尝试）再度被抢走，但这次 2-C 把它们**单独提交为 `2e546a4`「fix(hub): slugify AT_SERIES_HOST_APP before scoping the registry」**——标题准确描述了本任务的工作。已逐字核验 `2e546a4` 的三个文件内容与本任务的编辑完全一致（`git show 2e546a4:...` 比对无差异），故**不再补救**：内容正确、提交信息贴切，仅作者归属存在名义偏差，为此改写他人 commit 得不偿失。

**`docs/protocol/v1.md` §4.1 未能独立成commit（如实记录，非疏忽）。** 提交 D2 时该文件的工作区同时含有 2-C 大量未提交的文档改动（标识符字符集、`endpoints` 约束、token 常量时间比较、§10 helper、§14）。整文件 `git add` 会把对方的在制品扫进本任务 commit——正是本任务刚刚亲历的那种事故，故**主动放弃**；而按 hunk 拆分同样不可行，因为 2-C 的「Charset (normative)」段与本任务的 slugify 段落**落在同一个 hunk（@@ -138,7 @@）内**，git 无法在该粒度下分离。选择的做法是先提交纯净的代码与测试、把 v1.md 留给对方，最终该段落随 `9f7388a` 落地，内容完好。

**给后续并行任务的建议：** 把 `git add` 与 `git commit` 合并成单条 `&&` 命令仍无法消除竞态（本任务第二次尝试即为单条 `&&`，依然被抢），因为窗口在于**多个 agent 共用同一个 `.git/index`**。真正的解法是给每个并行 subagent 独立的 git worktree，或改用 `git commit -o <path>...`（only 模式，绕过共享索引直接对指定路径提交）。

除上述索引争用外，与 2-A（`src/publisher/**`、`src/fs/**`）、2-C（`src/registry/**`、`src/protocol/**`、`src/index.ts`、`test/fixtures/fakeBridge.ts`）**无任何文件内容重叠**，全程未遇 `index.lock` 争用。分支最终状态已复核：`npm run typecheck` 零诊断，`npm test` **27 文件 / 288 用例全绿**。

**与 2-C 的 `df001dc`（路径 API 字符集断言）无语义冲突，已实测。** 该 commit 要求 `hostApp` 必须是单个路径段；本任务的 `slugifyHostAppId` 输出恒为 `/^[a-z0-9-]{1,64}$/`，天然满足，且正是把「Hub 侧可能传入非法段」这一入口堵死的那一环——两者方向一致、互为补强。合并后 `protocol.paths.test.ts` **53/53** 与本任务的 `hub.hostApp.test.ts` **8/8** 同时通过，未出现需要 rebase 重跑的行为冲突。

### 2026-08-13 · P2-A · hub bundle 完整性校验、选举锁与共享原子写

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | **H4**（sha 从不校验磁盘）：`syncHubBundle` 的 no-op 判定拿**候选文件**的哈希与 `hub-version.json` 里**自称**的哈希相比，全程没读过 `hub.js` 本身。把 `~/.at-series/mcp/hub.js` 换成恶意代码、保持 meta 不动，之后每个插件启动时的 `syncHubBundle` 都会命中 no-op 而拒绝修复——这个看起来像完整性校验的函数实际是后门的保护伞，而 `hub.js` 正是 IDE 用 `node` 直接执行的文件。**H5**（选举无锁 TOCTOU）：读 meta、写 `hub.js`、写 meta 是三个独立步骤，中间无互斥；三个插件在 IDE 启动时几乎同时激活，A(0.3.0) 与 B(0.2.0) 同时读到空 meta、B 后写，最终磁盘上是低版本——违反 AGENTS.md §3.3 钉死的「semver 更低 → 禁止覆盖」。**H8**（权限时序）：`BridgePublisher.atomicWrite` 先 `writeFile` 再 `chmod 0600`，中间含 token 的文件以 umask 默认权限（通常 0644）存在；且 `~/.at-series` 与 `~/.at-series/bridges` 两级父目录没有任何代码路径会把它们设为 0700 |
| 代码 diff | **新增** `packages/mcp-hub/src/fs/atomicWrite.ts`（59 行）：`atomicWriteFile` / `ensureDir` / `tryChmod`。临时文件以 `{ mode: 0o600 }` **创建**而非事后 chmod；`ensureDir` 在 `mkdir(recursive)` 之后补一次显式 chmod，因为 `recursive` 的 `mode` 只作用于最深一级。**临时文件名用 `pid + randomBytes(8)` 而非任务书给出的 `pid + Date.now()`**，理由见下方「A1 的并发用例抓到了任务书参考实现里的真实缺陷」。`packages/mcp-hub/src/publisher/BridgePublisher.ts` **-32/+3**：删除私有 `atomicWrite` / `tryChmod`，三处写入改调共享实现，`publish` 里的 `mkdir` + `chmod 0700` 换成 `ensureDir`；`path` import 随之移除。`packages/mcp-hub/src/publisher/HubBundleSync.ts` **累计 +190/-34**：删除私有 `atomicWriteBytes` / `atomicWriteText` / `tryChmod`；新增 `onDiskSha256`（ENOENT → `undefined`，永不等于任何记录哈希）并在 no-op 分支**之前**比对；`readActiveVersion` 由 `JSON.parse(text) as HubVersionRecord` 的无校验断言改为「读失败 / 解析失败 / 非对象 / 数组 / `version` 非 string 或非 semver / `bundleSha256` 缺失或空 → 一律返回 `undefined`」，并新增纯函数 `asHubVersionRecord` 做结构校验（provenance 四字段缺失时填默认值，不因此判废整条记录）；新增 `withHubSyncLock` / `acquireLock` / `stealIfStale` / `readLockAcquiredAt`，把「读 meta → 校验磁盘 → 判定 → 写 hub.js → 写 meta」整段收进一个跨进程锁；meta 写失败时 `fs.rm` 掉旧记录再重抛。**测试** `test/fs.atomicWrite.test.ts` 新增 174 行 / 13 用例，`test/publisher.hubBundleSync.test.ts` **+338/-28**，由 5 用例增至 23 用例。**未触碰** `src/registry/**`、`src/protocol/**`、`src/hub/**`、`src/index.ts` |
| 契约影响 | **是** —— 触及 AGENTS.md §2.1 的「publisher / hub sync helper 的对外契约」与 §3.2 权限。三条新增规范：(1) no-op 前 MUST 校验磁盘上 `hub.js` 的真实哈希，不符或缺失时即使记录 semver 更高也 MUST 重写；(2) 选举整段 MUST 互斥，锁 MUST 含 stale 处理与释放保证；(3) `~/.at-series` 全路径 MUST 0700、文件 MUST **创建即** 0600（而非创建后 chmod） |
| 文档 diff | `docs/protocol/v1.md` **3 个 hunk，+95/-2**。**§3.2 Permissions**（+15/-2）：原「SHOULD 设 0700/0600」升为 MUST，并写明覆盖 `~/.at-series`、`bridges`、`bridges/<hostApp>`、`mcp` **全部层级**而非仅叶子目录（`mkdir(recursive)` 的 `mode` 只作用于最深一级，中间层 MUST 显式收紧）；新增「文件 MUST 创建即 0600，先写后 chmod 会留下 umask 默认权限的窗口」；新增「写入 MUST 原子（同目录 temp + rename），且 **temp 文件名 MUST 每写入者唯一**，仅用 pid+毫秒时间戳会在同进程并发写时碰撞并产生撕裂内容」；Windows 的 best-effort 说明从条目里独立出来。**§8.6 Hub version election** 在原四条规则之后新增三个小节（+70）：`On-disk verification (normative)`（记录只是 claim，必须哈希磁盘字节；不符或缺失 → 当作无 active 并落到写入路径，含 semver 更高的情形；附攻击场景说明）、`Corrupt metadata (normative)`（不可读/不可解析/非对象/结构非法 → 视为无 active 并自愈；MUST NOT 抛错，否则全机 hub 同步永久卡死；provenance 字段 MUST NOT 判废记录）、`Mutual exclusion (normative)`（整段临界区、`O_EXCL` 锁文件路径与内容形状、有界等待、stale 强制夺取且夺取本身 MUST 原子、必须释放、meta 写失败 MUST 删除旧记录），末尾给出本包的参考阈值 30 s / 5 s。**§15 Conformance tests** 追加 **#14–#17**（篡改 hub.js 被重写、损坏 meta 自愈、并发选举高版本胜出且 meta 与磁盘一致、stale 锁被夺取且成功/失败后均释放）。`AGENTS.md` **§3.3** +5：在原四条选举规则下补三条并发与完整性语义，并指向 v1.md §8.6。**§10 刻意未改**——其原文已写「`syncHubBundle(...)` implements the `HubBundleSync` election rules in §8.6」，§8.6 收紧即自动生效；且 2-C 正在同一 hunk 区域改 §10，避免争用 |
| protocolVersion | **不变（Bridge 1 / Hub 2）**。依 v1.md §13.1，仅字段语义反转、必填字段移除、新增必需端点才升版。本次三条全部是**对既有规则的加性收紧**，且都落在 Hub 与 publisher 的**本地文件系统行为**上：`hub-version.json` 的字段一个没增没删没改语义，Bridge 线协议一个字节没动，`syncHubBundle` 的入参与返回类型逐字未变。一个**未被篡改**的正常安装在改动前后走的是完全相同的分支、得到完全相同的结果——差异只出现在篡改、崩溃残留、并发三种异常路径上，而这三种情况下旧行为本就是错的。锁文件 `.hub-sync.lock` 是新增的磁盘产物，但它位于 `~/.at-series/mcp/` 内、以 `.` 开头、生命周期只在一次 sync 内，不构成插件需要认识的契约 |
| 插件需跟改 | **否**。`syncHubBundle` 的签名与语义对合规调用方不变；三插件继续在 activate 时照常调用即可。**唯一需要知晓的行为差异**：若某台机器上的 `hub.js` 曾被篡改或半写，第一次调用会返回 `updated: true` 而非以往的 `false`——这是修复本身，不需要插件配合 |
| 核心不变量 | 已核对 **INV-1..INV-6 未被破坏**。**INV-1 / INV-2（MCP 配置只有一条 `AT Series`、只指向 `~/.at-series/mcp/hub.js`）是本任务的正面加固**：改动没有引入任何新的 MCP 入口或备用路径，`hubJsPath` / `hubVersionPath` / `mcpDir` 一字未改（那是 2-C 的地盘，本任务只读调用）；相反，磁盘哈希校验与选举锁**恰恰是在保证那唯一入口指向的字节是选举胜出者的字节**，这正是 INV-1/INV-2 在文件系统层面的兑现。**INV-3**（Hub 内不写死插件工具清单）：本任务不产生也不消费任何工具名。**INV-4 / INV-5（渐进暴露默认值、阈值、selection 不是 ACL）与 INV-6（五个元工具的暴露与 risk 分级）：均未触碰**——`git show --stat` 逐一确认三个 commit 的文件清单只含 `src/fs/atomicWrite.ts`、`src/publisher/{BridgePublisher,HubBundleSync}.ts` 及其两个测试，`src/hub/**` 与 `src/protocol/**` **零改动**，`rg 'AT_SERIES_TOOL_DISCOVERY\|HUB_META_TOOLS\|computeExposedBusinessTools' src/fs src/publisher` **0 匹配**。回归上由 `hub.progressiveExposure.test.ts` 13/13、`hub.conformance.test.ts` 9/9、`hub.server.test.ts` 4/4 守住 |
| 验证 | **三个 Task 全部严格 TDD，每个缺陷先写失败测试并留证。** **① A1 RED：** `Error: Cannot find module '../src/fs/atomicWrite'`。**② A2 RED（后门留存的决定性证据）：** 9 个新用例失败，关键一条原文 `FAIL … > on-disk integrity > rewrites hub.js when the file on disk no longer matches its recorded hash` / `AssertionError: expected false to be true // Object.is equality` / `- true  + false`（`test/publisher.hubBundleSync.test.ts:206`）。该断言在读文件之前就失败，故另用一次性脚本取得**后门确实留在磁盘上**的直接证据：首次 sync 建立 `hub.js` 后把它换成 `/* backdoor */`，再次 sync 得 `result = {"updated":false,"activeVersion":"0.3.0"}`、`hub.js on disk = "/* backdoor */\n"`——**修复被拒绝、后门原样留存**。另 8 条失败覆盖 meta 损坏：`Error: invalid active hub semver: undefined`（`{}` 与 `[]`）、`SyntaxError: Unexpected token 'o', "not json {{{" is not valid JSON`、`invalid active hub semver: garbage`、`invalid active hub semver: 3`、以及 `{"version":"0.2.0"}` 缺 `bundleSha256` 时错误地 no-op 掉（`activeVersion` 返回 `0.2.0`）。GREEN 后 15/15。**③ A3 RED 与鉴别力验证（详见下方专段）：** 实现前 `concurrent election` 组连跑 10 轮，**每轮均有失败**；实现后连跑 5 次 23/23 全绿。**④ 全量（沙箱外）：** `npm run typecheck` 退出码 0、零诊断；`npm test` **27 文件 / 288 用例全部通过**（含并发中另两个 subagent 同期落地的用例；本任务贡献 1 个新文件 13 用例 + 既有文件 5→23 用例）。**⑤ 类型纪律：** `rg '\bany\b\|@ts-ignore\|@ts-expect-error' src/` **0 匹配**，src 树零 `any` 保持；`rg 'COUNTERFACTUAL' src/ test/` **0 匹配**，确认反证用的临时开关未残留 |
| 提交 | `a2bdae3`（A1 抽出 `atomicWriteFile`）、`2138209`（A2 校验磁盘 hub.js 哈希）、`6bb42c9`（A3 stale-aware 选举锁），另本条台账与文档 1 条。均在分支 `chore/at-series-optimization-phase0`，**未推送远程、未 tag、未 publish、未改 package.json 版本号** |

**A3 那条并发测试的鉴别力是怎么验证的（这是本条最需要交代清楚的一点）。** 任务书明确警告并发用例可能偶发通过，上一轮也确实出过一条没有鉴别力的保护性测试，故本次做了**双向**验证，而不是只跑一次看它变红。

**方向一，实现前连跑：** 单独跑任务书给出的那一条（`never lets a lower version win a concurrent election`）**20 轮，10 轮失败、10 轮通过——命中率恰好 50%**。这个数字证实了警告是对的：**只有这一条用例是不够的**，把它单独放进 CI 有一半概率放行一个无锁实现。据此把并发场景扩成三条互补的用例：高版本先调度、低版本先调度、以及三个插件同时竞争，另加四条锁语义用例（成功后释放、失败后释放、stale 锁夺取、损坏锁视为 stale）与一条「活锁不得永久阻塞」。整组 `concurrent election` 在实现前连跑 **10 轮，每轮都至少 1 条失败（10/10 检出）**。

**方向二，实现后故意去掉锁反证：** 在 `withHubSyncLock` 里临时插入一个由环境变量控制的短路分支（`return run()`，等价于完全没有锁），实现其余部分一字不动。**只跑三条选举用例、连跑 20 轮，20 轮全部检出**（每轮 1–3 条失败，其中 2 轮是三条全红）；跑整组 `concurrent election` 连跑 10 轮同样 10/10 检出。随后删除该短路分支并 `rg 'COUNTERFACTUAL'` 确认零残留，再连跑 5 次确认非 flaky（23/23 × 5）。

**两个方向合起来才说明问题：** 方向一证明「没有锁时测试会红」，方向二证明「红是因为缺锁，而不是因为别的巧合」——因为反证时**唯一**的变量就是那一行短路。顺带得到一个可复用的结论：**单条并发用例的检出率可能低到 50%，把同一竞态用多个互补角度覆盖（不同调度顺序 + 更多竞争者 + 一条确定性的锁语义用例）才能把检出率推到 100%。** 其中「活锁不得永久阻塞」那条是唯一**确定性**失败的用例（无锁时它必然 resolve 而非 reject），它把整组的检出率从概率性抬成了必然性。

**A1 的并发用例抓到了任务书参考实现里的真实缺陷（偏离任务书代码，理由如下）。** 任务书给出的 `atomicWriteFile` 用 `.${basename}.${pid}.${Date.now()}.tmp` 作为临时文件名。照抄实施后，A1 的「10 个写入者竞争同一目标」用例立刻失败：`Error: ENOENT: no such file or directory, rename '….contended.json.15930.1786603778217.tmp' -> '….contended.json'`——**10 个并发写入者落在同一毫秒、pid 又相同，于是共用了同一个临时文件**：内容互相覆盖（撕裂），第一个 rename 成功后其余 rename 全部 ENOENT。改用 `pid + crypto.randomBytes(8)` 后 13/13 通过。**这不是新引入的问题**：`BridgePublisher` 与 `HubBundleSync` 原有的两份私有实现用的正是同一套命名，也就是说这个撕裂窗口在本次抽取之前就存在于线上代码里（heartbeat 与 updateTools 高频写同一个 bridge record，是最可能命中的场景）。已把「temp 文件名 MUST 每写入者唯一」写进 v1.md §3.2 的 normative 条款，避免后续实现重新踩回去。

**权限用例为什么这样写。** 「写入过程中不存在权限宽松的中间态」无法靠事后 stat 证明——窗口在写入期间。用例改为在写一个 4 MiB 文件的同时以 1 ms 间隔轮询目录，把**期间出现过的每一个条目**（含临时文件）的 `mode & 0o777` 收集起来，逐一断言等于 `0600`。这样断言的是「窗口内任何时刻可见的文件都不宽松」这一不变量本身，而非某个时间点的快照。全部权限相关用例用 `it.skipIf(process.platform === 'win32')` 跳过，因为 Windows 上 `chmod` 是 no-op。另补一条「已存在的 0644 文件被重写后收紧为 0600」，覆盖修复前遗留的宽权限文件。

**meta 写失败的清理路径未被单元测试直接覆盖（如实记录）。** 实现里 `atomicWriteFile(targetMeta, ...)` 失败时会 `fs.rm` 掉旧记录再重抛，避免留下「hub.js 是新的、meta 却声称是旧哈希」的状态。要在测试里逼出这条分支，需要让 meta 写失败而 hub.js 写成功——把 `hub-version.json` 造成目录是最直接的办法，但那样 `readActiveVersion` 会先在 `fs.readFile` 上撞 EISDIR 而提前抛出，走不到该分支；不引入 mock 就无法构造。**但这条状态本身是有测试保障的**：A2 的磁盘哈希校验意味着「hub.js 与 meta 不一致」在下一次 sync 必被检出并重建，对应用例 `rewrites hub.js when the file on disk no longer matches its recorded hash` 与 `rewrites hub.js when the metadata exists but the file is gone` 均已通过。清理动作只是把自愈提前，不是唯一防线。

**锁的 stale 夺取用 rename 而非 unlink（超出任务书的实现细节）。** 任务书只要求「超过阈值视为陈旧并强制夺取」。若直接 `rm` 再 `open(wx)`，两个等待者可能都判定为 stale：A 删、A 创建（A 持锁），B 随后删掉了 **A 的新锁**、B 再创建，两者同时以为自己持锁。改为 `rename(lock, <unique>.stale)` 后夺取本身是原子的——源文件消失是一次性的，第二个等待者的 rename 直接 ENOENT，只能回到普通 `open(wx)` 路径。残余窗口只剩「读取 acquiredAt 与 rename 之间锁被正常释放并被第三方重新持有」，需要两次事件恰好落在同一微小窗口内，且最坏后果是临界区被重复进入一次，而临界区内会重新读 meta 并重新校验磁盘。该做法已写进 v1.md §8.6 的 normative 条款（「Reclaiming MUST itself be atomic」）。

**`readActiveVersion` 的校验为什么只硬性要求两个字段。** 选举实际读取的只有 `version` 与 `bundleSha256`，其余四个是 provenance。若把它们也设为必填，一份由旧版本写出、字段不全但**完全可用**的记录会被判废并触发不必要的重写。因此 `asHubVersionRecord` 对 provenance 字段缺失时填默认值（`protocolVersion` 回落到 `AT_SERIES_HUB_PROTOCOL_VERSION`，两个 plugin 字段回落 `'unknown'`，`writtenAt` 回落 `0`），只有 `version` 非 semver 或 `bundleSha256` 缺失/为空才判为「无 active」。这条取舍也已写进 v1.md §8.6（「Provenance fields … MUST NOT invalidate an otherwise usable record」）。

**并发协作说明：与 2-C、2-D 全程零文件内容冲突，未遇 `index.lock` 争用。** 三个代码 commit 各自只 `git add` 本任务的明确路径（从未用 `.` / `-A` / `-u`），`git show --stat` 复核确认文件清单分别为 4 / 2 / 2 个，无夹带。**文档提交采取了额外规避措施：** `docs/protocol/v1.md` 在提交时同时含有 2-C 大量未提交的在制品（§4.1 charset、§4.2/4.3 rejection、§4.4、§5.2、§7.2、§10），整文件 `git add` 会把对方在制品扫进本任务 commit——这正是 P2-D 台账 L412 记录过的事故。本任务的三个 hunk（§3.2 @86、§8.6 @625、§15 @835）与 2-C 的全部 hunk（@141、@157-175、@238-257、@334、@664、@753）**零重叠**，故改用「从 `HEAD:docs/protocol/v1.md` 出发、只应用本任务这三个 hunk、把结果写成 blob 后精确入索引」的方式提交，对方的在制品完整保留在工作区未暂存。`AGENTS.md` 提交时为干净状态，台账在 `git add` 前重新读取并追加于 P2-D 条目之后，未覆盖任何既有条目。

**采纳 P2-D 台账 L414 的建议（共享 `.git/index` 竞态）。** 该条建议「把 `git add` 与 `git commit` 合并成 `&&` 仍无法消除竞态，真正的解法是独立 worktree 或 `git commit -o`」。本任务的文档提交没有用 `-o`（`--only` 取的是**工作树**内容，对 v1.md 会重新引入对方的在制品），而是用了等效但更精确的路径：在**独立的临时索引文件**（`GIT_INDEX_FILE`）上组装提交树，`commit-tree` 后以带旧值校验的 `update-ref` 落地，全程不碰共享索引；落地后再只对本任务的三个路径同步共享索引条目，使其与新 HEAD 一致，避免给其他 agent 留下「已暂存的回退」。

> **【2-C 补记】上一段关于 `755e18f` 的结论已失效，D2 的四个文件现由 `2e546a4` 承载。** 详见下条 P2-C 末尾的「并发协作说明」。内容逐字节未变，`git hash-object` 三个源文件与 `755e18f` 中的 blob 完全一致。

### 2026-08-13 · P2-C · registry 字段校验、路径断言与 token helpers

| 字段 | 内容 |
|---|---|
| 仓库 | at-series-mcp-hub |
| 动机 | **H7**：`parseBridgeRegistryRecord` 对 `port` 只做 `isFiniteNumber`（`0` / `-1` / `3.14` / `70000` 全部放行），对 `endpoints`（可覆盖 `/health`、`/tools`、`/invoke`）**完全不校验**，原样返回后被字符串拼接进 `http://127.0.0.1:<port>`。二者叠加的后果是：一个只有**文件写权限**的低权限方（恶意 npm postinstall、受限沙箱里的扩展）可以驱使 Hub 向**任意本地端口的任意路径** POST 任意 JSON——`port: 2375` + `endpoints.invoke: "/v1.41/containers/create"` 即指向 Docker daemon。信任边界因此从「能执行代码」塌到「能写一个文件」。**H10**：`bridgeRecordPath(hostApp, bridgeId, home)` 把两个字符串直接 `path.join`，`FsBridgePublisher.publish` 只校验 `record.bridgeId === opts.bridgeId`、不校验字符集；而这两个函数是 `src/index.ts` 导出的**公共 API**，插件很可能直接传入 `vscode.env.appName` 或用户可控的 id。`bridgeId: '../../../.cursor/mcp'` 会让 `publish()` 把 bridge 记录写进用户的 `~/.cursor/mcp.json`，破坏其 MCP 配置。**H9**：`docs/protocol/v1.md` 要求 bridge token「高熵、per-instance、永不记录」，但本包**只消费** token，既没导出 `createBridgeToken()` 也没导出验证函数；三个插件各自实现比较逻辑，全都落到了 `===`（`at-terminal-series/src/mcp/BridgeServer.ts:410` 的 `series === token` 为实例），而本仓的「参考 Bridge 实现」`test/fixtures/fakeBridge.ts:108` 同样是 `headerToken !== token`——插件作者照抄就得到一个可计时攻击的比较。**顺带**：`PLUGIN_ID_PATTERN` 与 `TOOL_NAME_PATTERN` 两个常量自定义之日起**全仓零引用**，规范写了却没人执行 |
| 代码 diff | **C1（`04c6db6`，4 文件 +262/-7）**：`src/protocol/index.ts` 新增 `BRIDGE_ENDPOINT_PATH_PATTERN = /^\/[A-Za-z0-9._~\-\/]*$/`、谓词 `isBridgeEndpointPath`（正则 + 显式排除 `..` 与 `//`）、`isBridgePort`（`Number.isInteger` 且 `1..65535`），并把 `resolveBridgeEndpoints` 的三处 `?? DEFAULT` 改为「校验后回落 DEFAULT」；`src/registry/read.ts` 新增 `hasValidEndpoints`（`undefined` 放行，非纯对象拒绝，三个已知键逐个校验，未知键按 v1 前向兼容忽略）与 `hasValidToolNames`，`pluginId` 接上 `PLUGIN_ID_PATTERN`，`port` 由 `isFiniteNumber` 换成 `isBridgePort`，`tools` 增加名称校验；`test/registry.read.test.ts` +145（40 个新用例），新增 `test/protocol.endpoints.test.ts`（7 用例）。**C2（`df001dc`，3 文件 +98/-1）**：`src/protocol/index.ts` +8 新增 `REGISTRY_PATH_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/`；`src/protocol/paths.ts` +19 新增私有 `assertPathSegment(field, value)`，`bridgesDirForHostApp` 校验 `hostApp`、`bridgeRecordPath` 校验 `bridgeId`（后者调用前者，故一次调用两个段都被覆盖），错误信息形如 `Invalid bridgeId "../../../.cursor/mcp": must match …`；`test/protocol.paths.test.ts` +72（50 个新用例，8 个合法 slug × 2 个函数 + 16 个非法 slug × 2 个函数 + 2 个专项）。**C3（`16b4250`，4 文件 +108/-1）**：新增 `src/protocol/token.ts` 34 行（`createBridgeToken` = `randomBytes(32).toString('base64url')`；`timingSafeEqualToken` 先比 **Buffer** 长度再走 `crypto.timingSafeEqual`）；`src/index.ts` **+1**（追加一行 `export { createBridgeToken, timingSafeEqualToken }`，既有导出项一字未动）；`test/fixtures/fakeBridge.ts` +3/-1（`headerToken !== token` → `typeof headerToken !== 'string' \|\| !timingSafeEqualToken(headerToken, token)`，签名与行为不变）；新增 `test/protocol.token.test.ts`（11 用例） |
| 契约影响 | **是** —— 触及 AGENTS.md §2.1 的两项。**(1)「registry 字段 / 路径 / 删除语义」**：`port` 由「有限数」收紧为「`1..65535` 整数」；`endpoints.*` 从无约束收紧为路径白名单且拒绝 `..` / `//`；`pluginId` 与 `tools[].name` 的既有正则由「文档写了但没执行」变为「不符即跳过记录」；`hostApp` / `bridgeId` 的字符集由「隐含」变为「路径 API 显式抛错」。**(2)「publisher / hub sync / installer helper 的对外契约」**：公共导出面新增 `createBridgeToken` / `timingSafeEqualToken`，另附带导出 `BRIDGE_ENDPOINT_PATH_PATTERN` / `REGISTRY_PATH_SEGMENT_PATTERN` / `isBridgeEndpointPath` / `isBridgePort`（供插件在 publish 前自校验），以及 `bridgesDirForHostApp` / `bridgeRecordPath` 由「永不抛错」变为「非法段抛错」——这是本轮**唯一一处既有导出的行为变更**，详见下方兼容性核查 |
| 文档 diff | `docs/protocol/v1.md` **+74/-14**（commit `9f7388a`）：**§4.1** 新增 Charset (normative) 段（`^[a-z0-9][a-z0-9._-]{0,63}$`、路径helper 抛错而非解析、`slugifyHostAppId` 天然合规）+ Compatibility 段；**§4.2** 新增 Rejection 段（`pluginId` 不符即跳过整条记录，理由是它是路由与冲突裁决的分组键且无 live 端点可纠正）+ Compatibility；**§4.3** 规则表增一行字符集要求，新增 Rejection 段（点名 `../../../.cursor/mcp` 覆盖 IDE MCP 配置的后果）+ Compatibility（明确**只接受小写**，与 `slugifyHostAppId` 一致，大写 UUID 会被拒）；**§4.4** 新增 Rejection 段（整条记录跳过而非丢单个条目）；**§5.2** 字段表 6 行措辞收紧并交叉引用 §4.2/§4.3/§4.4/§10，新增小节 **“`port` and `endpoints` are the Hub's outbound target (normative)”**（约束表 + Docker daemon 的具体攻击链 + 为何单列 `..`/`//` + 跳过语义 + `resolveBridgeEndpoints` 回落）+ Compatibility；**§7.2** 新增 Token comparison (normative) 三段（常量时间 MUST、`createBridgeToken` 为合规生成器、以及「回环上可利用性有限但正确写法只值一次函数调用」的取舍说明）+ Compatibility；**§10** 新增 Bridge token helpers 代码块与四条要点（含「`crypto.timingSafeEqual` 长度不等会抛，这正是手写实现退回 `===` 的常见原因」）+ Compatibility；**§14.2** 安全不变量追加「compared in constant time (§7.2)」。`docs/guides/plugin-integration.md` **+32/-9**：导入示例增补两个 helper；步骤 1 的身份表三行补上各自正则与「不符即被跳过」；步骤 3 新增 `isAuthorized` 常量时间比较示例并明确写「Do **not** use `===`」；步骤 4 的 `bridgeId` 注释写明字符集与「不要大写、不要用用户输入」，`token` 改为来自 `createBridgeToken()`，`port` 注释写明整数范围；Common failures 表新增两行（记录被静默跳过的排查线索、`publish()` 抛 `Invalid bridgeId`） |
| protocolVersion | **不变（Bridge 1 / Hub 2）**。依 v1.md §13.1，仅当既有字段语义反转、必填字段移除、或新增必需端点时才升版。本次全部条款均为**加性澄清**：`port` 的 `1..65535` 本就写在 §5.2 字段表里，这次只是让 Hub 真正执行表上的话；`endpoints` 的白名单约束的是一个**可选**字段，而三个插件一个都没用过；`pluginId` / tool name 的正则原文即写着 MUST；`hostApp` / `bridgeId` 的字符集是把 `slugifyHostAppId` 与 `randomUUID()` 的既有输出形态写成规范；两个 token helper 是纯新增导出。原 v1 文本下的合规 Bridge 已然满足全部新条款 |
| 插件需跟改 | **是** —— 三插件应改用导出的 `timingSafeEqualToken` 替换各自 Bridge 里的 `===`（terminal 的 `src/mcp/BridgeServer.ts:410` 已定位，jumpserver / grafana 同构），并可顺带改用 `createBridgeToken()` 替换手写的 `randomBytes(32).toString('hex')`（后者熵相同、非必须，属统一实现）。按总纲这属**阶段 3/4 范围**，本任务不跨仓改动。**注意：这是「应改」而非「必须改」——** 不改的插件在线协议上与改了的插件不可区分，Hub 侧行为完全不变，不构成阻塞 |
| 核心不变量 | 已核对 **INV-1..INV-6 未被破坏**。**INV-1/INV-2**：未触及 MCP 配置写入路径与 `~/.at-series/mcp/hub.js` 单条 server 语义；C2 的断言反而是 INV-1 的**正向加固**——`bridgeId: '../../../.cursor/mcp'` 原本能让 `publish()` 覆写用户的 `~/.cursor/mcp.json`，即从 registry 侧破坏「本系列只能有一条 `AT Series`」这条不变量本身，现已抛错阻断。**INV-3**：Hub 内未写死任何插件的工具清单；新增的校验是**形态**校验（正则、范围、字符集），对 `at.terminal` / `at.jumpserver` / `at.grafana` 无任何特判分支，`rg 'at\.(terminal\|jumpserver\|grafana)' src/` 在本次改动的 4 个源文件中 **0 匹配**。**INV-4/INV-5**：未触及 `AT_SERIES_TOOL_DISCOVERY` 默认值与阈值，未触及 selection 语义；`src/hub/**` 本次**零改动**（`git show --stat` 逐一确认三个 commit 的文件清单不含该目录），渐进暴露与 `tools/call` 路由逐字未变，selection 仍不是 ACL。**INV-6**：五个元工具的暴露、名称、`risk: read` 与 autoApprove 均未触碰——它们是 Hub 内建，不经 registry 解析，因此新的记录校验对其无任何影响 |
| 验证 | **严格 TDD，三组各自先红后绿，失败原文留证。** **① C1 RED（31 失败 / 24 通过，一红一绿证明用例组有鉴别力）：** 最关键的两条是 SSRF 与穿越的直接证据——`endpoints.invoke: "/v1.41/containers/create"` + `port: 2375` 的记录**被原样接受**，`listBridgeRecords` 返回 `[ 'ssrf', 'traversal' ]` 而期望 `[ 'ssrf' ]`；`parseBridgeRegistryRecord` 对 `endpoints.invoke = '/../admin'` 返回完整记录（`AssertionError: expected { protocolVersion: 1, …(11) } to be null`，Received 中赫然是 `"endpoints": { "invoke": "/../admin" }`）。`resolveBridgeEndpoints` 侧同样留证：`expected '/../admin' to be '/invoke'`、`expected '//evil' to be '/invoke'`、`expected 'not-a-path' to be '/invoke'`、`expected '/v1.41/containers/create?x=1' to be '/invoke'` 四条，即**非法覆盖被逐字送进 URL 拼接**。port 侧 `0` / `-1` / `3.14` / `70000` 四个值均返回记录而非 null（`NaN` 与 `Infinity` **当时即已通过**，因旧的 `isFiniteNumber` 本就拦得住，如实记录：这两个值不是本次修复的增量）。GREEN 后 `registry.read.test.ts` **48/48**、`protocol.endpoints.test.ts` **7/7**。**② C2 RED（34 失败 / 19 通过）：** 19 个通过的全是合法 slug 用例，证明用例组不是恒假。穿越用例的**第一条断言当场通过**——`path.join('/home/u/.at-series/bridges/cursor', '../../../.cursor/mcp.json')` 确实等于 `/home/u/.cursor/mcp.json`，即「记录会落在用户 MCP 配置上」是实测而非推断；随后的 `expect(...).toThrow(/bridgeId/)` 报 `AssertionError: expected [Function] to throw an error`。GREEN 后 **53/53**。**③ C3 RED：** `Error: Cannot find module '../src/protocol/token'`。GREEN 后 **11/11**（含 512 个 token 全不重复、43 字符 base64url、解码回 32 字节、首字符差异/末字符差异/长度不等三种不匹配、`'é'` vs `'ab'` 这类「字符串长度相同但字节长度不同」不抛异常、以及从 `src/index.ts` 根导出可用）。**④ 全量（沙箱外）：** `npm run typecheck` **退出码 0、零诊断**；`npx vitest run` **27 文件 / 288 用例全部通过，退出码 0**。沙箱内另见 4 个 `EPERM: mkdir '.../.cursor'`（`installer.cursor.test.ts` 3 个 + `p0a.e2e.functional.test.ts` 1 个），与 P0-T3a / P1-B 记录的同源，沙箱外全部消失。**⑤ 最敏感回归点逐一确认全绿：** 走真实 HTTP 与 registry 全链路的 `hub.conformance.test.ts` **9/9**、`p0a.e2e.functional.test.ts` **3/3**、`bridgeClient.http.test.ts` **11/11**（后者验证 `resolveBridgeEndpoints` 改动未影响出站）、`publisher.bridgePublisher.test.ts` **7/7**（验证 C2 的断言未误伤 publisher 正常路径）、`hub.watch.test.ts` **2/2**（验证 `bridgesDirForHostApp` 抛错未破坏 watch）。**⑥ 类型纪律：** `rg '\bany\b\|@ts-ignore\|@ts-expect-error' src/` **0 匹配**，本包 src 树零 `any` 保持 |
| 提交 | `04c6db6`（C1 registry 字段校验）、`df001dc`（C2 路径断言）、`16b4250`（C3 token helpers）、`9f7388a`（契约文档同步），另本条台账 1 条。另有 `2e546a4` 为**代 2-D 恢复**的提交，见下方并发说明。均在分支 `chore/at-series-optimization-phase0`，**未 `npm publish`、未 `git tag`、未推送远程**，`packages/mcp-hub/package.json` 版本号未动 |

**三项收紧逐一核查过现有插件的合法取值，无一被拒（这是本任务的停止条件，已实测而非推断）。** `port`：三插件均 `server.listen(0, '127.0.0.1')` 后发布 `address.port`，必为 `1..65535` 的整数。`endpoints`：`rg 'endpoints' <三仓>/src` **零匹配**——一个都没覆盖过，全部走默认值。`pluginId`：`at.terminal` / `at.jumpserver` / `at.grafana`，均匹配 `PLUGIN_ID_PATTERN`。工具名：逐个核对三仓 `src/mcp/toolCatalog.ts` 共 **33 个**工具名（terminal 9 + jumpserver 15 + grafana 9），全部匹配 `^[a-z][a-z0-9_]*$`。`bridgeId`：三仓均为 `private readonly bridgeId = randomUUID()`，Node 的 `randomUUID()` 返回小写十六进制，长度 36，匹配 `^[a-z0-9][a-z0-9._-]{0,63}$`。`hostApp`：由 `detectHostApp` 产出，其内部一律经 `slugifyHostAppId` 小写化。**唯一需要点名的边界是大小写**：`bridgeId` 与 `hostApp` 均**只接受小写**（与 `slugifyHostAppId` 的既有行为保持一致，未擅自放宽）。若将来某个插件改用大写 UUID 或未经 slugify 的 `vscode.env.appName`，`publish()` 会抛错而非静默写到错误位置——这是有意的失败方式，已写进 §4.3 的 Compatibility 段。

**一处刻意的取舍：非法工具名拒绝整条记录，而非只丢掉那一条工具。** 两种做法都能自圆其说：只丢条目对可用性更友好（registry 的 `tools` 只是冷启动缓存，live `GET /tools` 优先，插件不会整个消失）。最终选择整条拒绝，理由有二：(1) 与 `parseBridgeRegistryRecord` 既有的契约一致——它的注释原文就是「Returns null when the value is not a usable v1 BridgeRegistryRecord」，缺 `pluginDisplayName` 同样会让整条记录消失，本次不引入第二种处置风格；(2) 目录违反命名契约本身就是「写方不是合规 Bridge」的证据，静默修补会把这个信号吃掉。**代价已知并如实记录**：将来某插件若发布一个大写工具名，它会整个从冷启动发现中消失，症状是「Bridge 已发布但从未被健康检查」——已在 `plugin-integration.md` 的 Common failures 表里加了这一行排查线索。另注意 live `GET /tools` 路径**不做**同样校验，所以这层校验是数据卫生而非安全边界，不应被当成后者依赖。

**`timingSafeEqualToken('', '')` 返回 `false` 是任务书之外的一处加固（如实记录）。** `crypto.timingSafeEqual` 对两个零长 Buffer 返回 `true`，纯粹的比较原语理应照搬。但本函数的存在意义正是「给插件作者一个不会用错的实现」，而空 token 在本协议里永远非法（`createBridgeToken()` 恒产出 43 字符），若照搬则「Bridge 生成 token 失败 → token 为 `''` → 攻击者送一个空头即通过」会变成一条静默的开放路径。故 `left.length === 0` 直接返回 `false`，理由已写进函数 JSDoc 与 v1.md §10 的要点列表，并有专门用例锁定。

**`main.ts:13` 的遗留项已由 2-D 就地解决，本任务无需转交。** 任务书要求点名「`src/hub/main.ts:13` 直接用 `process.env[AT_SERIES_HOST_APP_ENV] ?? 'unknown'` 而不经 `slugifyHostAppId`」并交由 2-D。实际情况是 2-D 在并行工作中已独立发现并修复（新增 `src/hub/hostApp.ts` + `test/hub.hostApp.test.ts`，`main.ts` 改为调用），见上一条 P2-D。两者方向一致：C2 在**路径 API 入口**拒绝非法段，2-D 在**env 读取处**先规范化，因此正常路径下 Hub 不会再把非法 `hostApp` 送进 `bridgesDirForHostApp`。**残留风险已归零**：即便有人手改 IDE MCP 配置写入 `AT_SERIES_HOST_APP=..`，slugify 会先把它变成 `unknown`；退一万步若 slugify 被绕过，`bridgesDirForHostApp` 抛的错也已被 P1-B 在 `src/hub/server.ts` 加的 try/catch 兜住，Hub 降级为空目录而非崩溃。

**并发协作说明：与 2-D 发生一次 git index 竞态，由本任务造成，已完成修复；上一条 P2-D 的相关结论需以本段为准。** 事实经过：本任务 C3 的 `git commit` **未带 pathspec**，于是把当时索引里 2-D 已 `git add` 但尚未 commit 的四个文件（`docs/protocol/v1.md`、`src/hub/main.ts`、`src/hub/hostApp.ts`、`test/hub.hostApp.test.ts`）一并写进了 `755e18f`——2-D 随后的 `git commit` 报 `no changes added to commit`，并据此在台账里记下「刻意不做历史改写，净效果是分支内容完全正确」。本任务发现后判断「让他人的改动挂在我的提交信息下」不可接受，遂做了**带 HEAD 守卫**的 `git reset --mixed HEAD~1`（先 `git rev-parse HEAD` 断言仍等于 `755e18f`，不等则中止，以免误删他人在此期间的新提交），随后用 pathspec 重提本任务的 4 个文件为 `16b4250`。`reset --mixed` 只动 HEAD 与索引、**不动工作区**，2-D 的四个文件因此完好地退回工作区。**但这使 2-D 台账里「内容已在 `755e18f`」的结论失效**，故本任务代为提交 `2e546a4` 承载其三个源文件，提交信息中注明作者归属；提交前用 `git hash-object` 逐一比对，三个文件与 `755e18f` 中的 blob **哈希完全相同**，未做任何内容改动。`docs/protocol/v1.md` 因两人改动交织在同一区域（2-D 的 §4.1 Hub 侧 slugify 段落紧邻本任务的 §4.1 Charset 段落，git 已合并为同一 hunk）**无法分离暂存**，故随本任务的 `9f7388a` 一并提交，该情况已写入 `9f7388a` 的 commit body。**净效果：分支内容完整无缺，D2 的三个源文件与 D1 一样各有独立提交，仅 v1.md 的一段落在本任务的 docs 提交里。** 与 2-A（`src/publisher/**`、`src/fs/**`）全程零文件重叠，未遇 `index.lock` 争用。

**教训（写给后续并行任务，比 2-D 记的那条更强）：** 把 `git add` 与 `git commit` 合并成一条 `&&` 命令**并不足以**消除竞态——真正的根因是 `git commit` 默认提交**整个索引**，而索引是同分支所有 subagent 共享的可变状态。正确做法是**给 `git commit` 也带上 pathspec**（`git commit -m … -- <明确路径>`），这样无论索引里此刻还躺着谁的东西，落地的都只有本任务的文件。本任务 C1/C2 侥幸未出事，只因那两次提交时对方恰好没有暂存内容；C3 出事才暴露出来，此后三次提交（`16b4250` / `2e546a4` / `9f7388a`）全部改用了 pathspec 形式。

### 2026-08-13 · P0-T4b · 补做 P0-T4 遗漏的 p0c e2e 测试标题乱码清理

| 字段 | 内容 |
|---|---|
| 仓库 | at-jumpserver-series |
| 动机 | **J11 的收尾**。本条被重新派发时任务书描述的前提已过期：4 个类型错误（TS2741 `:38`、TS2339 `:101`/`:102`/`:120`）**已由 `955046d` 修复并提交**，复跑 `npm run typecheck` 退出码 0、零诊断。但任务书的「顺带处理」项——把 `it(...)` 标题里的乱码字节改成正常可读文本——**P0-T4 并未执行**：`955046d` 把乱码原样提交了进去，只是从残缺 UTF-8 变成了 U+FFFD。本条只补做这一件事 |
| 代码 diff | `test/mcp/p0c.functional.e2e.test.ts:31` **+1/-1**（单行、纯字符串字面量）：`it('runs Bridge <FFFD>?registry <FFFD>?…')` → `it('runs Bridge -> registry -> health/tools/invoke -> confirm cancel -> installer -> hub sync -> dispose')`，7 处 `<FFFD>?` 全部还原为 ASCII `->`。未触碰任何断言、fixture、类型标注或生产代码 |
| 契约影响 | 否。未触及 AGENTS.md §2.1 的任何一项，改动是一个测试用例的名字 |
| 文档 diff | 无 |
| protocolVersion | 不变（Bridge 1 / Hub 2） |
| 插件需跟改 | 否 |
| 核心不变量 | 已核对 **INV-1..INV-6 均未涉及**：改动范围为单个测试文件的一个字符串字面量，`src/**` 零改动，未触及 MCP 配置入口与 `hub.js` 单条 server（INV-1/INV-2）、Hub 工具 registry 与 `GET /tools`（INV-3）、`AT_SERIES_TOOL_DISCOVERY` 与渐进发现阈值（INV-4/INV-5）、五个元工具的暴露与 risk 分级（INV-6） |
| 验证 | **typecheck：** `npm run typecheck` 退出码 **0、零诊断输出**（改动前后各跑一次，均为 0——本条不修类型，这一步是回归保护）。**测试（沙箱内）：** `35 文件 / 225 用例`，4 失败全部为 `EPERM: operation not permitted, mkdir '/var/folders/.../.cursor'`，与 P0-T3a / P0-T4 / P2-C 记录的同源沙箱限制。**测试（沙箱外，真实结果）：** `Test Files 35 passed (35)`、`Tests 225 passed (225)`，EPERM 全部消失。**目标文件单独复跑：** `npx vitest run test/mcp/p0c.functional.e2e.test.ts --reporter=verbose` 得 `✓ … > runs Bridge -> registry -> health/tools/invoke -> confirm cancel -> installer -> hub sync -> dispose 29ms`，`1 passed (1)`——vitest 打印出的名字即为修复后的文本，是本条改动生效的直接证据。**编码残留：** `rg $'\uFFFD' <file>` **零匹配**；`hexdump` 确认第 31 行已无 `ef bf bd`，行尾 `0d 0a` 保持不变（工作区 CRLF / 索引 LF，`.gitattributes` 按 P0-T1 归一，无换行符 churn）。**类型纪律：** `rg -o '\bany\b' src/ \| wc -l` 仍为 **14**，仍只分布在 `JumpServerSession.ts` / `JumpServerClient.ts` / `JumpServerSftpSession.ts` 三个 JumpServer API 响应边界文件，未新增。**提交范围：** `git show --stat HEAD` 为 `1 file changed, 1 insertion(+), 1 deletion(-)`；提交后 `package.json` / `package-lock.json` 仍为未暂存的 ` M`，未被夹带 |
| 提交 | at-jumpserver-series `883c9ba`（分支 `chore/at-series-optimization-phase0`，未推送远程） |

**归属判断结论（独立复核，与 P0-T4 一致）：4 个类型错误全部是历史遗留，与「OPTIMIZE-P1 输出体积控制」工作流无关。** 本次不引用 P0-T4 的结论，而是重新取证：`git log --diff-filter=A` 确认文件由 `260236a`（`test: add P0c functional e2e smoke for bridge hub installer flow`）引入；`git show 260236a:test/mcp/p0c.functional.e2e.test.ts` 在引入版本里即可见 `:46` 的 `protocolNames: ['ssh'],` 前后**没有 `zoneName`**（TS2741 的成因）、`:208` 的 `json: (await res.json()) as never`（3 个 TS2339 的成因）。两个缺陷都写在文件的第一版里，不是任何后续工作流改动类型定义所致。**佐证类型定义方向也没变过：** `zoneName` 至今仍是 `src/config/schema.ts:28` 的 `z.string().optional().default('')`——`.optional().default()` 的 **输入**可省略但 **输出**类型是 `string`，而 `CachedJumpServerAsset` 取的是输出类型，故 fixture 必须显式给值。是 fixture 从第一天起就漏字段，不是类型后来收紧。

**为什么乱码在 `955046d` 里「看起来改了」却没被修好。** 该行自 `260236a` 起存的就是残缺字节 `e2 86 3f`——`→`（U+2192 = `e2 86 92`）的前两字节加一个杂散 `?`，本身不是合法 UTF-8。`955046d` 之前有工具把文件重存为合法 UTF-8，把每个非法的 `e2 86` 替换成了 U+FFFD，于是字节从 `e2 86 3f` 变成 `ef bf bd 3f`。`git diff` 因此显示该行有改动，P0-T4 也在台账里如实记了这次字节变化并用它做归属论证，但**只是把变化后的乱码提交了进去，没有还原成可读文本**。本条改用 ASCII `->` 而非补回 U+2192，是为了让这个名字不再依赖 UTF-8 往返的正确性。这一行并非纯装饰：该文件只有一个用例，vitest 输出里这个标题是它唯一的自述。

**P0-T4 记录的两个遗留项现状（一条已闭合，一条为本条本身）。** P0-T4 的「顺带发现」称 `test/docs/JumpServerMcpDocs.test.ts` 未跟踪且有 2 条文案漂移断言失败，需另行裁决——现已闭合：该文件已被跟踪（`git ls-files test/docs/` 有输出），漂移由 `bc19450`（`fix(docs): point the Continue sample config at the AT Series hub`）解决，本次沙箱外复跑该文件 `✓ 4 tests`。另一项即标题乱码，由本条完成。**至此 jumpserver 在阶段 0 的 J11 无剩余项。**

**一处刻意未动（如实记录）。** `955046d` 给 fixture 填的是 `zoneName: 'default'`，而同一 fixture 的 `nodePath: ['Default']`；生产侧 `normalizeJumpServerAsset` 的算法是 `zoneName: zoneName || nodePath.at(-1) || ''`，即一个没有显式 zone 的真实资产在此 nodePath 下会得到 **`'Default'`**（大写 D）。故 `'default'` 与本 fixture 的 `nodePath` 严格说不自洽。未改动的理由：该值不参与本测试的任何断言（`listCachedAssets` 返回空数组，断言只覆盖 15 个工具名、`USER_CANCELLED` 与 installer 行为），`'default'` 作为「zone 恰好就叫 default 的资产」也完全合法，为此改动一个已提交且通过的 fixture 属无收益 churn。记录在此以备将来有人以该 fixture 为样板推断 `zoneName` 与 `nodePath` 的关系。

