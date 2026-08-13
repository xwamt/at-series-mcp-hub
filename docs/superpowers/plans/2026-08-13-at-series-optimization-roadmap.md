# AT 系列优化 · 总纲

> **For agentic workers:** 本文件是**总纲**，不含可执行步骤。执行请打开对应阶段的独立计划文件，并使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans。
> **每个 Task 收尾必须写 [`optimization-change-log.md`](../optimization-change-log.md)，不写 = 未完成。**

**Goal:** 在不改变 `@at-series/mcp-hub` 两项核心价值的前提下，修复全量审计发现的 14 个 P0 与 37 个 P1，并把跨仓重复代码收敛到可维护的共享层。

**Architecture:** 分六个阶段推进。阶段 0 恢复可验证性（构建 / 换行 / CI），阶段 1–2 加固 Hub，阶段 3–4 加固插件的可写面与授权模型，阶段 5 抽共享包，阶段 6 做性能。每个阶段独立产出可运行、可测试的成果，且都以「契约文档同步」为合入门禁。

**Tech Stack:** TypeScript 5.9 / Node ≥18 / vitest 3 / esbuild 0.25 / VS Code Extension API 1.85 / MCP SDK 1.x

---

## 1. 不可变更的核心（INV：Invariants）

`@at-series/mcp-hub` 被抽出来只为两件事。**下列不变量在整个优化过程中不得被削弱**；任何 Task 收尾都必须在台账里声明已核对。

### 核心 A — 减少冗余代码

> 插件不再各自实现 stdio MCP 薄壳；`AT Series` 是 IDE 里唯一的系列 MCP 条目。

| 编号 | 不变量 | 违反的典型形态 |
|---|---|---|
| **INV-1** | IDE 的 MCP 配置中，本系列**只能有一条** `AT Series`，指向 `~/.at-series/mcp/hub.js` | 为了「隔离」给某插件单独加一条 MCP server |
| **INV-2** | 不得恢复 per-plugin `mcp-server.js` 作为产品入口，不得用 `languageModelTools` 暴露同一批工具 | 为绕开 Hub 的某个 bug 而临时给插件加回直连入口 |
| **INV-3** | Hub 内不得写死任何插件的工具清单；工具一律来自 registry 与 `GET /tools` | 为修某个工具的行为在 Hub 里加 `if (pluginId === 'at.terminal')` |

### 核心 B — 按需激活，避免提示词泛滥

> 目录变大时，Hub 不把全部业务工具 schema 塞进每轮上下文；agent 走 discover → select → call。

| 编号 | 不变量 | 违反的典型形态 |
|---|---|---|
| **INV-4** | `AT_SERIES_TOOL_DISCOVERY` 默认值保持 `auto`，阈值默认 `20`；installer 写入的默认值不得改成 `off` | 「用户反馈找不到工具」→ 把默认改成 `off` |
| **INV-5** | 渐进暴露只影响 MCP `tools/list`。**selection 不是 ACL**（v2.md §1），Hub 仍必须能路由任何当前 winner 工具 | 把 selection 改造成权限边界，或让未 select 的工具 `tools/call` 直接拒绝 |
| **INV-6** | 五个 Hub 元工具（`at_list_providers` / `at_search_tools` / `at_get_tool` / `at_select_tools` / `at_clear_tool_selection`）始终暴露、名称保留、`risk: read`、在 installer 的 autoApprove 内 | 为「减少工具数」把元工具也纳入渐进隐藏 |

### 1.1 因 INV 而被撤回的两条审计建议

审计阶段提出过两条建议与既有决策冲突，**本计划予以撤回**，记录在此避免后续重新提起：

| 撤回的建议 | 冲突点 | 本计划的替代方案 |
|---|---|---|
| 把插件共用的 `BridgeServer` 骨架抽成 `@at-series/mcp-bridge` 并**并入本仓** | `AGENTS.md` §3.2 硬禁止「通用 Bridge HTTP 框架…不要抽回本仓」；`requirements.md` D26 划定了包边界 | 抽到**独立包** `@at-series/plugin-kit`（新仓，不进 mcp-hub）。若确实希望并入本仓，必须先按 AGENTS.md §10 走「先更新 requirements D26+」流程，不得静默扩边界。见阶段 5 |
| 为 `risk: exec` 工具增加「必须先 select 才能 call」的严格模式 | 直接违反 **INV-5**；v2.md §1 明确 selection 不是授权边界 | 改为把 `risk` 透传进 MCP `annotations`（纯增量，不改语义），由 IDE 客户端自行决策。见阶段 2 |

---

## 2. 契约同步矩阵（AGENTS.md §2.1 硬门禁的执行表）

`docs/protocol/v1.md`（Bridge wire）与 `v2.md`（Hub exposure）是三个插件对接的规范真源。**下表把每项改动预先映射到必须同步的文档章节**；执行时按此表核对，`契约影响 = 是` 而无文档 diff 的 Task 一律打回。

| 审计编号 | 改动 | 触及 §2.1 的哪一项 | 必须同步的文档 | protocolVersion | 插件需跟改 |
|---|---|---|---|---|---|
| H1 | Hub 出站禁止跟随重定向 | Bridge HTTP 行为 | `v1.md` §7.1 新增「Bridge MUST NOT 返回 3xx；Hub MUST NOT 跟随」；§15 加一致性测试 | 不变（1） | 否（现有 Bridge 均不重定向） |
| H2 | `/tools`、`/invoke` 加超时 | Bridge HTTP 行为 | `v1.md` §7.4/7.5/7.6 写明 Hub 侧超时值与超时后语义 | 不变（1） | 否，但需知悉慢响应会被判 unhealthy |
| — | 落实 `BRIDGE_MAX_BODY_BYTES` 到**响应**方向 | Bridge HTTP body 限制 | `v1.md` §7.1 补「响应体同样受 2 MiB 约束，Hub 超限截断并报 `INTERNAL_ERROR`」 | 不变（1） | 否 |
| H3 | registry 读取异常降级而非崩溃 | 无（Hub 内部健壮性） | 无 | 不变 | 否 |
| H4 | `syncHubBundle` 校验磁盘 `hub.js` 真实 sha256 | publisher / hub sync 对外契约 | `v1.md` §8.6 补「no-op 前必须校验磁盘文件哈希」；`AGENTS.md` §3.3 同步 | 不变 | 否 |
| H5 | 版本选举加文件锁 | publisher / hub sync 对外契约 | `v1.md` §8.6 补并发语义与锁文件路径 | 不变 | 否 |
| H6 + X1 | installer 原子写 + 备份 + 跨进程锁 | MCP 配置约定 | `v1.md` §9 补「写入必须原子、必须先备份、多插件并发安全」 | 不变 | 否 |
| H7 | 校验 registry 的 `port` 与 `endpoints` | registry 字段语义 | `v1.md` §5.2 收紧字段约束并写明拒绝行为 | 不变 | 否（现有取值均合规） |
| H8 | `~/.at-series` 全路径 0700 | registry 路径 / 权限 | `v1.md` §3.2 补父目录权限要求 | 不变 | 否 |
| H9 | 导出 `createBridgeToken` / `timingSafeEqualToken` | publisher helper 对外契约 + 鉴权 | `v1.md` §10 增 API；§7.2 要求常量时间比较；`plugin-integration.md` 示例改用 | 不变 | **是**：三插件改用导出的比较函数 |
| H10 | `bridgeId` / `hostApp` 字符集校验 | registry 字段语义 | `v1.md` §4.1/§4.3 写明正则与拒绝行为 | 不变 | 否（现用 UUID / slug） |
| H11 | `risk` 透传进 MCP `annotations` | Hub 暴露形状 | `v2.md` 新增一节描述 annotations 映射 | 不变（Hub 已是 2） | 否（纯增量） |
| H12 | stderr 结构化日志 | 新增 env `AT_SERIES_LOG_LEVEL` | `v2.md` env 表增行 | 不变 | 否 |
| J4 | JumpServer `connectionKey` 透传 | 无 Hub 契约，但改**工具行为** | 插件仓 `toolCatalog` 的 tool description 必须同步（AGENTS.md §8.3 明确点名此债） | — | 仅 jumpserver |
| G1/G2/G3 | Grafana 可写面收敛 | 无 Hub 契约 | 插件仓 ADR-004 权限模型 + README 的 read-only 表述 | — | 仅 grafana |
| T1/T2/J5 | 授权粒度与命令确认 | 无 Hub 契约 | 各插件 ADR + skill 文档 | — | terminal / jumpserver |

**执行纪律：** 契约类改动一律「先改文档、再改类型、最后改实现」。AGENTS.md §10 把反序列为「硬停」偏航。

---

## 3. 变更台账协议（对应"记住修改了什么"）

三层记忆，缺一不可：

1. **[`optimization-change-log.md`](../optimization-change-log.md)** —— 逐 Task 追加，是本轮优化的完整流水。格式见该文件头部。
2. **`packages/mcp-hub/CHANGELOG.md`** —— 阶段 1 Task 7 创建。凡改动 `@at-series/mcp-hub` 公共 API 或行为的，必须有条目；这份随 npm 包分发，是三个插件作者的对账依据。
3. **契约文档 diff** —— 第 2 节矩阵要求的 `v1.md` / `v2.md` 改动本身就是最权威的记录，且受 git 跟踪。

台账条目里的 `核心不变量` 字段必须列出实际核对过的 INV 编号，不允许写「无影响」了事。

---

## 4. 阶段路线

每个阶段一份独立计划文件。**后续阶段的详细计划在前一阶段验收通过后再写**——提前写会因为前序改动而失效。

| 阶段 | 目标 | 计划文件 | 涉及仓库 | 产出判据 |
|---|---|---|---|---|
| **0** | 恢复可验证性 | [`2026-08-13-phase0-restore-verifiability.md`](2026-08-13-phase0-restore-verifiability.md) | 全部 4 个 | 四仓 `typecheck` + `test` 全绿；CI 能拦回归；`git status` 可读 |
| **1** | Hub 出站与进程健壮性 | [`2026-08-13-phase1-hub-outbound-hardening.md`](2026-08-13-phase1-hub-outbound-hardening.md) | mcp-hub | H1/H2/H3 + body 上限修复；`v1.md` §7 同步；发布 0.3.0 |
| **2** | Hub 完整性、并发与可观测性 | 阶段 1 验收后编写 | mcp-hub | H4/H5/H6/H7/H8/H9/H10/H11/H12 + X1；`v1.md`/`v2.md` 同步；发布 0.4.0 |
| **3** | 插件可写面收敛 | 阶段 2 验收后编写 | grafana / jumpserver | G1/G2/G3/J1/J2/J3/J4 |
| **4** | 重建授权模型 | 阶段 3 验收后编写 | terminal / jumpserver | T1/T2/T4/J5 |
| **5** | 抽取共享包 | 阶段 4 验收后编写 | 新建 `at-series-plugin-kit` + 三插件 | `@at-series/webview-terminal`、`@at-series/vscode-kit` 先行；`plugin-kit` 需先过 D26 边界决策 |
| **6** | 性能与体验 | 阶段 5 验收后编写 | terminal / jumpserver / grafana | T7/T8/T13/J7/J8/G5 + 开启 minify |

### 4.1 为什么是这个顺序

- **0 在最前**：三个插件当前 `tsc --noEmit` 全部失败（`node_modules/@at-series` 是空目录），测试因缺 `@rollup/rollup-darwin-arm64` 跑不起来；`at-terminal-series` 的 158 个文件 diff 里只有 20 个是真实改动。在此状态下改任何东西，既无法 review 也无法验证回归。这一阶段不产出功能价值，但决定后面每一步是否可信。
- **1、2 先于 3、4**：三个插件都依赖 Hub。先把 Hub 改完并发一个版本，插件侧只需升一次依赖；反过来会导致插件被迫升级多次。
- **5 在 4 之后**：抽共享包会大范围移动代码。必须等 CI 能拦回归（阶段 0）、且重复的安全修复已经收敛（阶段 1–4），否则等于把未修的 bug 复制进共享层。
- **6 在最后**：性能项用户可感知但不影响正确性，且多处与阶段 5 的抽包范围重叠（如 `output.ts` 的传输格式），放在抽包后改一次即可。

---

## 5. 全局验收清单

全部阶段完成后，逐条核对：

- [ ] 四仓 `npm run typecheck` 与 `npm test` 在干净检出后均通过
- [ ] 四仓 CI 均能在 PR 上运行 typecheck + test
- [ ] `git status` 在四仓均无 CRLF 噪声
- [ ] AGENTS.md §9 的 9 条原验收项仍全部成立（INV-1..INV-6 的外部表现）
- [ ] 装两个以上 AT 插件时，`~/.cursor/mcp.json` 仍只有一条 `AT Series`，且并发启动不损坏该文件
- [ ] 工具数超过 20 时 `tools/list` 仍走渐进暴露；未 select 的 winner 工具仍可被 `tools/call` 路由
- [ ] `npm audit --omit=dev` 在四仓均无 high 及以上
- [ ] 台账条目数 == 已完成 Task 数，且每条契约类条目都有对应文档 diff
