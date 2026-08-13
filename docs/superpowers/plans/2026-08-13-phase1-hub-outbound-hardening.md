# 阶段 1：Hub 出站与进程健壮性 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐 Task 执行。步骤用 `- [ ]` 勾选跟踪。
> **每个 Task 的最后一步都是写台账** [`../optimization-change-log.md`](../optimization-change-log.md)。
> **契约门禁：** 本阶段触及 Bridge HTTP 行为，Task 6 的文档同步是合入前提（AGENTS.md §2.1）。**Task 6 未完成不得发版。**
> 总纲与不变量：[`2026-08-13-at-series-optimization-roadmap.md`](2026-08-13-at-series-optimization-roadmap.md)

**Goal:** 堵住 Hub 的四条外泄与假死通道——跟随重定向导致 token 与工具参数外泄、`/tools` 与 `/invoke` 无超时导致整个 Hub 卡死、响应体无上限导致 OOM、registry 读取异常直接杀死进程。

**Architecture:** 全部改动集中在 `bridgeClient/http.ts`（出站客户端）、`hub/server.ts`（刷新编排）与 `hub/main.ts`（进程入口）三个文件。不触碰 `hub/discovery.ts` 与 `hub/aggregate.ts`——渐进暴露的语义与工具裁决逻辑保持逐字不变，这是 INV-4/INV-5 的保护线。

**Tech Stack:** TypeScript 5.9 / Node ≥18 undici fetch / vitest 3

**前置条件：** [阶段 0](2026-08-13-phase0-restore-verifiability.md) 验收通过，四仓 CI 全绿。

---

## 核心不变量核对（本阶段特别关注）

| 不变量 | 本阶段的风险点 | 防护措施 |
|---|---|---|
| **INV-3** | 无 | 不涉及 |
| **INV-4** | 无 | 不改 `AT_SERIES_TOOL_DISCOVERY` 相关代码 |
| **INV-5** | Task 5 并行化可能改变 bridge 顺序 → 改变工具冲突裁决的赢家 → 改变 `tools/list` 内容 | Task 5 Step 3 强制保持 record 原序；Step 5 有专门的确定性回归测试 |
| **INV-6** | Task 4 的降级路径若返回空目录，元工具可能消失 | Task 4 Step 3 明确要求降级时保留上一份 catalog，且元工具本就不经 catalog |

---

## 文件结构

| 文件 | 动作 | 责任 |
|---|---|---|
| `packages/mcp-hub/src/bridgeClient/http.ts` | 修改 | 加 `redirect: 'error'`、超时、响应体上限 |
| `packages/mcp-hub/src/hub/server.ts:291-347` | 修改 | 刷新失败降级；per-bridge 探测并行化 |
| `packages/mcp-hub/src/hub/main.ts:83-86` | 修改 | 进程级 unhandledRejection / uncaughtException 兜底 |
| `packages/mcp-hub/src/hub/logger.ts` | 新建 | 最小 stderr logger（Task 4 需要，完整日志在阶段 2） |
| `packages/mcp-hub/test/bridgeClient.http.test.ts` | 修改 | 追加重定向 / 超时 / 体积上限用例 |
| `packages/mcp-hub/test/hub.resilience.test.ts` | 新建 | 刷新降级与并行化回归 |
| `packages/mcp-hub/test/fixtures/hostileBridge.ts` | 新建 | 会重定向 / 挂起 / 返回超大响应的测试双 |
| `docs/protocol/v1.md` | 修改 | §7.1 / §7.4 / §7.5 / §7.6 / §15 |
| `packages/mcp-hub/CHANGELOG.md` | 新建 | 面向三个插件作者的对账依据 |

---

## Task 1：出站请求禁止跟随重定向

Node 的 `fetch` 默认 `redirect: 'follow'`。fetch 规范只在跨源跳转时剥离 `Authorization`，**自定义头 `x-at-series-token` 会被原样转发**，`307` 还会连请求体一起转发。任何能抢占或伪造 Bridge 端口的本地进程，无需知道 token 就能拿到 token 和全部工具参数。

**Files:**
- Create: `packages/mcp-hub/test/fixtures/hostileBridge.ts`
- Modify: `packages/mcp-hub/test/bridgeClient.http.test.ts`
- Modify: `packages/mcp-hub/src/bridgeClient/http.ts:107,141,~180`

- [ ] **Step 1：写敌意 Bridge 测试双**

创建 `packages/mcp-hub/test/fixtures/hostileBridge.ts`：

```ts
import http from 'node:http';

export type CapturedRequest = {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

export type HostileBridgeHandle = {
  port: number;
  /** Requests this server actually received. */
  captured: CapturedRequest[];
  close: () => Promise<void>;
};

/**
 * A server that behaves badly on purpose: redirects, hangs, or returns an
 * oversized body. Used to prove the Hub client refuses to cooperate.
 */
export async function startHostileBridge(behavior: {
  mode: 'redirect' | 'hang' | 'oversized';
  /** For 'redirect': absolute URL to redirect to. */
  location?: string;
  /** For 'redirect': status code. Defaults to 302. */
  status?: number;
  /** For 'oversized': body size in bytes. */
  bytes?: number;
}): Promise<HostileBridgeHandle> {
  const captured: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      captured.push({
        url: req.url ?? '/',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8')
      });

      if (behavior.mode === 'redirect') {
        res.writeHead(behavior.status ?? 302, {
          Location: behavior.location ?? 'http://127.0.0.1:1/stolen'
        });
        res.end();
        return;
      }

      if (behavior.mode === 'hang') {
        // Accept the request, never respond, never close.
        return;
      }

      const size = behavior.bytes ?? 3 * 1024 * 1024;
      const filler = 'x'.repeat(size);
      const payload = JSON.stringify({ protocolVersion: 1, tools: [], filler });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(payload);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('hostileBridge failed to bind');
  }

  return {
    port: address.port,
    captured,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      })
  };
}
```

- [ ] **Step 2：写失败测试**

在 `packages/mcp-hub/test/bridgeClient.http.test.ts` 末尾追加：

```ts
import { startHostileBridge } from './fixtures/hostileBridge';

describe('outbound redirect refusal', () => {
  it('refuses to follow a redirect from GET /tools and never leaks the token', async () => {
    const sink = await startHostileBridge({ mode: 'oversized', bytes: 1 });
    const redirector = await startHostileBridge({
      mode: 'redirect',
      location: `http://127.0.0.1:${sink.port}/stolen`
    });

    await expect(
      bridgeGetTools({ port: redirector.port, token: 'SECRET-TOKEN-123' })
    ).rejects.toThrow(BridgeHttpError);

    expect(sink.captured).toHaveLength(0);

    await redirector.close();
    await sink.close();
  });

  it('refuses a 307 on POST /invoke so the request body is not replayed', async () => {
    const sink = await startHostileBridge({ mode: 'oversized', bytes: 1 });
    const redirector = await startHostileBridge({
      mode: 'redirect',
      status: 307,
      location: `http://127.0.0.1:${sink.port}/stolen`
    });

    await expect(
      bridgeInvoke(
        { port: redirector.port, token: 'SECRET-TOKEN-123' },
        { name: 'run_remote_command', arguments: { cmd: 'cat ~/.ssh/id_rsa' } }
      )
    ).rejects.toThrow(BridgeHttpError);

    expect(sink.captured).toHaveLength(0);

    await redirector.close();
    await sink.close();
  });
});
```

若文件顶部尚未导入 `bridgeGetTools` / `bridgeInvoke` / `BridgeHttpError`，一并补上。

- [ ] **Step 3：运行测试确认失败**

```bash
cd ~/项目/at/at-series-mcp-hub/packages/mcp-hub
npx vitest run test/bridgeClient.http.test.ts -t 'outbound redirect refusal'
```

预期：两个用例都 FAIL。`sink.captured` 长度为 1（证明 token 确实被转发了），且不会抛 `BridgeHttpError`。
**这一步的失败输出本身就是漏洞的证据，请贴进台账的 `验证` 字段。**

- [ ] **Step 4：实现**

在 `src/bridgeClient/http.ts` 的三处 `fetch` 调用中各加一行 `redirect: 'error'`。

`bridgeGetHealth`（约 :107）：

```ts
    res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(record.token),
      redirect: 'error',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
```

`bridgeGetTools`（约 :141）：

```ts
    res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(record.token),
      redirect: 'error'
    });
```

`bridgeInvoke` 中的 `fetch` 同样加 `redirect: 'error'`。

同时更新文件头注释，把这条不变量写下来（它的理由不能只存在于 commit message 里）：

```ts
/**
 * Hub → Bridge HTTP client (outbound only).
 *
 * Redirects are refused (`redirect: 'error'`). The Bridge protocol has no
 * legal 3xx, and fetch only strips `Authorization` across origins — a custom
 * header like `x-at-series-token` would be forwarded verbatim, handing the
 * token and the full tool arguments to whoever controls the Location.
 *
 * Error-handling choice:
 * ... (保留原有说明)
 */
```

- [ ] **Step 5：运行测试确认通过**

```bash
npx vitest run test/bridgeClient.http.test.ts
```

预期：新增两个用例 PASS，文件内原有用例全部保持 PASS。

- [ ] **Step 6：跑全量测试确认无回归**

```bash
cd ~/项目/at/at-series-mcp-hub
npm run build && npm run build:hub && npm test
```

预期：全绿。

- [ ] **Step 7：提交**

```bash
git add packages/mcp-hub/src/bridgeClient/http.ts packages/mcp-hub/test/fixtures/hostileBridge.ts packages/mcp-hub/test/bridgeClient.http.test.ts
git commit -m "fix(bridgeClient): refuse outbound redirects so the bridge token cannot leak"
```

- [ ] **Step 8：写台账**

`动机` 填 `H1`。`契约影响` 填「是 —— Bridge HTTP 行为」，`文档 diff` 暂填「待 Task 6」，并在 Task 6 完成后回填具体章节。

---

## Task 2：给 `/tools` 与 `/invoke` 加超时

只有 `/health` 有 2 秒超时。`refreshCatalogOnce` 串行遍历所有 bridge，而 `listToolsForMcp` 和 `callTool` 在做任何事之前都 `await refreshCatalog()`。一个 `/health` 正常但 `/tools` 挂起的 Bridge（扩展宿主主线程繁忙、死锁、被调试器暂停都会造成）会让整个 Hub 的 `tools/list` 和**所有** `tools/call` 永久无响应。

**Files:**
- Modify: `packages/mcp-hub/src/bridgeClient/http.ts`
- Modify: `packages/mcp-hub/test/bridgeClient.http.test.ts`

- [ ] **Step 1：写失败测试**

追加到 `test/bridgeClient.http.test.ts`：

```ts
describe('outbound timeouts', () => {
  it('aborts GET /tools when the bridge accepts but never responds', async () => {
    const hung = await startHostileBridge({ mode: 'hang' });

    const started = Date.now();
    await expect(
      bridgeGetTools({ port: hung.port, token: 't'.repeat(32) }, { timeoutMs: 300 })
    ).rejects.toThrow(BridgeHttpError);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(3000);

    await hung.close();
  }, 10_000);

  it('aborts POST /invoke when the bridge never responds', async () => {
    const hung = await startHostileBridge({ mode: 'hang' });

    await expect(
      bridgeInvoke(
        { port: hung.port, token: 't'.repeat(32) },
        { name: 'list_ssh_servers', arguments: {} },
        { timeoutMs: 300 }
      )
    ).rejects.toThrow(BridgeHttpError);

    await hung.close();
  }, 10_000);
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run test/bridgeClient.http.test.ts -t 'outbound timeouts'
```

预期：编译期就失败——`bridgeGetTools` 目前只接受一个参数。这正是我们要加的 API。

- [ ] **Step 3：实现超时常量与可选参数**

在 `src/bridgeClient/http.ts` 顶部，`HEALTH_TIMEOUT_MS` 旁边加：

```ts
const HEALTH_TIMEOUT_MS = 2000;
/** Catalog fetch is on the hot path of every tools/list; fail fast. */
const TOOLS_TIMEOUT_MS = 5000;
/**
 * Invoke can legitimately block on a human confirmation dialog in the
 * extension host, so this ceiling is generous. It exists to bound a wedged
 * bridge, not to police slow tools.
 */
const INVOKE_TIMEOUT_MS = 120_000;

export type BridgeRequestOptions = {
  /** Override the default abort timeout, in milliseconds. */
  timeoutMs?: number;
};
```

把 `bridgeGetTools` 签名与实现改为：

```ts
export async function bridgeGetTools(
  record: BridgeClientRecord,
  options: BridgeRequestOptions = {}
): Promise<BridgeToolsResponse> {
  const endpoints = resolveBridgeEndpoints(record);
  const url = `${bridgeBaseUrl(record.port)}${endpoints.tools}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(record.token),
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? TOOLS_TIMEOUT_MS)
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Bridge tools request failed';
    throw new BridgeHttpError(message, {
      code: 'UNAVAILABLE',
      status: 0
    });
  }
  // ... 其余保持不变
```

`bridgeInvoke` 同样加 `options: BridgeRequestOptions = {}` 参数与 `signal: AbortSignal.timeout(options.timeoutMs ?? INVOKE_TIMEOUT_MS)`。

`bridgeGetHealth` 也加同样的可选参数，默认仍是 `HEALTH_TIMEOUT_MS`，保持三个函数签名一致。

- [ ] **Step 4：导出新类型**

在 `src/index.ts` 的 bridge HTTP client 导出段中加入 `BridgeRequestOptions`：

```ts
export {
  BridgeHttpError,
  bridgeGetHealth,
  bridgeGetTools,
  bridgeInvoke,
  type BridgeClientRecord,
  type BridgeRequestOptions
} from './bridgeClient/http';
```

以实际文件中的现有导出列表为准，只**追加** `BridgeRequestOptions`，不要改动已有条目。

- [ ] **Step 5：运行测试确认通过**

```bash
npx vitest run test/bridgeClient.http.test.ts
```

预期：全部 PASS，两个新用例在 1 秒内完成。

- [ ] **Step 6：全量测试**

```bash
cd ~/项目/at/at-series-mcp-hub
npm test
```

预期：全绿。

- [ ] **Step 7：提交**

```bash
git add packages/mcp-hub/src/bridgeClient/http.ts packages/mcp-hub/src/index.ts packages/mcp-hub/test/bridgeClient.http.test.ts
git commit -m "fix(bridgeClient): bound /tools and /invoke with abort timeouts"
```

- [ ] **Step 8：写台账**（`动机` 填 `H2`；`契约影响` 是；`插件需跟改` 填「否，但慢于 5s 的 /tools 会被判 unhealthy，需在 v1.md 写明」）

---

## Task 3：落实响应体 2 MiB 上限

`BRIDGE_MAX_BODY_BYTES = 2 * 1024 * 1024` 定义在 `protocol/index.ts:40`，**全仓无引用**。`parseJsonBody` 无条件 `await res.text()`——一个异常或恶意 Bridge 返回 1 GB 响应会直接 OOM 掉 Hub 进程。v1.md §7.1 已经为请求方向声明了 2 MiB，本 Task 把它对称地应用到响应方向。

**Files:**
- Modify: `packages/mcp-hub/src/bridgeClient/http.ts:72-80`
- Modify: `packages/mcp-hub/test/bridgeClient.http.test.ts`

- [ ] **Step 1：写失败测试**

```ts
describe('response size ceiling', () => {
  it('rejects a bridge response larger than the 2 MiB protocol limit', async () => {
    const flood = await startHostileBridge({
      mode: 'oversized',
      bytes: 3 * 1024 * 1024
    });

    await expect(
      bridgeGetTools({ port: flood.port, token: 't'.repeat(32) })
    ).rejects.toThrow(/too large/i);

    await flood.close();
  }, 20_000);

  it('accepts a response comfortably under the limit', async () => {
    const small = await startHostileBridge({ mode: 'oversized', bytes: 1024 });

    const result = await bridgeGetTools({
      port: small.port,
      token: 't'.repeat(32)
    });
    expect(result.tools).toEqual([]);

    await small.close();
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run test/bridgeClient.http.test.ts -t 'response size ceiling'
```

预期：第一个用例 FAIL（3 MiB 被照单全收，没有抛错）。

- [ ] **Step 3：实现流式上限**

在 `src/bridgeClient/http.ts` 中导入常量：

```ts
import {
  AT_SERIES_TOKEN_HEADER,
  BRIDGE_HOST,
  BRIDGE_MAX_BODY_BYTES,
  resolveBridgeEndpoints,
  // ... 其余保持不变
} from '../protocol/index';
```

把 `parseJsonBody` 替换为：

```ts
async function readLimitedText(res: Response): Promise<string> {
  const declared = res.headers.get('content-length');
  if (declared && Number(declared) > BRIDGE_MAX_BODY_BYTES) {
    throw new BridgeHttpError(
      `Bridge response too large: ${declared} bytes exceeds ${BRIDGE_MAX_BODY_BYTES}`,
      { code: 'INTERNAL_ERROR', status: res.status }
    );
  }

  const body = res.body;
  if (!body) {
    return '';
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > BRIDGE_MAX_BODY_BYTES) {
        // Stop pulling immediately; do not buffer the rest.
        await reader.cancel();
        throw new BridgeHttpError(
          `Bridge response too large: exceeds ${BRIDGE_MAX_BODY_BYTES} bytes`,
          { code: 'INTERNAL_ERROR', status: res.status }
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await readLimitedText(res);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
```

注意 `readLimitedText` 抛的是 `BridgeHttpError` 而非返回 `undefined`——超限是硬错误，不能被 `parseJsonBody` 现有的「解析失败返回 undefined」语义吞掉。

- [ ] **Step 4：运行测试确认通过**

```bash
npx vitest run test/bridgeClient.http.test.ts -t 'response size ceiling'
```

预期：两个用例都 PASS。

- [ ] **Step 5：全量测试**

```bash
cd ~/项目/at/at-series-mcp-hub
npm test
```

预期：全绿。特别关注 `hub.conformance.test.ts` 与 `p0a.e2e.functional.test.ts`——它们走的是真实 HTTP 路径。

- [ ] **Step 6：提交**

```bash
git add packages/mcp-hub/src/bridgeClient/http.ts packages/mcp-hub/test/bridgeClient.http.test.ts
git commit -m "fix(bridgeClient): enforce BRIDGE_MAX_BODY_BYTES on bridge responses"
```

- [ ] **Step 7：写台账**（`动机` 填「BRIDGE_MAX_BODY_BYTES 定义未用」；`契约影响` 是）

---

## Task 4：刷新失败降级，不再杀死 Hub 进程

`listBridgeRecords` 只吞 `ENOENT`，其余一律重抛；而 `hub/server.ts:599-612` 的 watch 回调与健康定时器都用 `void refreshCatalog()` 丢弃了 Promise。`EACCES`、`EMFILE`、`ENOTDIR` 中任意一个瞬时错误都会让 Hub 进程以退出码 1 终止，IDE 侧 MCP server 直接消失，且用户拿不到任何线索。

**Files:**
- Create: `packages/mcp-hub/src/hub/logger.ts`
- Create: `packages/mcp-hub/test/hub.resilience.test.ts`
- Modify: `packages/mcp-hub/src/hub/server.ts:291-368,599-612`
- Modify: `packages/mcp-hub/src/hub/main.ts:83-86`

- [ ] **Step 1：建最小 stderr logger**

stdio MCP 下 stdout 被 JSON-RPC 独占，但 **stderr 可用且会被 MCP 客户端捕获展示**。创建 `packages/mcp-hub/src/hub/logger.ts`：

```ts
/**
 * stdout belongs to the JSON-RPC transport, so all diagnostics go to stderr.
 * MCP clients surface stderr in their server logs.
 */
const LEVELS = ['silent', 'error', 'warn', 'info'] as const;
export type LogLevel = (typeof LEVELS)[number];

function resolveLevel(): LogLevel {
  const raw = process.env.AT_SERIES_LOG_LEVEL?.toLowerCase();
  return (LEVELS as readonly string[]).includes(raw ?? '')
    ? (raw as LogLevel)
    : 'warn';
}

function enabled(level: Exclude<LogLevel, 'silent'>): boolean {
  return LEVELS.indexOf(level) <= LEVELS.indexOf(resolveLevel());
}

function emit(level: Exclude<LogLevel, 'silent'>, message: string): void {
  if (!enabled(level)) return;
  process.stderr.write(`[at-series-hub] ${level}: ${message}\n`);
}

export const hubLog = {
  error: (message: string) => emit('error', message),
  warn: (message: string) => emit('warn', message),
  info: (message: string) => emit('info', message)
};

/** Never let a bridge token reach a log line. */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/([?&]token=|"token"\s*:\s*")[^&"\s]+/gi, '$1[REDACTED]');
}
```

- [ ] **Step 2：写失败测试**

创建 `packages/mcp-hub/test/hub.resilience.test.ts`：

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHubRuntime } from '../src/hub/server';

describe('catalog refresh resilience', () => {
  it('degrades instead of rejecting when the registry directory is unreadable', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-hub-resilience-'));
    // Make `bridges/cursor` a FILE where a directory is expected -> ENOTDIR.
    await fs.mkdir(path.join(home, '.at-series', 'bridges'), { recursive: true });
    await fs.writeFile(path.join(home, '.at-series', 'bridges', 'cursor'), 'not a dir');

    const runtime = await createHubRuntime({
      hostApp: 'cursor',
      hubVersion: '0.3.0',
      home
    });

    // Must resolve, not reject: a broken registry is not a fatal condition.
    const tools = await runtime.listToolsForMcp();

    // INV-6: Hub built-ins survive a registry failure.
    const names = tools.map((t) => t.name);
    expect(names).toContain('at_list_providers');
    expect(names).toContain('at_select_tools');

    await runtime.close();
  });
});
```

- [ ] **Step 3：运行确认失败**

```bash
npx vitest run test/hub.resilience.test.ts
```

预期：FAIL，抛出 `ENOTDIR`。

- [ ] **Step 4：实现降级**

在 `src/hub/server.ts` 顶部导入：

```ts
import { describeError, hubLog } from './logger';
```

把 `refreshCatalog`（:349-368）中的 `refreshCatalogOnce()` 调用包一层降级。修改 `refreshShared` 的 IIFE：

```ts
  async function refreshCatalog(): Promise<
    AggregatedCatalog & { providers: ListProvidersResult }
  > {
    refreshQueued = true;
    if (!refreshShared) {
      refreshShared = (async () => {
        let result!: AggregatedCatalog & { providers: ListProvidersResult };
        try {
          while (refreshQueued) {
            refreshQueued = false;
            try {
              result = await refreshCatalogOnce();
            } catch (err) {
              // A broken registry read must not kill the Hub process. Keep the
              // previous catalog so already-discovered tools stay routable.
              hubLog.error(`catalog refresh failed: ${describeError(err)}`);
              result = { ...catalog, providers: providersResult };
            }
          }
          return result;
        } finally {
          refreshShared = undefined;
        }
      })();
    }
    return refreshShared;
  }
```

这里依赖 `catalog` 与 `providersResult` 在 `createHubRuntime` 初始化时已有初值。确认它们在 :195-222 的状态声明处被初始化为空目录而非 `undefined`；若为 `undefined`，先给出空初值再实现本步。

- [ ] **Step 5：给两个 `void refreshCatalog()` 加显式 catch**

`src/hub/server.ts:599-612` 的 watch 回调与定时器改为：

```ts
      onChange: () => {
        if (closed) {
          return;
        }
        void refreshCatalog().catch((err) => {
          hubLog.error(`registry watch refresh failed: ${describeError(err)}`);
        });
      }
    });

    healthTimer = setInterval(() => {
      if (closed) {
        return;
      }
      void refreshCatalog().catch((err) => {
        hubLog.error(`scheduled refresh failed: ${describeError(err)}`);
      });
    }, HEALTH_REFRESH_INTERVAL_MS);
```

- [ ] **Step 6：加进程级兜底**

`src/hub/main.ts` 底部的 `main().catch(...)` 之前插入：

```ts
process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `[at-series-hub] error: unhandled rejection: ${String(reason)}\n`
  );
});

process.on('uncaughtException', (err) => {
  process.stderr.write(
    `[at-series-hub] error: uncaught exception: ${err.message}\n`
  );
});
```

这两个 handler 刻意**不**退出进程：Hub 是 IDE 的长驻子进程，一次瞬时错误不应让整套工具消失。真正致命的启动失败仍由已有的 `main().catch` 处理。

- [ ] **Step 7：运行测试确认通过**

```bash
npx vitest run test/hub.resilience.test.ts
```

预期：PASS。

- [ ] **Step 8：全量测试 + 手工确认日志可见**

```bash
cd ~/项目/at/at-series-mcp-hub
npm test
AT_SERIES_LOG_LEVEL=info npx vitest run test/hub.resilience.test.ts 2>&1 | grep at-series-hub
```

预期：测试全绿；第二条命令能看到 `[at-series-hub] error: catalog refresh failed: ...`。

- [ ] **Step 9：提交**

```bash
git add packages/mcp-hub/src/hub/logger.ts packages/mcp-hub/src/hub/server.ts packages/mcp-hub/src/hub/main.ts packages/mcp-hub/test/hub.resilience.test.ts
git commit -m "fix(hub): degrade on registry read failure instead of killing the process"
```

- [ ] **Step 10：写台账**（`动机` 填 `H3` 与 `H12` 的最小子集；`契约影响` 是——新增 `AT_SERIES_LOG_LEVEL` env）

---

## Task 5：并行化 per-bridge 探测（保持裁决确定性）

`refreshCatalogOnce`（:302-323）串行遍历所有 bridge，每个都要两次 HTTP。N 个插件时 `tools/list` 的延迟是 O(N × RTT)。改成并行后延迟降到约一次 RTT。

> **INV-5 风险点：** `aggregateTools` 依赖 `healthyBridges` 的顺序做冲突裁决的 tie-break。并行化后 Promise 的完成顺序是不确定的，**必须按原始 record 顺序装配结果**，否则同名工具的赢家会随机漂移，`tools/list` 的内容随之抖动。

**Files:**
- Modify: `packages/mcp-hub/src/hub/server.ts:299-323`
- Modify: `packages/mcp-hub/test/hub.resilience.test.ts`

- [ ] **Step 1：写确定性回归测试**

沿用 `test/hub.server.test.ts:24-42,71-80` 已确立的写法：`FsBridgePublisher` 往临时 home 里 publish 真实 registry 记录。追加到 `test/hub.resilience.test.ts`：

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsBridgePublisher } from '../src/publisher/BridgePublisher';
import type { BridgeRegistryRecord, ToolCatalogEntry } from '../src/protocol/index';
import { startFakeBridge } from './fixtures/fakeBridge';

function sharedTool(description: string): ToolCatalogEntry {
  return {
    name: 'shared_tool',
    title: 'Shared',
    description,
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  };
}

function baseRecord(
  overrides: Partial<BridgeRegistryRecord> & {
    bridgeId: string;
    pluginId: string;
    port: number;
    token: string;
  }
): BridgeRegistryRecord {
  return {
    protocolVersion: 1,
    pluginDisplayName: overrides.pluginId,
    pluginVersion: '1.0.0',
    hostApp: 'cursor',
    pid: process.pid,
    updatedAt: Date.now(),
    tools: [],
    ...overrides
  };
}

describe('parallel bridge probing', () => {
  it('keeps the same conflict winner across repeated refreshes', async () => {
    // Two providers publish the same tool name with very different response
    // delays. If probe completion order decided the winner, the exposed
    // description would flap between refreshes.
    const slow = await startFakeBridge({
      bridgeId: 'alpha-1',
      pluginId: 'at.alpha',
      beforeHealth: () => new Promise((r) => setTimeout(r, 150)),
      tools: [sharedTool('from alpha')]
    });
    const fast = await startFakeBridge({
      bridgeId: 'beta-1',
      pluginId: 'at.beta',
      tools: [sharedTool('from beta')]
    });

    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-parallel-'));

    try {
      await new FsBridgePublisher({
        home,
        bridgeId: 'alpha-1',
        hostApp: 'cursor'
      }).publish(
        baseRecord({
          bridgeId: 'alpha-1',
          pluginId: 'at.alpha',
          port: slow.port,
          token: slow.token,
          tools: [sharedTool('from alpha')]
        })
      );

      await new FsBridgePublisher({
        home,
        bridgeId: 'beta-1',
        hostApp: 'cursor'
      }).publish(
        baseRecord({
          bridgeId: 'beta-1',
          pluginId: 'at.beta',
          port: fast.port,
          token: fast.token,
          tools: [sharedTool('from beta')]
        })
      );

      const runtime = await createHubRuntime({
        hostApp: 'cursor',
        hubVersion: '0.3.0',
        home
      });

      const winnerOf = (tools: ToolCatalogEntry[]): string | undefined =>
        tools.find((t) => t.name === 'shared_tool')?.description;

      const first = winnerOf(await runtime.listToolsForMcp());
      const second = winnerOf(await runtime.listToolsForMcp());
      const third = winnerOf(await runtime.listToolsForMcp());

      expect(first).toBeDefined();
      expect(second).toBe(first);
      expect(third).toBe(first);

      await runtime.close();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
      await slow.close();
      await fast.close();
    }
  }, 20_000);
});
```

文件顶部若已导入 `createHubRuntime` 与 `describe/expect/it`（Task 4 Step 2 已加），不要重复导入。

- [ ] **Step 2：运行确认当前是通过的（串行本就确定）**

```bash
npx vitest run test/hub.resilience.test.ts -t 'parallel bridge probing'
```

预期：PASS。这是一条**保护性测试**——它现在通过，作用是在 Step 3 改成并行后仍必须通过。这与常规 TDD 的红-绿顺序不同，因为本 Task 是重构而非新增行为。

- [ ] **Step 3：实现并行探测，保持原序**

把 `src/hub/server.ts:299-323` 的循环替换为：

```ts
    type ProbeResult =
      | { kind: 'healthy'; entry: HealthyBridge }
      | { kind: 'unhealthy'; entry: UnhealthyBridgeInput };

    const probes = await Promise.all(
      records.map(async (record): Promise<ProbeResult> => {
        try {
          const health = await bridgeGetHealth(record);
          let tools = record.tools;
          try {
            const toolsResponse = await bridgeGetTools(record);
            tools = toolsResponse.tools;
          } catch {
            // Fall back to registry snapshot when live catalog fetch fails.
          }
          // Hub builtins are reserved: they never become Bridge routing winners.
          tools = tools.filter(({ name }) => !META_TOOL_NAMES.has(name));

          return {
            kind: 'healthy',
            entry: {
              record,
              tools,
              connectedTargets: connectedTargetsForBridge(health, record)
            }
          };
        } catch {
          return { kind: 'unhealthy', entry: { record, status: 'unhealthy' } };
        }
      })
    );

    // Rebuild in registry order, not completion order: aggregateTools uses
    // this ordering to break conflict ties, so a race here would make the
    // exposed tool set flap between refreshes.
    const nextHealthy: HealthyBridge[] = [];
    const nextUnhealthy: UnhealthyBridgeInput[] = [];
    for (const probe of probes) {
      if (probe.kind === 'healthy') {
        nextHealthy.push(probe.entry);
      } else {
        nextUnhealthy.push(probe.entry);
      }
    }
```

`Promise.all` 在这里是安全的：每个 probe 内部已经把异常收敛成 `unhealthy`，不会 reject。

- [ ] **Step 4：运行确定性测试**

```bash
npx vitest run test/hub.resilience.test.ts -t 'parallel bridge probing'
```

预期：仍然 PASS。若开始 flaky，说明原序装配没做对，回到 Step 3。

- [ ] **Step 5：跑三遍确认不 flaky**

```bash
for i in 1 2 3; do npx vitest run test/hub.resilience.test.ts || break; done
```

预期：三次全绿。

- [ ] **Step 6：全量测试，重点看聚合与选路**

```bash
cd ~/项目/at/at-series-mcp-hub
npm test
```

预期：全绿，特别是 `hub.aggregate.test.ts`、`hub.routing.test.ts`、`hub.conformance.test.ts`、`hub.server.test.ts`（其中 :192-279 那个「慢刷新不能复活已删除工具」的竞态用例是本次改动最敏感的回归点）。

- [ ] **Step 7：提交**

```bash
git add packages/mcp-hub/src/hub/server.ts packages/mcp-hub/test/hub.resilience.test.ts
git commit -m "perf(hub): probe bridges in parallel while preserving registry ordering"
```

- [ ] **Step 8：写台账**（`动机` 填 `H2` 的并行化部分；`核心不变量` 必须写明已核对 INV-5 且附确定性测试结果）

---

## Task 6：同步契约文档（合入门禁）

AGENTS.md §2.1 规定：触及 Bridge HTTP 行为、body 限制、publisher/helper 对外契约的变更，**必须在同一变更集内完成文档同步，否则视为未完成**。前五个 Task 触及了其中三项。

**Files:**
- Modify: `docs/protocol/v1.md` §7.1、§7.4、§7.5、§7.6、§15
- Modify: `docs/protocol/v2.md`（env 表增加 `AT_SERIES_LOG_LEVEL`）
- Modify: `docs/guides/plugin-integration.md`（若示例涉及超时/重定向）

- [ ] **Step 1：更新 §7.1 Transport**

在现有条目后追加两条：

```markdown
- Redirects: a Bridge MUST NOT respond with any `3xx` status. The Hub sends
  `redirect: 'error'` and treats a redirect as a transport failure, because a
  custom auth header would otherwise be forwarded to the redirect target.
- Body limit: **2 MiB** (`2097152` bytes) in **both** directions. A request
  over the limit -> `413`. A Bridge response over the limit is aborted by the
  Hub and surfaced as `INTERNAL_ERROR`.
```

同时把原有的「Body limit: **2 MiB** (`2097152` bytes). Exceed -> `413`」一行删除，避免两条规则并存。

- [ ] **Step 2：新增 §7.8 Hub-side timeouts**

在 §7.7「Methods summary」之后插入一节：

```markdown
### 7.8 Hub-side timeouts (normative)

The Hub aborts outbound requests that exceed these ceilings:

| Endpoint | Default timeout | On timeout |
|---|---|---|
| `GET /health` | 2 s | Bridge is marked unhealthy for this refresh |
| `GET /tools` | 5 s | Live catalog fetch fails; Hub falls back to the registry `tools` snapshot |
| `POST /invoke` | 120 s | `tools/call` returns `UNAVAILABLE` |

A Bridge SHOULD answer `/health` and `/tools` from cached state rather than
performing product I/O, so that a busy extension host does not make the whole
provider look unhealthy. `/invoke` may legitimately block on a user
confirmation dialog, which is why its ceiling is generous.

Library consumers can override any of these per call via the optional
`BridgeRequestOptions.timeoutMs` parameter on `bridgeGetHealth`,
`bridgeGetTools`, and `bridgeInvoke`.
```

- [ ] **Step 3：在 §7.4 / §7.5 / §7.6 各加一行指回 §7.8**

例如 §7.5 `GET /tools` 段落末尾加：

```markdown
Timeout: see [§7.8](#78-hub-side-timeouts-normative).
```

- [ ] **Step 4：扩充 §15 一致性测试清单**

在现有 9 条后追加：

```markdown
10. Bridge responds `302` -> Hub refuses the redirect and the redirect target
    receives no request (token must not leak)
11. Bridge accepts but never responds on `/tools` -> Hub aborts within the
    §7.8 ceiling and the rest of the catalog still resolves
12. Bridge response exceeds 2 MiB -> Hub aborts the read and reports
    `INTERNAL_ERROR` rather than buffering it
13. Registry directory unreadable (non-`ENOENT`) -> Hub keeps serving the
    previous catalog and stays alive
```

这四条正是 Task 1–4 已经写好的测试，此处只是把它们提升为对所有 Hub 实现的规范要求。

- [ ] **Step 5：v2.md 增加日志 env**

在 v2.md 的 env 表（§4.1 附近的表格）后新增一小节：

```markdown
## 7. Diagnostics

| Env | Default | Behavior |
|---|---|---|
| `AT_SERIES_LOG_LEVEL` | `warn` | `silent` / `error` / `warn` / `info`. Diagnostics go to **stderr** only; stdout is reserved for the JSON-RPC transport. Log lines MUST NOT contain Bridge tokens. |
```

- [ ] **Step 6：核对文档与实现一致**

逐条比对：文档里写的 5 s / 120 s / 2 MiB 与 `http.ts` 中的常量必须完全一致。

```bash
cd ~/项目/at/at-series-mcp-hub
grep -n 'TOOLS_TIMEOUT_MS\|INVOKE_TIMEOUT_MS\|HEALTH_TIMEOUT_MS' packages/mcp-hub/src/bridgeClient/http.ts
grep -n '5 s\|120 s\|2 s' docs/protocol/v1.md
```

数值不一致就是文档漂移，必须当场修正。

- [ ] **Step 7：确认 protocolVersion 无需升版**

Bridge wire 仍是 `1`：新增的都是 Hub 侧行为约束与对 Bridge 的澄清性要求，现有三个插件的 Bridge 均已满足（不返回 3xx、响应远小于 2 MiB、`/health` 与 `/tools` 从缓存状态回答）。在 §7.8 末尾加一句兼容性说明：

```markdown
**Compatibility:** these constraints are additive clarifications to wire
version `1`. Conforming Bridges built against the original v1 text already
satisfy them; no `protocolVersion` bump is required.
```

- [ ] **Step 8：提交**

```bash
git add docs/protocol/v1.md docs/protocol/v2.md
git commit -m "docs(protocol): specify redirect refusal, hub-side timeouts, and response size ceiling"
```

- [ ] **Step 9：回填前面五个 Task 的台账**

把 Task 1/2/3/4 台账条目里 `文档 diff` 字段的「待 Task 6」替换成实际章节号（`v1.md §7.1`、`§7.8`、`§15.10-13`、`v2.md §7`）。

- [ ] **Step 10：为本 Task 写台账**（`动机` 填「AGENTS.md §2.1 门禁」）

---

## Task 7：建 CHANGELOG、发布 0.3.0、升级三个插件

**Files:**
- Create: `packages/mcp-hub/CHANGELOG.md`
- Modify: `packages/mcp-hub/package.json`（version → `0.3.0`）
- Modify: 三个插件的 `package.json`（依赖 → `^0.3.0`）

- [ ] **Step 1：建 CHANGELOG**

创建 `packages/mcp-hub/CHANGELOG.md`：

```markdown
# Changelog

All notable changes to `@at-series/mcp-hub`.
This package is consumed by AT Terminal, AT JumpServer, and AT Grafana —
every entry below is written for those plugin authors.

## 0.3.0

### Security

- **Outbound redirects are now refused.** The Hub→Bridge client sends
  `redirect: 'error'`. Previously a `3xx` from a Bridge port would forward
  `x-at-series-token` — and, on `307`, the full tool arguments — to the
  redirect target. See [protocol/v1.md §7.1](../../docs/protocol/v1.md).
- **Bridge responses are capped at 2 MiB**, matching the request-side limit
  that v1 already specified. Oversized responses are aborted mid-stream
  instead of being buffered.

### Fixed

- `GET /tools` (5 s) and `POST /invoke` (120 s) now have abort timeouts. A
  wedged Bridge used to hang every `tools/list` and `tools/call` forever.
- A non-`ENOENT` registry read failure no longer terminates the Hub process.
  The previous catalog is retained and the error is logged to stderr.

### Added

- `BridgeRequestOptions` (exported) — optional `timeoutMs` override on
  `bridgeGetHealth`, `bridgeGetTools`, and `bridgeInvoke`.
- `AT_SERIES_LOG_LEVEL` (`silent` | `error` | `warn` | `info`, default `warn`)
  controls stderr diagnostics.

### Changed

- Bridges are probed in parallel during catalog refresh. Registry ordering is
  preserved, so conflict-tie winners are unchanged.

### Migration

No plugin code changes are required. Bridge wire `protocolVersion` stays `1`.
Verify that your Bridge answers `/health` and `/tools` from cached state
within the §7.8 ceilings rather than doing product I/O on those paths.
```

- [ ] **Step 2：升版本号**

`packages/mcp-hub/package.json` 的 `version` 从 `0.2.2` 改为 `0.3.0`。
（注意：`0.2.2` 从未发布，npm 上的 latest 是 `0.2.1`。直接跳到 `0.3.0` 反映本次的行为变更。）

- [ ] **Step 3：全量验证**

```bash
cd ~/项目/at/at-series-mcp-hub
rm -rf node_modules && npm ci
npm run typecheck && npm run build && npm run build:hub && npm test
npm audit --omit=dev --audit-level=high
```

预期：全部通过。

- [ ] **Step 4：确认包产物内容正确**

```bash
cd ~/项目/at/at-series-mcp-hub/packages/mcp-hub
npm pack --dry-run
```

预期：文件清单包含 `dist/`、`LICENSE`、`README.md`、`CHANGELOG.md`。
若 `CHANGELOG.md` 不在其中，把它加进 `package.json` 的 `files` 数组。

- [ ] **Step 5：提交并打标签**

```bash
cd ~/项目/at/at-series-mcp-hub
git add packages/mcp-hub/package.json packages/mcp-hub/CHANGELOG.md
git commit -m "release: @at-series/mcp-hub 0.3.0 outbound hardening"
git tag mcp-hub-v0.3.0
git push && git push --tags
```

- [ ] **Step 6：发布到 npm**

```bash
cd ~/项目/at/at-series-mcp-hub/packages/mcp-hub
npm publish
```

预期：发布成功。验证：

```bash
npm view @at-series/mcp-hub version
```

预期输出 `0.3.0`。

- [ ] **Step 7：三个插件升级依赖**

每个插件的 `package.json` 中 `"@at-series/mcp-hub": "^0.2.1"` 改为 `"^0.3.0"`，然后：

```bash
cd ~/项目/at/at-terminal-series
npm install
npm run typecheck && npm test
```

三仓依次执行。预期全绿——本次是纯行为加固，没有破坏性 API 变更。

- [ ] **Step 8：验证插件打包后的 hub.js 已更新**

```bash
cd ~/项目/at/at-terminal-series
npm run build:mcp
node -e "const p=require('./node_modules/@at-series/mcp-hub/package.json');console.log(p.version)"
grep -c "redirect" dist/hub.js
```

预期：版本输出 `0.3.0`；`grep -c` 返回大于 0，证明新的出站策略确实进了打包产物。

- [ ] **Step 9：三个插件各提交一次**

```bash
git add package.json package-lock.json
git commit -m "build: upgrade @at-series/mcp-hub to 0.3.0"
git push
```

- [ ] **Step 10：确认四仓 CI 全绿**

```bash
gh run list --limit 2
```

在四个仓库各执行一次，预期最新 run 均为 `success`。

- [ ] **Step 11：写台账**（`仓库` 填四个；`插件需跟改` 填「是——三插件已升 ^0.3.0 并验证」；`验证` 记录 npm 版本与 CI 结论）

---

## 阶段 1 验收

- [ ] `npx vitest run test/bridgeClient.http.test.ts` 中重定向、超时、体积三组用例全部 PASS
- [ ] `test/hub.resilience.test.ts` 连跑三次不 flaky
- [ ] `docs/protocol/v1.md` 的 §7.1 / §7.8 / §15 与 `http.ts` 的常量数值逐一一致
- [ ] `npm view @at-series/mcp-hub version` 输出 `0.3.0`
- [ ] 三个插件依赖已升至 `^0.3.0` 且 CI 全绿
- [ ] **INV 核对**：装两个插件时 `tools/list` 行为与升级前一致；工具数 > 20 时仍走渐进暴露；未 select 的 winner 工具仍可 `tools/call`
- [ ] 台账中有 7 条本阶段条目，其中 5 条 `契约影响 = 是` 的都填了真实章节号
- [ ] 手工冒烟：在 Cursor 中重启 MCP，`at_list_providers` 能正常返回，stderr 无异常日志

验收通过后编写阶段 2 计划（Hub 完整性、并发与可观测性：H4/H5/H6/H7/H8/H9/H10/H11/H12 + X1）。
