# Hub 运行时性能与响应速度分析

> **状态：** 契约已更新；实现进行中（2026-08-27）。  
> **日期：** 2026-08-27  
> **范围：** `@at-series/mcp-hub` 热路径（stdio MCP `tools/list` / `tools/call`、Bridge HTTP 探测、registry watch、渐进暴露端到端）。  
> **方法：** 四个子代理并行深读源码与契约（模型 `claude-fable-5-thinking-xhigh`），本报告只保留交叉验证后的共识与已核对证据。  
> **不变量：** INV-1..6（见 [`2026-08-13-at-series-optimization-roadmap.md`](../superpowers/plans/2026-08-13-at-series-optimization-roadmap.md)）不得被下列建议削弱。

---

## 0. 结论

Hub 的算法与传输层已经够用：跨桥探测并行、in-flight 刷新合并、`list_changed` 按工具名指纹门控、2 MiB 流式截断、拒绝 3xx、审计落盘异步。健康双桥、loopback 场景下单次 `tools/list` 大约 **1–15 ms**，不是用户可感瓶颈。

真正拖慢响应的是编排层：**每次 `tools/list` 和每次 `tools/call`（含五个元工具）都同步等待一轮「registry 全读 + 每桥 `GET /health` 再 `GET /tools`」**。后台 5 s 定时器和 registry watch 已经在维持新鲜度，热路径却不用这份内存目录。后果：

- 健康：每次交互固定税约 3–10 ms，并把扩展宿主事件循环抖动放大进每一次调用。
- **僵死桥**（端口 accept 但不回包，IDE 睡眠恢复 / 扩展宿主卡顿 / 端口被复用常见）：每一次 list/call 固定 **+2 s**（health 超时），health 通过但 `/tools` 挂起则 **+7 s**。这不是 p99，是该桥存在期间的 **p50**。
- 渐进暴露（两插件 24 工具已超过阈值 20，属常态）把上述税乘以 4–5 次 MCP 往返；agent 侧另加 2–3 个 LLM 推理轮。

协议 `v1.md` §8.4 原文是 “On every `tools/list`, recompute **from current memory** after pending FS events”。`tools/call` 没有任何刷新要求。当前实现比协议更保守。与此相对，`requirements.md` **D12 / H9** 写的是「每次 list 全量重扫保底」——这是落地 TTL 前必须先解开的文档张力（见 §4）。

现有优化路线图把「性能」放在阶段 6，且条目偏向插件 minify。**本报告中的 Hub 热路径项与插件抽包无关，可在 Hub 仓单独推进**；僵死桥场景已经是用户可感延迟，不必等阶段 5。

---

## 1. 延迟模型

设 N 个 bridge、T 个 winner 工具。

### 1.1 `tools/list`

```text
latency ≈ t_registry(readdir + N × readFile+parse)
        + max_i (health_i + tools_i)     // 跨桥并行、单桥内串行
        + t_aggregate                     // 亚毫秒
        [ + 若撞上 in-flight refresh：残余 + 完整再一轮 ]
```

| 分位 | 健康 loopback | 存在僵死桥 |
|------|----------------|------------|
| p50 | 5–15 ms，主导因子是最慢扩展宿主的事件循环，不是网络 | **≈ 2 s**（health 超时地板） |
| p99 | 被最慢桥拖住；`/tools` 挂起时至多 +5 s | 单轮上限 ≈ 7 s；叠加 trailing-pass ≈ 14 s |

### 1.2 `tools/call`

```text
latency ≈ 与 list 完全同一套 refresh（探测所有桥，含与本次调用无关的桥）
        + invoke_attempt1（≤120 s，含插件内确认对话框）
        [ + invoke_attempt2（仅传输失败，再 ≤120 s）]
```

系统性税是**前置 refresh**，不是 invoke。invoke 120 s 上限是 §7.8 给确认 UI 留的，不要为性能调小。

### 1.3 冷启动

`createHubRuntime` 在 `main()` 里 **先** `await refreshCatalog()`（`server.ts` 基线刷新），**后** `mcpServer.connect(transport)`。健康 <200 ms 可接受；僵死桥会把 MCP `initialize` / 工具面板出现推迟 2–7 s。

### 1.4 渐进暴露端到端（「列出 SSH」→ `list_ssh_servers`）

装齐 terminal(9) + jumpserver(15) 即 24 > 20，auto 模式隐藏业务工具是常态。相对「第一轮直接 call」：

| 层 | 增量 |
|----|------|
| MCP wire | +3～4 次往返（providers → 可选 search → select → `list_changed` 触发的再一次 `tools/list`） |
| Agent | +2～3 个 LLM 推理轮，墙钟大约 +3 s～+30 s |
| Token | 42 工具场景每轮 prompt 少注入约 6.7K tokens（全量 list ~7400 → meta-only ~730） |

**auto 默认应当保住（INV-4）**；要修的是路径摩擦（同步探测、瞬断即剪 selection、30 s idle vs 120 s invoke），不是关掉渐进暴露。

---

## 2. 瓶颈清单

### P0

| ID | 瓶颈 | 证据 | 用户可感影响 |
|----|------|------|----------------|
| **P0-1** | 每次 `tools/list` / `tools/call`（含元工具）入口 `await refreshCatalog()` | `packages/mcp-hub/src/hub/server.ts` `listToolsForMcp`、`callTool` 首行；`refreshCatalogOnce` 对全部记录 `GET /health` 再 `GET /tools` | 健康 +3–10 ms；僵死桥每调用 +2–7 s；渐进流程 ×4～5 |
| **P0-2** | 不健康桥零隔离：无 last-failure 负缓存，按需 refresh 与 5 s 定时器都重打 | 同文件 `refreshCatalogOnce` 对 `records` 无条件探测；`HEALTH_REFRESH_INTERVAL_MS = 5000` | 僵死桥存在期间，+2 s 从 p99 变成 p50 |
| **P0-3** | 启动阻塞在首次全量刷新上 | `createHubRuntime` 末尾 `await refreshCatalog()`；`hub/main.ts` 先 runtime 后 `connect` | 僵死桥：MCP 握手 / 工具面板 2–7 s |
| **P0-4** | 桥瞬断 → 立即从 selection 剪除且恢复后不回填 | `refreshCatalogOnce` 用 `winnerNames` filter `selectedToolNames`；health 超时仅 2 s | 任务中途工具列表塌回仅元工具；agent 重走 discover（+2～3 推理轮 + prompt 缓存失效） |
| **P0-5** | 手写配置 idle TTL 默认 30 s vs invoke 上限 120 s；活动戳只在 call **入口** touch | `DEFAULT_TOOL_SELECTION_IDLE_MS = 30000`（`protocol/index.ts`）；installer 写 `0`（关闭）只覆盖托管配置；`touchSelectionActivity` 在 invoke 前 | 慢确认 / 慢命令返回瞬间清空 selection，体感「每做一步都要重新找工具」 |

P0-1 与 P0-2 是同一根因的两面：热路径同步全量探测，且失败桥没有退避。四个子代理全部独立点名这两条。

### P1

| ID | 瓶颈 | 证据 |
|----|------|------|
| **P1-1** | 单桥内 health→tools 串行，探测时长是两段之和 | `refreshCatalogOnce` 内顺序 `await bridgeGetHealth` / `await bridgeGetTools`。最坏 7 s，可压到 max(2 s, 5 s)=5 s |
| **P1-2** | invoke 传输失败不把该桥标 unhealthy（落后于 v1 §8.3 步 4）；结构化 `NOT_FOUND` 不换桥（§8.3 步 5 SHOULD） | `callTool` failover 循环：错误体直接返回；catch 只记 `lastTransportError` |
| **P1-3** | 审计 sanitize 同步跑在响应交付之前 | `callTool` 的 `finally` 调 `sanitizeForAudit` / `sanitizePreview`；大响应（上限 2 MiB）4 条正则 + 可能 sha256，约 5–20 ms |
| **P1-4** | poll 回退每 ~2 s **无条件** `onChange` → 全量 HTTP 刷新 | `registry/watch.ts` `setInterval(schedule, pollIntervalMs)` 不做目录指纹比对 |
| **P1-5** | `at_list_providers` 美化 JSON（`null, 2`）+ 五个元工具 description 重复拼接同一长后缀 | `server.ts` `JSON.stringify(providersResult, null, 2)`；`META_TOOL_DESCRIPTION` 出现 5 次。每次 discover 多约 300–800 tokens，每轮固定约 190 tokens 冗余 |
| **P1-6** | 崩溃残锁（acquiredAt < 30 s）使 `syncHubBundle` / installer 等满 5 s 后抛错 | `fs/fileLock.ts`：`staleMs` 30 s > 获取预算 5 s；锁内有 `pid` 但无探活 |

### P2（规模保险 / 微优化，当前用户不可感）

- registry 每次全量 `readdir` + 串行 `readFile`，无 mtime 缓存（文件个位数、<10 KB）。
- heartbeat 读回自己刚写的记录再 pretty-print 整份重写。
- `aggregate.ts` 对同一组桥多次拷贝排序。
- undici 默认 keep-alive ~4 s < 5 s 刷新周期；目标是 `127.0.0.1`，建连可忽略。
- search 线性扫描 N≈24–100，前缀树无收益；schema 已是懒加载（search 不含 `inputSchema`）。

---

## 3. 优先建议（按「收益 ÷ 改动量」）

落地时仍须遵守 AGENTS.md §2.1：触及聚合/路由/刷新语义的，同一变更集更新适用 protocol；改产品意图须**先**改 `requirements.md`。

| 优先级 | 建议 | 改哪里 | 预期收益 | 契约 |
|--------|------|--------|----------|------|
| **1** | `callTool` 热路径改读内存 catalog；仅当 `winners.get(name)` miss 时按需刷新一次再判 `NOT_FOUND` | `hub/server.ts` | 所有业务/元工具调用去掉前置全量探测；僵死桥场景每调用省 2–7 s；渐进 5 步少 4 轮重扫 | 实现已超出 v1 §8.3/§8.4。建议 §8.4 加一句澄清（非破坏，不升 `protocolVersion`） |
| **2** | 不健康桥 3–5 s 负缓存：按需 refresh 跳过刚失败的桥，只留定时器重探 | `hub/server.ts` | 僵死桥不再把 +2 s 打进每一次交互。v1 §8.4 已推荐 last-failed 3–5 s | 无需改文档；若做指数退避封顶 15 s 则微调 §8.4 推荐文字 |
| **3** | invoke 传输失败当场从内存 healthy/winners 摘除该桥 | `hub/server.ts` failover | 补齐 §8.3 步 4；是建议 1 的安全前提，否则缓存窗口会持续路由到刚死的桥 | 实现落后于文档，无需 protocol diff |
| **4** | 单桥内 health 与 tools **并行**发出；health 失败则丢弃 tools 结果，失败仍回退 registry snapshot | `refreshCatalogOnce` | 探测时长从「和」变「max」；最坏 7 s→5 s，典型 2×RTT→1×RTT | 语义不变，可选澄清 §8.2 时序 |
| **5** | 审计 sanitize 移入 `AuditLogger` 异步写链（只改执行时机，不改脱敏内容） | `server.ts` finally + `audit/logger.ts` + `sanitize.ts` | 大响应 -5–20 ms 客户端可见延迟 | 无需改文档（§3.4 只约束落盘内容） |

### 第二批（文档流程更重，或收益在 agent 轮次）

| 建议 | 说明 | 契约 |
|------|------|------|
| **`tools/list` 秒级 TTL 或「立即返回内存 + 后台刷新 + 变化才 `list_changed`」** | 与建议 1 同级收益，但 D12/H9 明文「每次 list 全量重扫保底」，与 v1 §8.4「从当前内存重算」冲突 | **必须先改 requirements D12/H9**，再同步 v1 §8.4，最后改代码 |
| **冷启动先 `connect(stdio)`，基线刷新加全局预算 / 后台补全** | 僵死桥 initialize 7 s→<300 ms；短暂只见元工具，随后 `list_changed` 补齐，与 v2 客户端流程兼容 | **必须**改写 v1 §8.1 启动顺序 |
| **selection 对瞬断加宽限期**：连续 N 次失败或持续 T 秒才剪；桥恢复后回填已选名 | 消灭「2 s 超时 → 塌回 meta-only → 重走 discover」 | v2 §4 现文是 MUST discard，**必须同变更集改协议**。selection 仍只过滤 `tools/list`，不触 INV-5 |
| **auto-clear 在 invoke 完成时也 touch；手写配置 idle 默认 ≥120 s** | 对齐 `INVOKE_TIMEOUT_MS`。installer 写 `0` 的产品决策不动 | 改默认值须同步 v2 §4.1 |
| **响应瘦身**：`at_list_providers` 去掉 `null, 2`；search description 截断；元工具共享后缀缩短 | 每轮固定少约 190 tokens，discover 少约 300–800 tokens | 美化格式非规范正文；截断须在 v2 §3.2 加一句 |
| **poll 回退做目录指纹**，有变化才 `onChange` | 网络家目录 / 无 `fs.watch` 环境不再每 2 s 全量探测 | 无需改文档 |
| **锁探活**：残锁内 `pid` 已死则立即夺锁 | 避免 activate 尾延迟 +5 s | 建议更新 v1 §8.6 参考阈值一句 |

`at_select_tools` 增加可选 `query`（search+select 合并）能把冷路径从 +2～3 轮压到 +1 轮，但是接口加法，须同变更集更新 v2、类型与 `plugin-integration.md`。不作为第一批。

自适应刷新间隔（healthy 15 s / recently-failed 5 s）零文档成本（已在 §8.4 推荐区间），可与建议 2 一起做，idle HTTP 量约 -60%。

---

## 4. 文档张力（落地 TTL 前必须解开）

| 来源 | 原文要点 |
|------|----------|
| `docs/protocol/v1.md` §8.4 | `tools/list` 从**当前内存**重算；watch + 周期 re-health 驱动状态 |
| `docs/requirements.md` D12 | 以 watch + health + `list_changed` 为主；**每次 list 全量重扫保底** |
| `docs/requirements.md` H9 | `tools/list` 路径具备全量一致性重算保底 |

优先级：requirements > protocol。因此：

- **建议 1（call 去刷新）** 不触及 D12/H9，可先做。
- **`tools/list` 改为内存/TTL** 必须先把 D12/H9 改成允许有界合并窗口（例如「list 触发重扫保底，允许 ≤2 s 合并；watch 删除仍须在下一轮 list 前可见」），再改 v1 §8.4，再改代码。禁止只改实现。

建议的 D12 修订方向（供评审，本报告不直接改 requirements）：

> 以 registry watch + 周期 health + `tools/list_changed` 为主。`tools/list` 必须反映当前内存目录；允许把并发/近时重扫合并到 ≤2 s 窗口。registry 删除必须在下一次 `tools/list`（或随后的 `list_changed`）中体现。全量网络重探是后台保底，不是每次 list 的同步前置条件。

---

## 5. 明确不要做

1. 把默认改成 `AT_SERIES_TOOL_DISCOVERY=off`，或把五个元工具纳入渐进隐藏（INV-4 / INV-6）。
2. 把 selection 变成 ACL / 路由过滤（INV-5）。
3. 在 Hub 内写死或长期缓存任何插件工具清单（INV-3）。秒级 TTL + watch/定时器/miss 失效可以。
4. 跨 `hostApp` 共享健康状态或路由。
5. 把确认 UI 上收进 Hub，或调小 `POST /invoke` 的 120 s 超时。
6. 跟随 3xx、放宽鉴权、放宽 2 MiB 截断、削弱审计脱敏。
7. 为提速启动而省略 `hub.js` 磁盘哈希校验、文件锁，或允许低版本覆盖高版本。
8. deactivate 时删除 `hub.js` 或卸载 MCP 配置。
9. 把通用 Bridge HTTP 框架抽回本仓。
10. 为 search 做前缀树/倒排索引——N 太小，CPU 不是瓶颈。

---

## 6. 与现有路线图的关系

[`2026-08-13-at-series-optimization-roadmap.md`](../superpowers/plans/2026-08-13-at-series-optimization-roadmap.md) 阶段 6 写的是插件 minify 与体验项，排在抽共享包之后。本报告的 P0-1..3 是 **Hub 编排问题**，不依赖阶段 5，也不是 minify。

建议排期：

1. 本仓单独开「Hub 热路径」切片：建议 1–5（call 读内存、负缓存、failover 标 unhealthy、health/tools 并行、sanitize 异步）。其中建议 1 带 §8.4 澄清。
2. 另开 requirements 修订（D12/H9）后再做 list TTL + 冷启动预算。
3. selection 宽限期 / idle 默认 与 v2 修订绑定，可并入既有阶段 2 的 Hub 完整性工作，或紧随其后。
4. 插件 minify 仍按原阶段 6。

---

## 7. 子代理分工与交叉验证

| 子代理 | 焦点 | 独立得出的同一 P0 |
|--------|------|-------------------|
| Hub runtime 热路径 | `server.ts` / `aggregate.ts` / `discovery.ts` / audit | 每个入口全量重扫；call 比协议更保守 |
| Bridge HTTP | `bridgeClient/http.ts`、超时、failover | 跨桥并行、单桥串行；无 circuit breaker；hung 桥把 +2 s 打进 p50 |
| Registry / sync / fs | `read.ts` / `watch.ts` / publisher / lock / installer | 磁盘 I/O 本身不是瓶颈；热路径内联刷新 + 启动阻塞才是 |
| 渐进暴露与上下文 | v2 discover→select、token、`list_changed` 抖动 | wire 往返便宜；贵的是 LLM 轮次和「瞬断即剪 selection」放大 |

传输层（流式 2 MiB、AbortSignal 覆盖响应体、`redirect: 'error'`、token 不进 `at_list_providers`）四个报告均判定正确且开销可忽略，本报告不再展开。
