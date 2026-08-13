# 阶段 0：恢复可验证性 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐 Task 执行。步骤用 `- [ ]` 勾选跟踪。
> **每个 Task 的最后一步都是写台账** [`../optimization-change-log.md`](../optimization-change-log.md)，不写 = 该 Task 未完成。
> 总纲与不变量：[`2026-08-13-at-series-optimization-roadmap.md`](2026-08-13-at-series-optimization-roadmap.md)

**Goal:** 让四个仓库在干净检出后都能通过 `typecheck` 与 `test`，让 `git diff` 只显示真实改动，并用 CI 把这两条固化下来。

**Architecture:** 先加 `.gitattributes` —— 这一步不只是清理，它会让 `git add --renormalize` 之后的暂存区**只剩真实改动**，从而把「158 个文件的 diff」变成「20 个文件的 diff」，后续所有 Task 才有可 review 的基础。然后修依赖、修类型错误、补仓库卫生，最后建 CI。

**Tech Stack:** git / npm / GitHub Actions / TypeScript / vitest

**本阶段不改任何产品行为**，因此 `契约影响` 全部为「否」，无需同步 protocol 文档。

---

## 前置检查

- [ ] **确认四仓当前状态**

```bash
cd ~/项目/at
for d in at-terminal-series at-jumpserver-series at-grafana-series at-series-mcp-hub; do
  echo "=== $d ==="
  git -C $d rev-parse --abbrev-ref HEAD
  git -C $d status --porcelain | wc -l
done
```

预期：四个仓库都在各自主分支上，且有数十到上百行未提交内容。记下每个仓库的分支名，后续 CI 配置要用。

---

## 文件结构

| 文件 | 归属仓库 | 责任 |
|---|---|---|
| `.gitattributes` | terminal / jumpserver / hub（grafana 已有） | 冻结换行策略，消除 CRLF 噪声 |
| `.github/workflows/ci.yml` | 全部 4 个 | typecheck + test 门禁 |
| `.gitignore` | terminal / jumpserver / grafana / hub | 补 `.ssh-terminal-manager/`、`.tmp-*/` 缺口 |
| `package.json` | terminal / jumpserver / grafana | 统一 `@at-series/mcp-hub` 依赖来源 |
| `test/mcp/p0c.functional.e2e.test.ts` | jumpserver | 修 3 个真实类型错误 |
| `media/at-grafana-*.{png,svg}` | grafana | 纳入版本控制，修复打包 |

---

## Task 1：加 `.gitattributes`，冻结换行策略

四个仓库里只有 `at-grafana-series` 有 `.gitattributes`。其余三个缺失，导致跨 Windows / macOS 操作后整棵树显示为已修改。

**Files:**
- Create: `at-terminal-series/.gitattributes`
- Create: `at-jumpserver-series/.gitattributes`
- Create: `at-series-mcp-hub/.gitattributes`

- [ ] **Step 1：确认 grafana 的现有内容作为模板**

```bash
cat ~/项目/at/at-grafana-series/.gitattributes
```

预期输出的首行是 `# Normalize text files to LF in the repository.`，第二行是 `* text=auto eol=lf`。

- [ ] **Step 2：把同一份内容写进另外三个仓库**

三个文件内容完全一致，逐字写入以下内容（不要用 `cp`，确保三份可独立演进）：

```gitattributes
# Normalize text files to LF in the repository.
* text=auto eol=lf

# Keep Windows shell scripts CRLF where the platform expects it.
*.bat text eol=crlf
*.cmd text eol=crlf
*.ps1 text eol=crlf

# Treat packages and common binaries as binary.
*.vsix binary
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
```

- [ ] **Step 3：验证 `.gitattributes` 已生效**

```bash
cd ~/项目/at/at-terminal-series
git check-attr text eol -- src/extension.ts
```

预期输出：

```text
src/extension.ts: text: auto
src/extension.ts: eol: lf
```

- [ ] **Step 4：单独提交（三仓各一次）**

这一步必须**只**提交 `.gitattributes`，不要夹带任何其他文件。

```bash
cd ~/项目/at/at-terminal-series
git add .gitattributes
git commit -m "build: add .gitattributes to normalize line endings to LF"
```

对 `at-jumpserver-series` 和 `at-series-mcp-hub` 重复。

- [ ] **Step 5：写台账**

在 [`../optimization-change-log.md`](../optimization-change-log.md) 追加一条，`仓库` 字段填三个仓库名，`动机` 填 `X3`，`契约影响` 填「否」。

---

## Task 2：归一化换行并甄别真实改动

`.gitattributes` 就位后，`git add --renormalize` 会把工作区的 CRLF 转成 LF 再与 HEAD 比对——内容未变的文件归零，暂存区里**只剩真实改动**。这正是让后续 review 变得可能的关键一步。

**Files:**
- Modify: 四仓的全部已跟踪文本文件（仅换行）

> **这是一个人工决策点。** 四仓合计有 76 个文件存在真实内容改动（terminal 20 / jumpserver 19 / grafana 23 / hub 14），来源不明（可能是上一轮未完成的工作）。**不要自动提交，必须先给用户看。**

- [ ] **Step 1：在每个仓库执行 renormalize**

```bash
cd ~/项目/at/at-terminal-series
git add --renormalize .
git status --short
```

预期：暂存区中的文件数从上百降到 20 左右。若仍是上百个，说明 `.gitattributes` 没生效，回到 Task 1 Step 3 排查。

- [ ] **Step 2：导出可读的真实改动供人工审阅**

```bash
cd ~/项目/at/at-terminal-series
git diff --cached --stat
git diff --cached > /tmp/at-terminal-real-changes.diff
```

对四个仓库分别执行，输出到 `/tmp/at-<name>-real-changes.diff`。

- [ ] **Step 3：停下来，把四份 diff 交给用户裁决**

逐仓询问：这些未提交改动是要保留的在制品，还是应当丢弃的实验残留？特别注意这几处已知项：
- 三个插件的 `package.json` 里 `@at-series/mcp-hub` 被从 `^0.2.1` 改回了 `file:../at-series-mcp-hub/packages/mcp-hub`（Task 3 会处理，此处先不动）
- `at-jumpserver-series` 与 `at-grafana-series` 各有一个 `src/mcp/hostApp.ts` 被删除
- `at-terminal-series` 的 `test/mcp/hostApp.test.ts` 被删除

**得到明确答复前不要执行 Step 4。**

- [ ] **Step 4：按裁决结果提交**

保留的部分：

```bash
cd ~/项目/at/at-terminal-series
git commit -m "chore: normalize line endings to LF and land pending work"
```

若用户选择丢弃某些改动，先 `git restore --staged --worktree <path>` 再提交。

若某仓库的真实改动为空（只有换行变化），提交信息用：

```bash
git commit -m "style: normalize line endings to LF"
```

- [ ] **Step 5：验证噪声已消除**

```bash
cd ~/项目/at/at-terminal-series
git status --porcelain | wc -l
```

预期：`0`（或只剩未跟踪的本地文档目录）。

- [ ] **Step 6：写台账**

`动机` 填 `X3`，并在 `验证` 字段记录每仓归一化前后的文件数对比。

---

## Task 3：统一 `@at-series/mcp-hub` 依赖来源并恢复构建

三个插件的 `node_modules/@at-series/` 当前是**空目录**，`tsc --noEmit` 各报 10–11 个 `TS2307`。HEAD 的 `package.json` 用的是 npm 上的 `^0.2.1`（已发布，是当前 latest），工作区却被改回了 `file:` 路径且没有安装。

**决策：统一使用 npm 版本。** 理由：`file:` 路径依赖让 CI 和干净检出无法工作，而阶段 1 会发布 0.3.0，插件届时只需升一次版本号。Hub 本地开发用 `npm pack` + 显式安装 tarball，不污染 `package.json`。

**Files:**
- Modify: `at-terminal-series/package.json:314`
- Modify: `at-jumpserver-series/package.json:253`
- Modify: `at-grafana-series/package.json`（`dependencies` 段）

- [ ] **Step 1：确认 npm 上的可用版本**

```bash
npm view @at-series/mcp-hub versions --json
```

预期输出包含 `"0.2.1"` 且它是最后一项。若 latest 已变，用实际的 latest 替换下文的 `^0.2.1`。

- [ ] **Step 2：把三个插件的依赖改回 npm 版本**

在每个 `package.json` 的 `dependencies` 中，将

```json
"@at-series/mcp-hub": "file:../at-series-mcp-hub/packages/mcp-hub",
```

改为

```json
"@at-series/mcp-hub": "^0.2.1",
```

- [ ] **Step 3：重装依赖（必须在本机重新解析原生包）**

当前 `node_modules` 是在其他平台安装后拷贝过来的：缺 `@rollup/rollup-darwin-arm64`，且 `node_modules/.bin/tsc` 没有执行权限。必须整棵删除重装。

```bash
cd ~/项目/at/at-terminal-series
rm -rf node_modules package-lock.json
npm install
```

对 `at-jumpserver-series`、`at-grafana-series` 重复。`at-series-mcp-hub` 也要重装：

```bash
cd ~/项目/at/at-series-mcp-hub
rm -rf node_modules package-lock.json
npm install
```

- [ ] **Step 4：验证 hub 自身可构建可测**

```bash
cd ~/项目/at/at-series-mcp-hub
npm run build && npm run build:hub && npm test
```

预期：`dist/hub.js` 生成；测试全部通过。
注意 `packages/mcp-hub/test/p0a.e2e.functional.test.ts` 依赖 `dist/hub.js` 存在，所以 `build:hub` 必须先于 `npm test`。

- [ ] **Step 5：验证三个插件的 typecheck**

```bash
cd ~/项目/at/at-terminal-series && npm run typecheck
cd ~/项目/at/at-grafana-series && npm run typecheck
```

预期：这两个仓库输出为空，退出码 0。
`at-jumpserver-series` 此时仍会报 3 个错误（Task 4 处理），其余 11 个 `TS2307` 应已消失：

```bash
cd ~/项目/at/at-jumpserver-series && npm run typecheck
```

预期仅剩：

```text
test/mcp/p0c.functional.e2e.test.ts(38,7): error TS2741: Property 'zoneName' is missing ...
test/mcp/p0c.functional.e2e.test.ts(83,36): error TS7006: Parameter 't' implicitly has an 'any' type.
test/mcp/p0c.functional.e2e.test.ts(101,23): error TS2339: Property 'tools' does not exist on type 'never'.
```

- [ ] **Step 6：提交**

```bash
cd ~/项目/at/at-terminal-series
git add package.json package-lock.json
git commit -m "build: consume @at-series/mcp-hub from npm instead of a local file: path"
```

三个插件仓各提交一次；hub 仓若 `package-lock.json` 有变化也提交。

- [ ] **Step 7：写台账**

`动机` 填 `X2`。`验证` 字段记录三仓 typecheck 的实际输出。

---

## Task 4：修复 jumpserver 的三个真实类型错误

这三个错误与模块解析无关，是 `p0c` 端到端测试里的真实类型问题，Task 3 之后会独立暴露出来。

**Files:**
- Modify: `at-jumpserver-series/test/mcp/p0c.functional.e2e.test.ts:38,83,101-120`

- [ ] **Step 1：先跑一次确认错误清单**

```bash
cd ~/项目/at/at-jumpserver-series
npm run typecheck
```

记录完整输出。

- [ ] **Step 2：读取相关类型定义**

```bash
cd ~/项目/at/at-jumpserver-series
grep -n "zoneName" src/jumpserver/types.ts
```

确认 `zoneName` 在资产类型中是必填的 `string`。

- [ ] **Step 3：修 `TS2741` —— 补 `zoneName` 字段**

`test/mcp/p0c.functional.e2e.test.ts:38` 附近的资产 fixture 对象缺少 `zoneName`。在该对象字面量中补上一行：

```ts
      zoneName: 'default',
```

放在 `category` 与 `type` 之间，与类型定义的字段顺序保持一致。

- [ ] **Step 4：修 `TS7006` —— 给回调参数加类型**

`:83` 的 `(t) => ...` 缺少参数类型。先确认该数组的元素类型，然后显式标注。若数组来自 `ToolCatalogEntry[]`：

```ts
import type { ToolCatalogEntry } from '@at-series/mcp-hub';
```

并把回调改为：

```ts
      .find((t: ToolCatalogEntry) => t.name === 'jumpserver_list_assets')
```

- [ ] **Step 5：修 `TS2339` —— 消除 `never` 类型**

`:101`、`:102`、`:120` 报 `Property 'tools'/'error' does not exist on type 'never'`，说明上游变量被收窄成了 `never`（通常是对一个联合类型做了穷尽判断后仍继续访问）。为解析出的响应体声明显式类型，而不是用 `as any` 绕过：

```ts
type InvokeOk = { tools: ToolCatalogEntry[] };
type InvokeErr = { error: { code: string; message: string } };
const parsed = JSON.parse(bodyText) as InvokeOk | InvokeErr;
```

然后用类型守卫分支：

```ts
if ('error' in parsed) {
  expect(parsed.error.code).toBe('UNAUTHORIZED');
} else {
  expect(parsed.tools.length).toBeGreaterThan(0);
}
```

具体变量名以文件实际内容为准；**不要用 `any` 或 `@ts-expect-error` 掩盖**。

- [ ] **Step 6：验证 typecheck 通过**

```bash
cd ~/项目/at/at-jumpserver-series
npm run typecheck
```

预期：无输出，退出码 0。

- [ ] **Step 7：验证测试通过**

```bash
cd ~/项目/at/at-jumpserver-series
npm test
```

预期：全部通过。若 `p0c.functional.e2e.test.ts` 因端口占用等环境原因失败，记录下来但不要为此放宽类型。

- [ ] **Step 8：提交**

```bash
git add test/mcp/p0c.functional.e2e.test.ts
git commit -m "test: fix type errors in the p0c bridge e2e fixture"
```

- [ ] **Step 9：写台账**（`动机` 填 `J11`）

---

## Task 5：补齐 `.gitignore` 缺口并清理已跟踪的测试残留

两个独立问题：`at-grafana-series` 未忽略 `.ssh-terminal-manager/`（而磁盘上恰好有该目录），`at-jumpserver-series` 把 4 个含 token 字段的测试残留文件提交进了仓库。

**Files:**
- Modify: `at-grafana-series/.gitignore`
- Modify: `at-jumpserver-series/.gitignore`
- Delete（从索引）: `at-jumpserver-series/.tmp-jumpserver-bridge-*/`

- [ ] **Step 1：确认当前忽略状态**

```bash
cd ~/项目/at
for d in at-terminal-series at-jumpserver-series at-grafana-series at-series-mcp-hub; do
  printf "%-24s " "$d"
  git -C $d check-ignore -v .ssh-terminal-manager/ 2>/dev/null || echo "未忽略"
done
```

预期：只有 `at-grafana-series` 输出「未忽略」。
注意：另外三仓的忽略规则目前只存在于工作区、不在 HEAD 里，Task 2 提交后才会落地。

- [ ] **Step 2：给 grafana 补规则**

在 `at-grafana-series/.gitignore` 的「Local workspace / agent state」段落中，`.tmp-*/` 那一行之后追加：

```gitignore
.ssh-terminal-manager/
```

- [ ] **Step 3：给 jumpserver 补 `.tmp-*` 规则**

在 `at-jumpserver-series/.gitignore` 的「Local workspace and research state」段落中追加：

```gitignore
.tmp-*/
.agents/
.ssh-terminal-manager/
```

- [ ] **Step 4：确认被跟踪的测试残留**

```bash
cd ~/项目/at/at-jumpserver-series
git ls-files | grep '^\.tmp-'
```

预期输出 4 行，均为 `.tmp-jumpserver-bridge-*/.at-jumpserver-terminal/mcp-bridge.json`。

- [ ] **Step 5：查看内容确认无真实凭据**

```bash
cd ~/项目/at/at-jumpserver-series
git show HEAD:.tmp-jumpserver-bridge-client/.at-jumpserver-terminal/mcp-bridge.json
```

预期是 `{"port": 39451, "token": "secret", ...}` 这类占位值。
**若发现真实 token，停止并告知用户——需要额外做凭据轮换，而不只是删文件。**

- [ ] **Step 6：从索引移除但保留本地文件**

```bash
cd ~/项目/at/at-jumpserver-series
git rm -r --cached .tmp-jumpserver-bridge-client .tmp-jumpserver-bridge-client-error .tmp-jumpserver-bridge-discovery-invalid .tmp-jumpserver-bridge-discovery-read
```

- [ ] **Step 7：验证**

```bash
git ls-files | grep '^\.tmp-' | wc -l
git check-ignore -v .tmp-jumpserver-bridge-client/
```

预期：第一条输出 `0`；第二条命中 `.gitignore` 的 `.tmp-*/` 行。

- [ ] **Step 8：提交**

```bash
cd ~/项目/at/at-jumpserver-series
git add .gitignore
git commit -m "chore: stop tracking bridge test scratch dirs and ignore agent scratch paths"

cd ~/项目/at/at-grafana-series
git add .gitignore
git commit -m "chore: ignore .ssh-terminal-manager scratch directory"
```

- [ ] **Step 9：写台账**（`动机` 填 `J16` 与 grafana 的 `.ssh-terminal-manager` 泄漏项）

> **遗留项（不在本阶段修）：** `.ssh-terminal-manager/` 的根因是 `at-terminal-series/src/sftp/SftpEditSessionManager.ts:74` 把远程文件暂存目录放在工作区根而非 `globalStorageUri`。忽略规则只是止血，根因在阶段 4 的 T6 处理。

---

## Task 6：把 grafana 打包所需的图标纳入版本控制

`at-grafana-series/package.json` 引用了 `media/at-grafana-icon.png` 与 `media/at-grafana-activity.svg`，`scripts/package.mjs:22-24` 会硬断言它们存在，但两者都未被 git 跟踪，而已跟踪的 `media/icon.svg` 在磁盘上已被删除。结果是全新 clone 后 `npm run package` 必然失败。

**Files:**
- Add: `at-grafana-series/media/at-grafana-icon.png`、`media/at-grafana-icon.svg`、`media/at-grafana-activity.svg`
- Delete: `at-grafana-series/media/icon.svg`（已从磁盘删除，需同步索引）

- [ ] **Step 1：确认现状**

```bash
cd ~/项目/at/at-grafana-series
git ls-files media
ls -1 media
```

预期：`git ls-files` 只列出 `media/icon.svg`；`ls` 列出 `at-grafana-icon.png`、`at-grafana-icon.svg`、`at-grafana-activity.svg`。

- [ ] **Step 2：确认 `.gitignore` 不会拦截**

```bash
git check-ignore -v media/at-grafana-icon.png
```

预期：无输出（未被忽略）。若被忽略，需在 `.gitignore` 中加白名单例外。

- [ ] **Step 3：加入索引并移除失效条目**

```bash
git add media/at-grafana-icon.png media/at-grafana-icon.svg media/at-grafana-activity.svg
git rm --cached media/icon.svg
```

- [ ] **Step 4：验证打包脚本能通过断言**

```bash
npm run build && node scripts/package.mjs
```

预期：生成 `.vsix`，无「missing required asset」类报错。

- [ ] **Step 5：提交**

```bash
git add -A media
git commit -m "build: track the AT Grafana entry icons required by the packaging script"
```

- [ ] **Step 6：写台账**（`动机` 填 `G8`）

---

## Task 7：升级存在已知漏洞的依赖

`at-jumpserver-series` 有 7 个漏洞（4 个 high），其中 `ws@8.18.0` 是直接依赖且落在 `8.0.0–8.20.1` 的内存耗尽 DoS 区间。`at-series-mcp-hub` 有 2 个（经 `@modelcontextprotocol/sdk` 传入的 hono）。terminal 与 grafana 干净。

**Files:**
- Modify: `at-jumpserver-series/package.json`（`ws` 版本）
- Modify: `at-series-mcp-hub/packages/mcp-hub/package.json`（`@modelcontextprotocol/sdk` 版本）

- [ ] **Step 1：记录基线**

```bash
cd ~/项目/at/at-jumpserver-series && npm audit --omit=dev
cd ~/项目/at/at-series-mcp-hub && npm audit --omit=dev
```

保存输出，用于 Step 5 对比。

- [ ] **Step 2：升级 jumpserver 的 ws**

```bash
cd ~/项目/at/at-jumpserver-series
npm install ws@^8.20.2
```

`ws` 用于 KoKo WebSocket 终端（`src/jumpserver/JumpServerClient.ts:250-257`）。8.x 内无破坏性变更，但仍需验证。

- [ ] **Step 3：升级 hub 的 MCP SDK**

```bash
cd ~/项目/at/at-series-mcp-hub
npm view @modelcontextprotocol/sdk version
npm install @modelcontextprotocol/sdk@latest --workspace packages/mcp-hub
```

若该仓未配置 npm workspaces，改为直接在 `packages/mcp-hub` 目录内执行 `npm install`。

- [ ] **Step 4：跑测试确认无回归**

```bash
cd ~/项目/at/at-jumpserver-series && npm run typecheck && npm test
cd ~/项目/at/at-series-mcp-hub && npm run build && npm run build:hub && npm test
```

预期：全部通过。MCP SDK 升级若引入类型不兼容，**不要用 `any` 绕过**——如实修正调用点，或回退到兼容版本并在台账中记录原因。

- [ ] **Step 5：确认漏洞已清除**

```bash
cd ~/项目/at/at-jumpserver-series && npm audit --omit=dev
cd ~/项目/at/at-series-mcp-hub && npm audit --omit=dev
```

预期：high 及以上归零。若仍有 moderate 且来自传递依赖且无可用修复，记录在台账里作为已知项，不要用 `npm audit fix --force`（会引入破坏性升级）。

- [ ] **Step 6：提交**

```bash
cd ~/项目/at/at-jumpserver-series
git add package.json package-lock.json
git commit -m "fix(deps): upgrade ws past the memory-exhaustion advisory"
```

- [ ] **Step 7：写台账**（`动机` 填 `X5`，`验证` 记录 audit 前后对比）

---

## Task 8：建立最小 CI 门禁

四个仓库都没有 CI。前面七个 Task 修好的一切，没有 CI 就会重新腐化。四仓远程均在 GitHub（`github.com/xwamt/*`），用 GitHub Actions。

**Files:**
- Create: `at-terminal-series/.github/workflows/ci.yml`
- Create: `at-jumpserver-series/.github/workflows/ci.yml`
- Create: `at-grafana-series/.github/workflows/ci.yml`
- Create: `at-series-mcp-hub/.github/workflows/ci.yml`

- [ ] **Step 1：确认各仓主分支名**

```bash
cd ~/项目/at
for d in at-terminal-series at-jumpserver-series at-grafana-series at-series-mcp-hub; do
  printf "%-24s %s\n" "$d" "$(git -C $d rev-parse --abbrev-ref HEAD)"
done
```

下面的工作流同时监听 `master` 与 `main`，两种情况都覆盖。

- [ ] **Step 2：三个插件仓的工作流**

`at-terminal-series/.github/workflows/ci.yml`、`at-jumpserver-series/.github/workflows/ci.yml`、`at-grafana-series/.github/workflows/ci.yml` 三份内容相同：

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Audit production dependencies
        run: npm audit --omit=dev --audit-level=high
```

- [ ] **Step 3：hub 仓的工作流**

`at-series-mcp-hub/.github/workflows/ci.yml` 需要多两步构建——`test/p0a.e2e.functional.test.ts` 要求 `dist/hub.js` 存在：

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Build package
        run: npm run build

      - name: Build hub bundle
        run: npm run build:hub

      - name: Test
        run: npm test

      - name: Audit production dependencies
        run: npm audit --omit=dev --audit-level=high
```

- [ ] **Step 4：本地预演 CI 的每一步**

CI 里的命令要能在本地干净环境重现。逐仓验证：

```bash
cd ~/项目/at/at-terminal-series
rm -rf node_modules
npm ci
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high
```

预期：四条命令全部退出码 0。任何一条失败都必须在推 CI 前修好——CI 第一次运行就红是最糟的开局。

- [ ] **Step 5：确认 `.vscodeignore` 不会把 CI 配置打进 VSIX**

```bash
cd ~/项目/at/at-jumpserver-series
grep -n '.github' .vscodeignore
```

三个插件仓都应有 `.github/**` 一行。`at-jumpserver-series` 已有；若某仓缺失则补上。

- [ ] **Step 6：提交并推送，确认 CI 变绿**

```bash
cd ~/项目/at/at-terminal-series
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck, test, and audit gate"
git push
```

四仓依次执行，然后：

```bash
gh run list --limit 3
```

预期：每个仓库最新一次 run 的结论为 `success`。红了就修到绿为止，不要进入阶段 1。

- [ ] **Step 7：写台账**（`动机` 填 `X4`，`验证` 记录四仓 CI run 的结论）

---

## 阶段 0 验收

全部 Task 完成后逐条核对：

- [ ] 四仓 `git status --porcelain` 输出为空（或仅剩本地未跟踪文档）
- [ ] 四仓 `npm ci && npm run typecheck && npm test` 在删除 `node_modules` 后全部通过
- [ ] 四仓 GitHub Actions 最新 run 为 success
- [ ] `npm audit --omit=dev --audit-level=high` 四仓均通过
- [ ] `at-grafana-series` 执行 `npm run package` 能产出 VSIX
- [ ] `git ls-files | grep '^\.tmp-'` 在 jumpserver 输出为空
- [ ] 台账中有 8 条本阶段条目，每条的 `核心不变量` 字段均已填写
- [ ] **未改动任何产品行为**：四仓 `git log --oneline` 中本阶段提交均为 build/chore/ci/test/style 类型，无 feat/fix(产品逻辑)

验收通过后，再编写并执行[阶段 1](2026-08-13-phase1-hub-outbound-hardening.md)。
