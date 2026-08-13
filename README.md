# AT Series MCP Hub

把 AT 系列 IDE 插件的 MCP 入口收成 **一条**：`AT Series` → `~/.at-series/mcp/hub.js`。

各能力插件（AT Terminal / JumpServer / Grafana / …）在扩展宿主内跑自己的 Bridge，向 Hub **注册工具**；Hub 聚合目录、按需渐进暴露、路由 `tools/call`、监听 registry。凭据、确认弹窗、业务逻辑仍留在插件内。

| | |
|---|---|
| npm 包 | [`@at-series/mcp-hub`](https://www.npmjs.com/package/@at-series/mcp-hub) **`0.2.0`**（`packages/mcp-hub`） |
| Bridge 规范 | [`docs/protocol/v1.md`](docs/protocol/v1.md)（对接真源，`protocolVersion: 1`） |
| Hub 暴露规范 | [`docs/protocol/v2.md`](docs/protocol/v2.md)（渐进发现 / select / auto-clear） |
| 系列 Skill | [`skills/super-ops`](skills/super-ops/SKILL.md)（**SuperOps**：discover → select → call + 运维规范） |
| 契约类型 | [`packages/mcp-hub/src/protocol`](packages/mcp-hub/src/protocol)（随包导出） |
| 当前阶段 | **Hub V2a 已发布**：渐进式 `tools/list` + meta-tools；插件继续发 Bridge v1 |

## 文档

| 文档 | 说明 |
|------|------|
| [**docs/protocol/v1.md**](docs/protocol/v1.md) | **Bridge 接口契约真源**：registry、Bridge HTTP、聚合/路由、MCP 配置、错误体、Hub 版本选举 |
| [**docs/protocol/v2.md**](docs/protocol/v2.md) | **Hub 渐进式工具暴露**：`at_search_tools` / `at_select_tools` 等、`AT_SERIES_TOOL_DISCOVERY`、选中空闲 TTL |
| [docs/guides/plugin-integration.md](docs/guides/plugin-integration.md) | 新插件接入 + Agent discover→select→call |
| [docs/requirements.md](docs/requirements.md) | 产品范围、决策与验收 |
| [docs/decisions/ADR-001-at-series-mcp-hub.md](docs/decisions/ADR-001-at-series-mcp-hub.md) | 架构决策 |
| [AGENTS.md](AGENTS.md) | 本仓 Agent / 迁移约定 |
| [skills/super-ops](skills/super-ops/SKILL.md) | SuperOps 系列 skill（工具附录 + 运维 runbooks） |

插件作者以实现 Bridge **v1** 为准；Hub 列表暴露行为以实现 **v2** 为准。不要靠读 Hub 源码猜接口。

## 架构

```text
IDE MCP Client (Cursor / Kiro / Continue / …)
        │  stdio  MCP server name: "AT Series"
        ▼
~/.at-series/mcp/hub.js          ← @at-series/mcp-hub 打包的单文件入口
        │  读 registry + HTTP；渐进暴露 tools/list
        ▼
~/.at-series/bridges/<hostApp>/<bridgeId>.json
        │
        ▼
插件 Bridge  127.0.0.1:<port>
  GET /health · GET /tools · POST /invoke
        │
        ▼
插件域服务（SSH / JumpServer / Grafana / …）+ 确认 / 凭据
```

**边界（本仓不做）：** 不提供通用 Bridge HTTP 框架；不实现各插件业务；不把确认 UI 搬进 Hub；不按插件写死工具清单。

## Hub V2：渐进式工具暴露

目录变大时，Hub 默认不再把全部业务工具 schema 塞进每轮上下文：

1. `at_list_providers` → `at_search_tools` / `at_get_tool`
2. `at_select_tools`（按 `pluginId` 或工具名；`replace` / `add`）
3. 收到 `tools/list_changed` 后刷新 list，再以一等工具名 `tools/call`
4. 任务结束调用 `at_clear_tool_selection`（另有空闲 TTL / 可选 call budget 自动 clear）

| Env | 默认 | 含义 |
|-----|------|------|
| `AT_SERIES_TOOL_DISCOVERY` | `auto` | `auto` / `always` / `off` |
| `AT_SERIES_TOOL_DISCOVERY_THRESHOLD` | `20` | `auto` 下超过该业务工具数才渐进 |
| `AT_SERIES_TOOL_SELECTION_IDLE_MS` | `30000` | 选中空闲自动 clear；`0` 关闭 |
| `AT_SERIES_TOOL_SELECTION_MAX_CALLS` | `0` | 业务调用次数预算；`0` 关闭 |

**list ≠ ACL：** 未出现在 `tools/list` 的赢家工具，Hub 仍可路由 `tools/call`（部分 IDE 客户端会自行按 list 拦截）。

Agent 用法见 **SuperOps** skill：[`skills/super-ops`](skills/super-ops/SKILL.md)。

## 已实现能力

| 模块 | 职责 |
|------|------|
| **protocol** | Bridge v1 / Hub v2 常量与类型；risk / autoApprove |
| **registry** | 读/校验 `bridges/<hostApp>/*.json`；watch |
| **publisher** | publish / heartbeat / unpublish；`syncHubBundle` 选举写 `hub.js` |
| **hub runtime** | stdio MCP：聚合、渐进暴露、meta-tools、路由 invoke、`list_changed` |
| **installer** | 写/修/卸 **`AT Series`**；迁移旧 AT 条目；autoApprove = Hub meta only；写入 progressive discovery env |

覆盖 IDE：Cursor、Kiro、Continue。

```bash
npm test   # 协议一致性、聚合选路、渐进暴露、选举、installer …
```

## 新插件怎么接入

**契约：** [v1 Bridge](docs/protocol/v1.md) + [v2 Hub 暴露](docs/protocol/v2.md)  
**步骤：** [plugin-integration.md](docs/guides/plugin-integration.md)

1. Bridge：`127.0.0.1` + `x-at-series-token` + `GET /health` / `GET /tools` / `POST /invoke`
2. `publish` 到 `~/.at-series/bridges/<hostApp>/<bridgeId>.json`（`protocolVersion: 1`，工具带 `risk`）
3. MCP 变体：`syncHubBundle` + `ensureAtSeriesMcpConfig`（只写 **`AT Series`**）
4. deactivate：`unpublish`（不删 `hub.js`、不卸 MCP 配置）

### 依赖

```bash
npm install @at-series/mcp-hub
```

### activate 示例

```ts
import {
  FsBridgePublisher,
  syncHubBundle,
  ensureAtSeriesMcpConfig,
  hubJsPath,
  detectHostApp,
  AT_SERIES_PROTOCOL_VERSION, // Bridge wire = 1
  type BridgeRegistryRecord,
  type ToolCatalogEntry
} from '@at-series/mcp-hub';

const bridgeId = crypto.randomUUID();
const hostApp = detectHostApp({
  appName: 'Cursor',
  uriScheme: 'cursor',
  extensionPath: 'C:/Users/you/.cursor/extensions/local.at-example-1.0.0'
});
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
  version: '0.2.0',
  bundlePath: require.resolve('@at-series/mcp-hub/hub'),
  pluginId: 'at.example',
  pluginVersion: '1.2.3'
});

await ensureAtSeriesMcpConfig({
  target: 'cursor',
  hostApp,
  hubJsAbsolutePath: hubJsPath()
});

const publisher = new FsBridgePublisher({ bridgeId, hostApp });
const record: BridgeRegistryRecord = {
  protocolVersion: AT_SERIES_PROTOCOL_VERSION,
  bridgeId,
  pluginId: 'at.example',
  pluginDisplayName: 'AT Example',
  pluginVersion: '1.2.3',
  hostApp,
  port: 43123,
  token: '<high-entropy-secret>',
  pid: process.pid,
  updatedAt: Date.now(),
  tools
};
await publisher.publish(record);
```

**Hub 版本选举：** semver 更高 → 覆盖；同版本且 `bundleSha256` 不同 → 覆盖；同 hash → no-op；更低 → 禁止覆盖。

**autoApprove（installer）：** 仅 Hub meta-tools（`at_list_providers`、`at_search_tools`、`at_get_tool`、`at_select_tools`、`at_clear_tool_selection`）。业务工具经 bridge 注册 + `at_select_tools` 暴露；`write`/`exec` 须插件内确认。Installer 同时写入 `AT_SERIES_TOOL_DISCOVERY=auto`、`THRESHOLD=20`、`SELECTION_IDLE_MS=0`、`SELECTION_MAX_CALLS=0`。

**不要：** per-plugin `mcp-server.js` 作产品入口；不要用 `languageModelTools` 暴露同一批工具。

## 本仓开发

```bash
npm install
npm run build          # tsc → packages/mcp-hub/dist
npm run build:hub      # esbuild → dist/hub.js
npm test
npm run typecheck
```

```text
at-series-mcp-hub/
  AGENTS.md
  README.md
  docs/
    protocol/v1.md
    protocol/v2.md
    guides/plugin-integration.md
    requirements.md
    decisions/ADR-001-*.md
  packages/mcp-hub/
  skills/super-ops/            # SuperOps
```

## 路线图

| Phase | 内容 | 状态 |
|-------|------|------|
| **P0a** | Hub 包 + 协议测试 | 完成 |
| **V2a** | 渐进式 tools/list + meta-tools + protocol v2 | 完成（本版） |
| **V2c** | SuperOps 系列 skill | 完成（本版） |
| **P0b/c** | 各插件迁 Hub（Terminal / JumpServer / …） | 进行中（插件仓） |
| **V2b** | 结果分页/截断 | 未开始 |
| **P2** | 工具命名统一前缀 | 未开始 |
