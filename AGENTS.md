# AGENTS.md — AT Series MCP Hub

本文件指导在本仓库及关联插件迁移中工作的 Agent。  
**需求真源**仍是 `docs/requirements.md`；**接口契约**是 `docs/protocol/v1.md`（Bridge wire）与 `docs/protocol/v2.md`（Hub 渐进暴露）。本文件不覆盖它们，只规定「怎么做、先做什么、禁止做什么」。

关联源码仓（只读对照 / 迁移目标，不在本仓改业务）：

- `C:\Users\alan\Desktop\ssh-plugins` — AT Terminal（`at.terminal`）
- `C:\Users\alan\Desktop\jumpserver-plugins` — AT JumpServer Terminal（`at.jumpserver`）

---

## 1. 一句话目标

把两插件各自的 **stdio MCP 薄壳**抽成 **唯一** 共享入口：`AT Series` → `~/.at-series/mcp/hub.js`；插件只跑 Bridge、向 Hub 注册工具；凭据与确认仍留在扩展宿主。

---

## 2. 文档优先级（冲突时）

1. `docs/requirements.md`（产品决策 / 范围 / 验收）
2. `docs/protocol/v1.md`（Bridge wire 字段与行为契约）
3. `docs/protocol/v2.md`（Hub 渐进工具暴露与元工具契约）
4. `docs/decisions/ADR-001-at-series-mcp-hub.md`（为何如此）
5. **本文件 `AGENTS.md`**（工程约定与迁移清单）
6. `docs/guides/plugin-integration.md`（新插件接入）
7. `packages/*/src` 类型（应与 protocol 同步；漂移时先改文档再改类型）

修订规则：改产品意图 → 先改 requirements；只改接口细节 → 改 protocol；禁止静默偏离已拍板决策。

### 2.1 接口规范同步（硬门禁）

`docs/protocol/v1.md`（Bridge wire）与 `docs/protocol/v2.md`（Hub exposure）是 **所有 AT 系列插件与 MCP 客户端对接的规范真源**。插件作者与迁移 PR 必须以适用文档（及同步的类型导出）为准，不得靠读 Hub 实现猜接口。

**凡触及下列任一变更，必须在同一变更集内完成文档同步，否则视为未完成：**

- registry 字段 / 路径 / 删除语义
- Bridge HTTP：路径、方法、请求/响应体、错误码、鉴权头、body 限制
- Hub 聚合 / 路由 / `at_list_providers` 输出形状
- MCP 配置约定（server 名、env、autoApprove 规则）
- publisher / hub sync / installer helper 的对外契约
- `protocolVersion` 语义或破坏性兼容策略

**同一变更集内必须同时更新：**

1. 适用的 `docs/protocol/v1.md` 和/或 `docs/protocol/v2.md`（规范正文；破坏性变更还须升高相应 `protocolVersion` 并写清迁移）
2. 包内协议类型（`packages/mcp-hub/src/protocol`，由 `@at-series/mcp-hub` 导出）
3. 若影响接入步骤：`docs/guides/plugin-integration.md`
4. 若影响产品范围/验收：`docs/requirements.md`

**禁止：**

- 先改 Hub/helper 实现、后补文档（或根本不补）
- 只改类型/代码注释、不改适用的 protocol 文档
- 让插件继续按旧文档对接已变更的服务接口

失败模式（必须避免）：服务接口已变，插件仍按旧 protocol 文档对接 → 联调失败或静默错误。
PR / 实现声称「接口变更完成」前，Agent 须能指出对应 protocol 文档 diff；无文档 diff 即不合格。

---

## 3. 本仓做什么 / 不做什么

### 3.1 做（单一 npm 包 `@at-series/mcp-hub`）

| 模块 | 职责 |
|------|------|
| protocol | 类型、常量、risk/autoApprove 纯函数（`packages/mcp-hub/src/protocol`，由此包导出） |
| registry / publisher | 读写 `~/.at-series/bridges/<hostApp>/<bridgeId>.json`；heartbeat；unpublish |
| hub runtime | stdio MCP；聚合/渐进暴露 `tools/list`；路由 `tools/call`；发现/选择元工具；watch + `list_changed` |
| hub bundle sync | 选举写入 `~/.at-series/mcp/hub.js` + `hub-version.json` |
| config installer helper | 写/修/卸 **`AT Series`**；迁移旧条目；按 `risk=read` 算 autoApprove |

**分发：** npm 发版 → 插件 `dependencies` → 构建把 hub bundle 打进 VSIX → activate 时 sync 到 `~/.at-series`。

### 3.2 不做（硬禁止）

- **通用 Bridge HTTP 框架**（鉴权路由骨架可在插件内自建；不要抽回本仓）
- SSH / JumpServer / SFTP / MySQL **业务逻辑**与凭据
- 把确认 UI 搬进 Hub 进程
- 在 Hub 内写死各插件工具清单
- 保留 per-plugin `mcp-server.js` 或 `languageModelTools` 作为产品面
- 默认跨 `hostApp` 路由
- 低 semver 覆盖高版本 `hub.js`

### 3.3 Hub 版本选举（实现必须钉死）

- semver **更高** → 覆盖
- semver **相同** 且 `bundleSha256` **不同** → 覆盖（同版本热修）
- semver 相同且 hash 相同 → no-op
- semver **更低** → 禁止覆盖

---

## 4. 仓库布局

单一包布局（`packages/mcp-hub` = `@at-series/mcp-hub`；边界不能破）：

```text
at-series-mcp-hub/
  AGENTS.md
  README.md
  docs/
    requirements.md
    protocol/v1.md
    protocol/v2.md
    guides/plugin-integration.md
    decisions/ADR-001-*.md
  packages/mcp-hub/          # @at-series/mcp-hub
    src/
      protocol/              # v1 typed contracts
      registry/
      publisher/
      hub/                   # stdio MCP runtime
      installer/             # Cursor / Kiro / Continue
      index.ts
    test/
  skills/at-series-mcp/      # 唯一系列 skill（P1）
```

约束：

- **无 `vscode` 运行时依赖**（installer/publisher 用 Node `fs`/`os`；`hostApp` 由插件传入）
- Hub 入口可被打包为单文件 `hub.js`（CJS，供 `node hub.js`）
- Windows 为主要验证环境

---

## 5. 实现顺序（本仓优先）

按 `requirements.md` §9，默认顺序：

| Phase | 内容 | 完成判据（摘要） |
|-------|------|------------------|
| **P0a** | protocol + registry + publisher + hub runtime + installer helper + 测试 | protocol §15 一致性测试通过；fixture Bridge 可被聚合 |
| **P0b** | 在 `ssh-plugins` 接入（不在本仓写业务） | AT Terminal MCP 只贡献 Hub；旧 MCP/LM 入口删除 |
| **P0c** | 在 `jumpserver-plugins` 接入 | 同上；补齐 exec 确认 |
| **P1** | `list_changed` 打磨、Repair/Uninstall、系列 skill | 文档与命令齐备 |
| **P2** | 工具命名双名 → 统一前缀 | 另开需求，不混进 v1 |

未完成 P0a 前，不要在插件仓「先手写一套半兼容 Hub」。插件 PR 应依赖已发布（或 `file:`）的本包版本。

**V2a 渐进 list 无需插件代码改动：** Bridge 仍完整发布 `GET /tools` 与 registry `tools`（wire `protocolVersion: 1`）；Hub 独自控制 discover → select → first-class exposure。

---

## 6. 编码与测试约定

1. **契约先行 + 文档同步：** 改行为先对照并更新适用的 `docs/protocol/v1.md` / `docs/protocol/v2.md`（见 §2.1 硬门禁）；类型与指南同变更集更新；无 protocol diff 不得合入接口变更。
2. **错误体：** Bridge/Hub 对外错误用 `{ error: { code, message, details? } }`；不要退回旧的 `{ error: string }`。
3. **鉴权：** Hub→Bridge 只发 `x-at-series-token`；插件 Bridge 迁移期可兼收旧头。产品侧信任/确认策略留在插件，不上收 Hub。
4. **安全：** 不落 token 明文日志；`at_list_providers` 打码；工具结果禁止密码/私钥。
5. **测试最少集（本仓）：**  
   - 两插件工具并集聚合  
   - 同 `pluginId` 多 Bridge 折叠 + 选路  
   - 跨 `pluginId` 工具名冲突  
   - 错误 `hostApp` / 缺 `hostApp` 忽略  
   - registry 删除 → 工具消失（+ list_changed）  
   - hub 低版本不能覆盖  
   - 同版本不同 hash 可覆盖  
   - installer autoApprove 仅 read + `at_list_providers`  
   - 旧 server 名迁移且不删第三方 MCP  
6. **不要**为「方便」在 Hub 内特殊对待 `at.terminal` / `at.jumpserver` 业务字段。

---

## 7. 目标架构（对照现状）

```text
现状:
  IDE MCP → dist/mcp-server.js (per plugin)
           → BridgeClient → ~/.at-*/… discovery
           → POST /tools/<name> → AgentToolService

目标:
  IDE MCP → ~/.at-series/mcp/hub.js  (唯一 "AT Series")
           → ~/.at-series/bridges/<hostApp>/*.json
           → GET /health | GET /tools | POST /invoke
           → 各插件 AgentToolService（确认/凭据仍在此）
```

| 现状锚点 | AT Terminal | JumpServer |
|----------|-------------|------------|
| Discovery | `~/.at-terminal/mcp-bridges/`（多桥） | 单文件 `~/.at-jumpserver-terminal/mcp-bridge.json` |
| Auth | `x-at-terminal-token` | `x-at-jumpserver-terminal-token` |
| API | `/tools/<name>` | 同左 |
| MCP 名 | `AT Terminal` | `AT JumpServer Terminal` |
| 工具 | 9 个短名 | 15 个 `jumpserver_*` |
| LM Tools | 有 | 有 |
| autoApprove | 当前常把工具全放进 | 仅部分 read |

Hub v1 **不读**旧 `~/.at-terminal` / `~/.at-jumpserver-terminal` 路径。

---

## 8. 插件迁移检查清单

插件仓改造在各自仓库进行；本清单是跨仓验收真源。  
共用：`pluginId` 稳定、`hostApp` 探测、依赖 `@at-series/mcp-hub`、activate 时 `syncHubBundle` + `publish`、deactivate 时 `unpublish`（不删 hub.js / 不卸 MCP 配置）。

### 8.1 共用必做

- [ ] Bridge：`127.0.0.1` + `GET /health` + `GET /tools` + `POST /invoke`
- [ ] 主鉴权头 `x-at-series-token`；错误体结构化；建议 2MiB body 上限
- [ ] Registry：`~/.at-series/bridges/<hostApp>/<bridgeId>.json`，含 `protocolVersion: 1`、`tools[].risk`、心跳 ≤30s
- [ ] 删除产品入口：`dist/mcp-server.js` 不再写入 IDE MCP；移除 `languageModelTools`
- [ ] Installer：只写 **`AT Series`** + `AT_SERIES_HOST_APP`；调用本仓 helper；迁移旧条目；不删第三方
- [ ] autoApprove：仅 `risk=read` + `at_list_providers`（纠正 AT Terminal「全量 autoApprove」）
- [ ] 每个 `risk=write|exec` 有插件内确认或等价授权
- [ ] 文档/skill 指向本仓系列 skill；旧 per-plugin MCP skill 删除或改指向

### 8.2 AT Terminal（`ssh-plugins`）

- [ ] `pluginId = at.terminal`；工具名 v1 **保持**短名（`list_ssh_servers` 等）
- [ ] 演进现有多桥经验 → series registry（不要退回单文件）
- [ ] MCP 变体贡献 Hub；**base 变体不贡献**
- [ ] 改写：`BridgeServer.ts`、`BridgeDiscovery.ts`、`McpConfigInstaller.ts`；删除/停用产品用 `server.ts` + `BridgeClient` 主路径
- [ ] 移除 `package.mcp.json` 的 `languageModelTools` 与 `AgentTools.ts` 注册（若仅服务 LM）
- [ ] 保留 `AgentToolService` 为执行权威（ADR-002）
- [ ] 建议 risk：`list_*` / `get_*` / `sftp_list|stat|read` → read；`sftp_write|create*` → write；`run_remote_command` → exec

### 8.3 JumpServer（`jumpserver-plugins`）

- [ ] `pluginId = at.jumpserver`；工具名 v1 **保持** `jumpserver_*`
- [ ] 单文件 discovery → 多桥 registry（对齐协议；修复多窗口互盖）
- [ ] 可独立贡献 Hub（单装场景）
- [ ] **补确认：** `jumpserver_send_terminal_input`、`jumpserver_mysql_send_input`（及所有 write/exec）
- [ ] Bridge 补 body limit / 参数校验（现状弱于 AT Terminal）
- [ ] 建议 risk：list/context/sftp 读/mysql context → read；sftp 写改删 → write；send_input / run_command / mysql_send|execute → exec
- [ ] 注意：部分 SFTP API 忽略 `connectionKey` 是既有产品债；迁 Hub 时可修，但不要偷偷改工具语义而不改 description

### 8.4 Installer 目标（v1）

本仓 helper 必须覆盖：

- Cursor：`~/.cursor/mcp.json`
- Kiro：`~/.kiro/settings/mcp.json`
- Continue：workspace `.continue/mcpServers/*.yaml`（或现行等价路径）

其它 `hostApp`：先保证枚举与 env；写入逻辑按需扩展。

---

## 9. 验收时优先核对

对照 `requirements.md` §8，Agent 声称「完成」前至少能指出证据：

1. IDE 本系列只剩 **`AT Series`** 一条  
2. 无插件时几乎只有 `at_list_providers`  
3. 启停插件 → 工具出现/消失  
4. 两插件共存无需第二 MCP 条目  
5. 不同 IDE 不串台（`hostApp`）  
6. 扩展升级后仍指向 `~/.at-series/mcp/hub.js`  
7. 低版本不能降级 Hub；同版本不同 hash 可更新  
8. write/exec 不在默认 autoApprove，且插件内确认仍在  
9. 仓库不再推荐 LM tools / per-plugin mcp-server  

---

## 10. 常见偏航（发现即停）

| 偏航 | 正确做法 |
|------|----------|
| 在本仓实现 `BridgeServer` 框架「方便插件」 | 拒绝；D26 明确不含 |
| Hub 内 hardcode 工具名列表 | 动态 `GET /tools` / registry |
| IDE 配置仍指向扩展目录 `mcp-server.js` | 只指向 `~/.at-series/mcp/hub.js` |
| deactivate 时删除 hub.js 或卸 MCP 配置 | 只 unpublish 自己的 bridge |
| 为省事恢复 `languageModelTools` | 产品面已删除 |
| 同 semver 总是覆盖或永不覆盖 | 按 hash 规则 |
| 静默改 requirements/protocol 决策 | 先改文档再改代码 |
| 接口实现已变、适用 protocol 文档未同变更集更新 | **硬停**；补齐 §2.1 要求的文档/类型后再继续 |
| 插件按旧文档对接新接口 | 以最新适用 protocol 为准重对接；修文档滞后而非让插件猜实现 |
| 未 grill/未改文档就扩大包边界 | 先更新 requirements D26+ |

---

## 11. 沟通语言

与用户协作默认 **简体中文**；协议正文与对外 npm README 可保持英文。代码标识符、工具名、`pluginId` 保持协议规定的英文形态。
