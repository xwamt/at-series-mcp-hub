# AT Series MCP Hub

把 AT 系列 IDE 插件的 MCP 入口收成 **一条**：`AT Series` → `~/.at-series/mcp/hub.js`。

各能力插件（SSH / JumpServer / 未来新产品）在扩展宿主内跑自己的 Bridge，向 Hub **注册工具**；Hub 只负责聚合 `tools/list`、路由 `tools/call`、监听 registry。凭据、确认弹窗、业务逻辑仍留在插件内。

| | |
|---|---|
| npm 包 | `@at-series/mcp-hub` `0.1.0`（`packages/mcp-hub`） |
| 接口规范 | [`docs/protocol/v1.md`](docs/protocol/v1.md)（Bridge 对接真源）；[`docs/protocol/v2.md`](docs/protocol/v2.md)（Hub 渐进式工具暴露） |
| 契约类型 | [`packages/mcp-hub/src/protocol`](packages/mcp-hub/src/protocol)（随包导出，与规范同步） |
| 当前阶段 | **P0a 已完成**：Hub 运行时 + publisher + installer；插件迁移见 P0b/P0c |

## 文档

对接本服务前，请先读规范与接入指南：

| 文档 | 说明 |
|------|------|
| [**docs/protocol/v1.md**](docs/protocol/v1.md) | **Bridge 接口契约真源**：registry、Bridge HTTP、Hub 聚合/路由、MCP 配置、错误体、版本选举 |
| [**docs/protocol/v2.md**](docs/protocol/v2.md) | **Hub 渐进式工具暴露**：meta-tools 发现/选择、hybrid 首屏、`AT_SERIES_TOOL_DISCOVERY`（Bridge 线协议仍为 v1） |
| [docs/guides/plugin-integration.md](docs/guides/plugin-integration.md) | 新插件接入步骤（Bridge → publish → syncHubBundle → installer） |
| [docs/requirements.md](docs/requirements.md) | 产品范围、决策与验收标准 |
| [docs/decisions/ADR-001-at-series-mcp-hub.md](docs/decisions/ADR-001-at-series-mcp-hub.md) | 为何采用共享 Hub 架构 |
| [AGENTS.md](AGENTS.md) | 本仓 Agent / 迁移工程约定 |

插件作者以实现 [`docs/protocol/v1.md`](docs/protocol/v1.md)（Bridge 线协议）为准；Hub 渐进式暴露行为见 [`docs/protocol/v2.md`](docs/protocol/v2.md)。不要靠读 Hub 源码猜接口。类型从 `@at-series/mcp-hub` 导入，须与规范同变更集保持一致。

## 架构

```text
IDE MCP Client (Cursor / Kiro / Continue / …)
        │  stdio  MCP server name: "AT Series"
        ▼
~/.at-series/mcp/hub.js          ← @at-series/mcp-hub 打包的单文件入口
        │  读 registry + HTTP
        ▼
~/.at-series/bridges/<hostApp>/<bridgeId>.json
        │
        ▼
插件 Bridge  127.0.0.1:<port>
  GET /health · GET /tools · POST /invoke
        │
        ▼
插件域服务（SSH / JumpServer / …）+ 确认 / 凭据
```

**边界（本仓不做）：** 不提供通用 Bridge HTTP 框架；不实现 SSH/JumpServer 业务；不把确认 UI 搬进 Hub；不按插件写死工具清单。

## 已实现能力（P0a）

| 模块 | 职责 | 主要 API |
|------|------|----------|
| **protocol** | 类型、常量、risk/autoApprove 纯函数、路径助手 | `AT_SERIES_PROTOCOL_VERSION`、`BridgeRegistryRecord`、`hubJsPath()` … |
| **registry** | 读/校验 `bridges/<hostApp>/*.json`；目录 watch | `listBridgeRecords`、`watchBridgeRegistry` |
| **publisher** | 写 registry；心跳；卸载自身记录；选举写入 `hub.js` | `FsBridgePublisher`、`syncHubBundle` |
| **hub runtime** | stdio MCP：聚合工具、路由 invoke、`at_list_providers`、`list_changed` | `createHubRuntime`；产物 `dist/hub.js`（`@at-series/mcp-hub/hub`） |
| **installer** | 写/修/卸 **`AT Series`**；迁移旧 AT 条目；按 `risk=read` 算 autoApprove | `ensureAtSeriesMcpConfig`、`uninstallAtSeriesMcpConfig`、`defaultAutoApproveToolNames` |

覆盖 IDE：Cursor（`~/.cursor/mcp.json`）、Kiro、Continue（workspace `.continue/mcpServers/`）。

测试：`npm test`（含协议一致性、双插件聚合、选路、hostApp 隔离、hub 版本选举、installer 迁移等）。

## 新插件怎么接入

**契约真源：** [`docs/protocol/v1.md`](docs/protocol/v1.md)（Bridge）；[`docs/protocol/v2.md`](docs/protocol/v2.md)（Hub 渐进暴露）。  
**操作指南：** [`docs/guides/plugin-integration.md`](docs/guides/plugin-integration.md)。  
类型从包导入：`import … from '@at-series/mcp-hub'`。

最小闭环：

1. 实现 Bridge：`127.0.0.1` + `x-at-series-token` + `GET /health` / `GET /tools` / `POST /invoke`
2. `publish` registry 到 `~/.at-series/bridges/<hostApp>/<bridgeId>.json`（`protocolVersion: 1`，工具带 `risk`）
3. MCP 变体：`syncHubBundle` 选举 `hub.js`，`ensureAtSeriesMcpConfig` 只写 **`AT Series`**
4. deactivate 时 `unpublish`（只删自己的 registry；**不**删 `hub.js`、**不**卸 MCP 配置）

### 依赖

```bash
npm install @at-series/mcp-hub
# 本地联调可用 file: / workspace 依赖，直至 npm 发版
```

### activate 示例

```ts
import {
  FsBridgePublisher,
  syncHubBundle,
  ensureAtSeriesMcpConfig,
  hubJsPath,
  AT_SERIES_PROTOCOL_VERSION,
  type BridgeRegistryRecord,
  type ToolCatalogEntry
} from '@at-series/mcp-hub';

const bridgeId = crypto.randomUUID(); // MUST be UUID
const hostApp = 'cursor';
const tools: ToolCatalogEntry[] = [
  {
    name: 'example_ping',
    title: 'Example Ping',
    description: 'Connectivity check.',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  }
];

await syncHubBundle({
  version: '0.1.0', // 所打包的 hub 包 semver
  bundlePath: require.resolve('@at-series/mcp-hub/hub'),
  pluginId: 'at.example',
  pluginVersion: '1.2.3'
});

await ensureAtSeriesMcpConfig({
  target: 'cursor', // 'kiro' | 'continue'（continue 须传 workspaceFolder）
  hostApp,
  hubJsAbsolutePath: hubJsPath(),
  registryTools: tools
});
// 可选：defaultAutoApproveToolNames({ registryTools: tools })

const publisher = new FsBridgePublisher({ bridgeId, hostApp });
const record: BridgeRegistryRecord = {
  protocolVersion: AT_SERIES_PROTOCOL_VERSION,
  bridgeId,
  pluginId: 'at.example',
  pluginDisplayName: 'AT Example',
  pluginVersion: '1.2.3',
  hostApp,
  port: 43123,
  token: '<high-entropy-secret>', // 禁止明文日志
  pid: process.pid,
  updatedAt: Date.now(),
  tools
};
await publisher.publish(record);
// 存活期间每 ≤30s: await publisher.heartbeat();
// deactivate: await publisher.unpublish();
```

**Hub 版本选举：** semver 更高 → 覆盖；同版本且 `bundleSha256` 不同 → 覆盖（热修）；同版本同 hash → no-op；更低 → 禁止覆盖。

**autoApprove：** 仅 `risk=read` + 内置 `at_list_providers`；`write`/`exec` 必须在插件内确认。

**不要：** 再写 per-plugin `mcp-server.js` 作为产品入口；不要注册 `languageModelTools` 暴露同一批工具。

## 本仓开发

```bash
npm install
npm run build          # tsc → packages/mcp-hub/dist
npm run build:hub      # esbuild → dist/hub.js（e2e / 打包进 VSIX 需要）
npm test
npm run typecheck
```

仓库布局：

```text
at-series-mcp-hub/
  AGENTS.md
  README.md
  docs/
    protocol/v1.md           # Bridge 接口规范（对接真源）
    protocol/v2.md           # Hub 渐进式工具暴露
    guides/plugin-integration.md
    requirements.md
    decisions/ADR-001-*.md
  packages/mcp-hub/          # @at-series/mcp-hub
    src/{protocol,registry,publisher,hub,installer,bridgeClient}/
    test/
```

## 相关说明

| 文件 | 用途 |
|------|------|
| [docs/protocol/v1.md](docs/protocol/v1.md) | Bridge 接口规范真源 |
| [docs/protocol/v2.md](docs/protocol/v2.md) | Hub 渐进式工具暴露规范 |
| [docs/guides/plugin-integration.md](docs/guides/plugin-integration.md) | 插件接入指南 |
| [AGENTS.md](AGENTS.md) | Agent / 迁移约定与检查清单 |
| [packages/mcp-hub/README.md](packages/mcp-hub/README.md) | 包导出面说明 |
| [packages/mcp-hub/src/protocol](packages/mcp-hub/src/protocol) | 协议类型与常量 |

## 路线图

| Phase | 内容 | 状态 |
|-------|------|------|
| **P0a** | 本仓 Hub 包 + 协议一致性测试 | 完成 |
| **P0b** | `ssh-plugins`（AT Terminal）接入 Hub | 计划中 |
| **P0c** | `jumpserver-plugins` 接入；补 exec 确认 | 计划中 |
| **P1** | `list_changed` 打磨、Repair/Uninstall UX、系列 skill | 未开始 |
| **P2** | 工具命名统一前缀（另开需求） | 未开始 |
