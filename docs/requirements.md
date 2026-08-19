# AT Series MCP Hub — 需求说明（grill 收敛版）

**Status:** Accepted (product + architecture requirements)  
**Date:** 2026-07-23（2026-07-27 grill 补充修订）  
**Source:** grill-me 决策会话 + 现有 AT Terminal / JumpServer 代码现状  
**Normative protocols:** [protocol/v1.md](./protocol/v1.md) (Bridge wire) and [protocol/v2.md](./protocol/v2.md) (Hub progressive exposure)
**Integration guide:** [guides/plugin-integration.md](./guides/plugin-integration.md)  
**ADR:** [decisions/ADR-001-at-series-mcp-hub.md](./decisions/ADR-001-at-series-mcp-hub.md)  
**Agent guide:** [../AGENTS.md](../AGENTS.md)

本文档记录**已拍板的需求与边界**，供实现与验收时反复核对。  
接口字段级细节以 `protocol/v1.md`（Bridge wire）和 `protocol/v2.md`（Hub exposure）为准；本文偏「要什么 / 不要什么 / 为什么」。

---

## 1. 背景与问题

### 1.1 现状

AT 系列插件（当前已知：`ssh-plugins` / AT Terminal，`jumpserver-plugins` / AT JumpServer Terminal）各自：

- 在扩展宿主内启动 localhost **Bridge**
- 附带独立 **stdio MCP server**（如 `dist/mcp-server.js`）
- 通过安装器写入 IDE MCP 配置中的**独立 server 条目**
- （MCP 变体）还注册 `languageModelTools`

工具能力实际依赖扩展宿主内的凭据、确认框、终端/SFTP 状态；MCP 进程只是薄壳。

### 1.2 痛点

1. 安装多个 AT 插件 → 启动多个 MCP 进程  
2. 每装一个新插件 → 用户/安装器又要改一次 IDE MCP 配置  
3. 扩展升级后版本化安装路径变化 → MCP 配置指向失效（已有真实故障）  
4. 多窗口 / 多 IDE 下 discovery 容易串台（已有真实故障）

### 1.3 目标（Outcome）

- 用户侧：**永远只配置、只启动一个 MCP：`AT Series`**
- 插件侧：新插件只需**向 Hub 注册** Bridge + 工具，不必再改 MCP 配置模型
- 安全侧：凭据与确认仍在各插件扩展宿主内（不回退 ADR-002 安全边界）

---

## 2. 用户与场景

### 2.1 主用户

- 在 Cursor / Kiro / VS Code / Qoder 等环境使用 Agent 的工程师
- 可能只装一个 AT 插件，也可能同时装多个
- 可能同时开多个 IDE / 多个窗口

### 2.2 关键场景

| ID | 场景 | 期望 |
|----|------|------|
| S1 | 只装 AT Terminal MCP | 配置 `AT Series` 后可用 SSH/SFTP 工具 |
| S2 | 再装 JumpServer | **无需新 MCP server 条目**；工具列表自动出现 `jumpserver_*` |
| S3 | 只装 JumpServer | 仍能独立维护/贡献 Hub，可用 JumpServer 工具 |
| S4 | 只想要 UI、不要 Agent（AT Terminal base） | 可不碰 MCP / Hub |
| S5 | 多窗口同一插件 | 工具名不重复；调用按健康/已连接目标智能选路 |
| S6 | 多 IDE 同时开 | 默认不跨 IDE 串终端/上下文 |
| S7 | 插件禁用/窗口关闭 | 对应工具从 list 消失；不误删 Hub 与其它插件 |
| S8 | 扩展升级 | IDE 仍指向稳定 `~/.at-series/mcp/hub.js`，不因 VSIX 路径失效 |
| S9 | 新做第三个 AT 插件 | 按协议注册即可，不改 Hub 业务代码、不改 MCP 配置模型 |

---

## 3. 已拍板决策一览

实现时以本表为「需求真源」；若与代码冲突，先改代码或显式修订本文档。

| # | 决策点 | 结论 |
|---|--------|------|
| D1 | Hub 归属 | **能力插件内嵌共享 Hub 运行时**（非强制用户先装独立 Hub 扩展） |
| D2 | 稳定入口路径 | `~/.at-series/mcp/hub.js`（薄启动器/同步产物）；禁止长期依赖扩展版本目录 |
| D3 | 工具发现 | **多插件 Bridge 注册表 + 动态聚合** |
| D4 | 工具列表 | **仅在线且健康的插件工具出现在 `tools/list`** |
| D5 | 命名 v1 | 保持现名（AT 短名 + `jumpserver_*`）；冲突则失败/可诊断 |
| D6 | 命名 v2 | 先双名兼容，再收到统一前缀 |
| D7 | 多窗口路由 | 按 `pluginId` 折叠同名工具；同插件多 Bridge 智能选路 |
| D8 | 诊断工具 | v1 必做 `at_list_providers` |
| D9 | IDE 配置 | 唯一条目名 **`AT Series`**；主动迁移旧本系列条目 |
| D10 | Hub 版本 | **高 semver 覆盖，禁止降级**；同 semver 仅当 `bundleSha256` 不同才覆盖；结合 protocolVersion |
| D11 | 协议版本字段 | v1 起 registry/health/tools **显式 `protocolVersion`** |
| D12 | 动态刷新 | 以 registry watch + health + **`tools/list_changed`** 为主；每次 list 全量重扫保底 |
| D13 | LM Tools | **删除 `languageModelTools`**，只保留 MCP 工具面 |
| D14 | AT Terminal 变体 | 继续 base / mcp 双变体；base 不贡献 MCP；mcp 贡献 Hub |
| D15 | 单装 JumpServer | **允许** JumpServer 独立维护 AT Series Hub |
| D16 | 代码分发 | 独立项目 **单一 npm 包 `@at-series/mcp-hub`**：npm 发版 → 插件依赖并构建打进 VSIX → 运行时同步到 `~/.at-series` |
| D17 | Bridge API | 统一 **`GET /health`、`GET /tools`、`POST /invoke`** |
| D18 | 旧 per-plugin MCP | **删除产品入口**，只留 AT Series Hub；配置一并迁移 |
| D19 | 风险模型 | 三级 **`read` / `write` / `exec`**，由**插件注册时声明** |
| D20 | autoApprove | 默认 **仅 Hub 五个元工具**（`at_list_providers` / `at_search_tools` / `at_get_tool` / `at_select_tools` / `at_clear_tool_selection`）。**不**把 Bridge 业务工具（含 `risk=read`）写入 autoApprove |
| D21 | 目录 | 统一 `~/.at-series/`（mcp + bridges + logs） |
| D22 | 卸载默认行为 | deactivate **只删自己的 bridge**；不删 hub.js / 不删 MCP 配置 |
| D23 | 显式清理 | 提供 Repair / Uninstall MCP Config 命令 |
| D24 | IDE 隔离 | 按 **`hostApp`** 隔离；MCP env：`AT_SERIES_HOST_APP`；探测用 `detectHostApp`（路径派生，禁止未识别 IDE 共用 `unknown`） |
| D25 | 无 hostApp 老数据 | v1 **忽略** |
| D26 | 包边界 v1 | **单一包**：协议 + 注册表 + Hub 运行时 + publisher helper + **MCP config installer helper**；**不含**业务与通用 Bridge HTTP 框架（插件各自实现 Bridge） |
| D27 | 安全基线 | 127.0.0.1、高熵 token、权限收紧、不落 token 日志；v1 不做轮转/签名 |
| D28 | Skill | 本仓维护 **单一系列 skill**（`super-ops` / SuperOps）；旧插件 skill 删除或改指向本仓 |
| D29 | Installer 目标 IDE | v1：**Cursor + Kiro + Continue**；其它 hostApp 先保证探测/env，写入按需扩展 |
| D30 | exec/write 确认 | 迁 Hub 时，所有 `risk=write\|exec` 工具 **必须**有插件内确认（或等价授权） |
| D31 | Agent 指导文档 | 仓库根目录 **`AGENTS.md`**：指导本仓实现，并含两插件迁移检查清单 |
| D32 | Hub v2 工具发现 | **渐进混合**：discover → select → first-class tool；2026-07-31 Accepted。不是永久仅元工具表面 |

---

## 4. 功能需求

### 4.1 Hub（stdio MCP）

| ID | 需求 | 优先级 |
|----|------|--------|
| H1 | 以 stdio MCP 形式运行，供 IDE/Agent 连接 | P0 |
| H2 | 对外显示名 / 配置名：`AT Series` | P0 |
| H3 | 从 `~/.at-series/bridges/<hostApp>/` 发现 Bridge | P0 |
| H4 | 仅聚合 `hostApp == AT_SERIES_HOST_APP` 的记录 | P0 |
| H5 | 忽略缺少 hostApp 的记录 | P0 |
| H6 | 健康检查失败的 Bridge 不贡献工具 | P0 |
| H7 | `tools/list` 动态反映当前在线工具 | P0 |
| H8 | 工具上下线时发送 `tools/list_changed` | P0 |
| H9 | `tools/list` 路径具备全量一致性重算保底 | P0 |
| H10 | `tools/call` 路由到对应插件 Bridge 的 `/invoke` | P0 |
| H11 | 同 `pluginId` 多 Bridge 折叠工具并智能选路 | P0 |
| H12 | 跨 `pluginId` 工具名冲突可诊断，list 中只保留胜者 | P0 |
| H13 | 内置五个元工具（只读；installer autoApprove 仅这五个） | P0 |
| H14 | 不持有业务凭据，不实现 SSH/JumpServer 业务 | P0 |
| H15 | 支持 registry 目录 watch；无原生 watch 时轮询兜底 | P1 |
| H16 | Hub v2 在大目录下支持 discover → select → first-class 工具暴露；可通过 `AT_SERIES_TOOL_DISCOVERY=off` 回退全量 list | P0 |

### 4.2 Bridge（各插件）

| ID | 需求 | 优先级 |
|----|------|--------|
| B1 | 监听 `127.0.0.1` 随机端口 | P0 |
| B2 | 实现 `GET /health`、`GET /tools`、`POST /invoke` | P0 |
| B3 | 使用 token 鉴权（主头：`x-at-series-token`） | P0 |
| B4 | 工具执行走插件内服务（确认框/信任边界保留） | P0 |
| B5 | 每个工具声明 `risk` | P0 |
| B6 | 发布/心跳/删除 registry 文件 | P0 |
| B7 | deactivate 时 unpublish 自己的 bridge 记录 | P0 |
| B8 | 统一错误体 `{ error: { code, message, details? } }` | P0 |
| B9 | body 大小上限 2MiB | P1 |
| B10 | 兼容期内可接受旧 token 头 | P2 |

### 4.3 插件打包与 Hub 同步

| ID | 需求 | 优先级 |
|----|------|--------|
| P1 | MCP 能力构建将 hub bundle 打进 VSIX | P0 |
| P2 | activate 时按 semver 竞选同步到 `~/.at-series/mcp/hub.js` | P0 |
| P3 | 低版本不得覆盖高版本 Hub | P0 |
| P4 | AT Terminal base 变体不贡献 MCP/Hub | P0 |
| P5 | JumpServer（及任意单包 MCP 插件）可独立贡献 Hub | P0 |
| P6 | 写出 `hub-version.json` 元数据 | P1 |

### 4.4 IDE MCP 配置

| ID | 需求 | 优先级 |
|----|------|--------|
| C1 | 安装/修复只写入 **一个** server：`AT Series` | P0 |
| C2 | args 指向稳定 hub 路径，而不是扩展版本目录 | P0 |
| C3 | env 写入 `AT_SERIES_HOST_APP` 及渐进发现/选择键；installer 将 `AT_SERIES_TOOL_SELECTION_IDLE_MS` 写成 `0`（覆盖 Hub 运行时默认 30s） | P0 |
| C4 | 迁移/清理旧 `AT Terminal` / `AT JumpServer Terminal` 等本系列条目 | P0 |
| C5 | 不删除用户第三方 MCP 服务器 | P0 |
| C6 | autoApprove 默认仅五个 Hub 元工具；忽略 `registryTools` / 业务 `risk=read` | P0 |
| C7 | 安装操作幂等 | P0 |
| C8 | 提供显式 Uninstall AT Series MCP Config | P1 |
| C9 | 提供显式 Repair Hub / Config | P1 |
| C10 | 上述写配置逻辑以本仓 **installer helper** 为共享实现；插件只调用 + 挂命令 | P0 |
| C11 | v1 helper 覆盖 Cursor、Kiro、Continue | P0 |

### 4.5 产品表面收敛

| ID | 需求 | 优先级 |
|----|------|--------|
| U1 | 删除 `languageModelTools` 作为工具暴露面 | P0 |
| U2 | 删除各插件独立 stdio MCP 作为产品主入口 | P0 |
| U3 | 文档/Skill 以 AT Series 为唯一 MCP 入口说明 | P0 |
| U4 | 本仓维护 **单一** 系列 skill（`super-ops` / SuperOps）；含各插件工具附录与运维规范 | P1 |

### 4.6 插件侧确认（迁入约束）

| ID | 需求 | 优先级 |
|----|------|--------|
| A1 | 每个 `risk=write` / `risk=exec` 工具在扩展宿主内有确认或等价授权 | P0 |
| A2 | JumpServer 现状中无确认的 `jumpserver_send_terminal_input` / `jumpserver_mysql_send_input` 迁 Hub 时必须补齐 | P0 |

---

## 5. 非功能需求

### 5.1 安全

- Bridge 仅绑定回环地址  
- token 高熵、不进日志、诊断输出打码  
- 目录/文件权限尽可能收紧  
- 工具结果禁止返回密码/私钥/SecretStorage 原文  
- write/exec 的最终授权在插件内，不因客户端 autoApprove 被架空  
- 迁 Hub 时：**凡声明 `risk=write|exec` 的工具必须有插件内确认（或等价授权）**；不得只靠「未列入 autoApprove」作为唯一防护

### 5.2 兼容与迁移

- v1 不读取旧 `~/.at-terminal` / `~/.at-jumpserver-terminal` 作为 Hub 主路径  
- 旧 MCP 配置条目由安装器迁移到 `AT Series`  
- 工具命名 v1 兼容现网；v2 再做双名→统一前缀  

### 5.3 可演进

- 新插件零改 Hub 业务：只要遵守 protocol v1  
- 协议破坏性变更必须升高 `protocolVersion`  
- 可选字段可加；不得静默改变已有字段语义  

### 5.4 可运维 / 可诊断

- `at_list_providers` 展示 plugin/bridge 健康、冲突、（如适用）hubTooOld  
- 明确错误：无 Bridge、目标不在线、用户取消、校验失败  
- Hub 将业务 `tools/call`（不含元工具）写入 `~/.at-series/logs/<hostApp>/` JSONL，供本机排障；不解析命令/SQL 以区分查询与修改  

---

## 6. 明确不做（v1 Non-goals）

1. 强制用户安装独立 Hub 扩展作为唯一分发形态  
2. 把凭据/确认 UI 搬进 Hub 进程  
3. 默认跨 IDE 调用对方窗口里的终端  
4. Hub 内写死各插件业务工具清单  
5. 仅靠元工具作为永久唯一能力表面（v2 元工具只用于发现与选择，选中工具仍须作为 first-class MCP tools）
6. v1 全量重命名所有 AT Terminal 工具  
7. token 定期轮转、请求签名、父进程绑定  
8. 保留 `languageModelTools` 双轨  
9. deactivate 时自动删除 hub.js、MCP 配置与 logs（避免误伤）  
10. 在 Hub 内解析命令或 SQL 以区分查询与修改  

---

## 7. 现状约束（实现时不要违背）

来自现有代码/ADR，仍然有效：

1. **双进程模型**：扩展宿主 Bridge + 外部 MCP 客户端进程  
2. **Agent 执行权威**在 `AgentToolService` / JumpServer 对等服务，不在 MCP 薄壳  
3. AT Terminal 已有多 bridge 注册与 connectedTerminals 优选经验，应演进而非推倒  
4. JumpServer 工具面更宽（含 MySQL、更多 SFTP 变更操作），risk 标注必须认真  
5. Windows 为主使用环境；路径与权限策略需在 Windows 可落地  

---

## 8. 验收标准（Definition of Done 方向）

实现可按下列条目做手工/自动验收：

1. 新装/修复后，IDE MCP 配置中本系列只剩 **`AT Series` 一条**  
2. 仅启动 Hub、未开任何 AT 插件时，list 基本只有 `at_list_providers`（或等价空 providers）  
3. 打开 AT Terminal MCP 窗口后，SSH/SFTP 工具出现；关闭/禁用后消失  
4. 再启用 JumpServer 后，无需改 MCP 配置即可出现 `jumpserver_*`  
5. Cursor 与 Kiro 同时运行时，各自 Agent 默认只看到本 IDE 的 Bridge  
6. 扩展升级后，MCP 仍能启动（路径仍是 `~/.at-series/mcp/hub.js`）  
7. 旧版本插件 activate 不会把新 Hub 降级覆盖  
8. 业务工具（含 `risk=read`）默认不在 autoApprove；`run_*` / 写文件 / SQL 等 exec|write 须插件内确认仍在  
9. 仓库中不再将 `languageModelTools` 与 per-plugin mcp-server 作为推荐入口  
10. 新示例插件仅通过协议注册即可被聚合（可用 fixture/假 Bridge 测）  

---

## 9. 实现分期建议（非绑定，供排期）

| Phase | 内容 |
|-------|------|
| P0a | `@at-series/mcp-hub`：protocol、registry、hub runtime、publisher、**config installer helper**、基础测试 |
| P0b | AT Terminal MCP 变体：Bridge 改 invoke、删 lm tools、配置迁移、hub 同步 |
| P0c | JumpServer：同上接入 |
| P1 | list_changed 打磨、Repair/Uninstall 命令、skill 迁入 |
| P2 | 工具命名双名兼容与统一前缀（原 v2 命名计划） |

---

## 10. 文档地图

| 文档 | 用途 |
|------|------|
| **本文件 `requirements.md`** | 需求真源：已拍板决策、范围、验收 |
| `../AGENTS.md` | Agent 实现指导（本仓 + 插件迁移清单） |
| `protocol/v1.md` | Bridge wire 接口/字段/行为规范（实现契约） |
| `protocol/v2.md` | Hub 渐进工具暴露与元工具规范（实现契约） |
| `guides/plugin-integration.md` | 新插件怎么接入（imports 以 `@at-series/mcp-hub` 为准） |
| `decisions/ADR-001-*.md` | 为什么选这套架构 |
| `../README.md` | 仓级概述 + 插件作者 quick start |
| `packages/mcp-hub/README.md` | npm 包公开面摘要 |
| `packages/mcp-hub/src/index.ts` | 包公开 API 入口 |
| `packages/mcp-hub/src/protocol/index.ts` | 类型化契约（由 `@at-series/mcp-hub` 导出） |

修订规则：

- 改需求：先改本文件决策表与对应章节，再改 protocol（若影响接口）  
- 只改接口细节且不改产品意图：改 protocol 即可，并在 PR 说明  
- 实现过程中发现决策不可行：更新本文件并标注变更日期，禁止静默偏离  
- **接口变更硬门禁：** 凡 registry / Bridge HTTP / Hub 行为 / MCP 配置约定 / publisher·installer 对外契约变更，必须在**同一变更集**更新适用的 `protocol/v1.md` 和/或 `protocol/v2.md`（及类型；必要时本文件与 integration guide）。禁止先改服务实现、文档滞后，以免插件按旧文档对接出错（详见 `AGENTS.md` §2.1）

---

## 11. 决策追溯（grill 问答摘要）

### 11.1 首轮（2026-07-23）

1. Hub 归属 → 插件内嵌共享运行时  
2. 稳定路径 → `~/.at-series/mcp/`  
3. 聚合方式 → Bridge 注册表动态聚合；接受动态 list  
4. 命名 → v1 保持；v2 双名→统一前缀  
5. 多窗口 → pluginId 折叠 + 智能选路；v1 做 `at_list_providers`  
6. 配置 → 单条目 `AT Series` + 迁移旧条目  
7. 版本 → 高版本竞选 + protocolVersion  
8. 刷新 → list_changed 为主，list 重扫保底  
9. LM Tools → 删除，仅 MCP  
10. 变体 → 保留 base/mcp；JumpServer 可独立维护 Hub  
11. 工程 → 独立 `@at-series/mcp-hub`，打进 VSIX 再同步  
12. Bridge → health/tools/invoke；删除 per-plugin MCP 入口  
13. 风险 → 插件声明三级；installer autoApprove 仅 Hub 元工具（业务工具不论 risk 都不写入）  
14. 生命周期 → 统一目录；deactivate 保守；显式卸载/修复  
15. 多 IDE → hostApp 隔离；无 hostApp 忽略  
16. 包边界 → 协议/注册表/Hub/publisher；不含业务 Bridge 框架  
17. 安全 → 最小基线  
18. Skill → 迁入 hub 项目  

### 11.2 补充轮（2026-07-27，对照两插件代码后）

1. 包形态 → **单一** npm 包 `@at-series/mcp-hub`（不拆 protocol 独立发版）  
2. 分发 → npm 发版，插件 dependencies 引用  
3. Bridge HTTP → **严格不进本仓**；插件各自实现（抽 Hub 的意义在聚合而非再造框架）  
4. AGENTS 范围 → 本仓为主 + 两插件迁移检查清单  
5. Installer → **本仓提供 helper**（写/修/卸/迁移；autoApprove 仅 Hub 元工具）  
6. Skill → **单一** 系列 skill；旧插件 skill 删除或改指向  
7. Installer IDE → v1：**Cursor + Kiro + Continue**  
8. 同 semver → **仅 `bundleSha256` 不同才覆盖** hub.js  
9. Agent 文档 → 根目录 **`AGENTS.md`**  
10. 文档真源 → grill 结论先回写 requirements/protocol，再写 AGENTS  
11. exec/write → 迁入时 **必须**插件内确认（含 JumpServer 两个 send_input）  

---

## 12. 相关代码锚点（迁移时对照）

### AT Terminal (`ssh-plugins`)

- `src/mcp/server.ts` — 现状 per-plugin MCP 工具注册（待删除为产品入口）  
- `src/mcp/BridgeServer.ts` / `BridgeClient.ts` / `BridgeDiscovery.ts` — 待演进到 series registry + invoke  
- `src/mcp/McpConfigInstaller.ts` — 待改为写入 `AT Series`  
- `src/agent/AgentTools.ts` / `package.mcp.json` languageModelTools — 待移除  
- `docs/decisions/ADR-002-mcp-bridge.md` — 安全边界仍有效  
- `docs/decisions/ADR-004-at-series-mcp-hub.md` — 本需求的仓内指针  

### JumpServer (`jumpserver-plugins`)

- `src/mcp/server.ts`、`BridgeServer.ts`、`McpConfigInstaller.ts` — 同上迁移  
- `docs/decisions/ADR-001-at-series-mcp-hub.md` — 仓内指针  
