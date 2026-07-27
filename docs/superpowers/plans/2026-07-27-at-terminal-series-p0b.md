# AT Terminal Series (P0b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a **new** project `C:\Users\alan\Desktop\at-terminal-series` by copying `ssh-plugins`, initialize an **independent git repo**, and adapt the MCP variant to AT Series Hub Protocol v1 (`@at-series/mcp-hub` from P0a)—without modifying the original `ssh-plugins` tree or its remotes.

**Architecture:** MCP-capable builds keep credentials/confirmations in `AgentToolService` (ADR-002/003 unchanged). Extension host runs Bridge `GET /health|GET /tools|POST /invoke` on `127.0.0.1`, publishes `~/.at-series/bridges/<hostApp>/<bridgeId>.json` via `FsBridgePublisher`, syncs `hub.js` via `syncHubBundle`, and installs a single IDE MCP entry **`AT Series`**. Delete product surfaces: per-plugin `mcp-server.js` IDE entry and `languageModelTools`.

**Tech Stack:** Existing AT Terminal stack (VS Code extension, esbuild, vitest) + dependency `@at-series/mcp-hub` (file: link to P0a package during development).

**Hard constraints:**

1. **Do not edit** `C:\Users\alan\Desktop\ssh-plugins` (read-only source).
2. **New path only:** `C:\Users\alan\Desktop\at-terminal-series`.
3. **New git history** (`git init`); do **not** set `origin` to the old ssh-plugins remote.
4. Product auth stays in plugin (Trust agent / backgroundConnection / high-risk confirm / SFTP write auth).
5. Interface changes affecting Hub contract → update hub `docs/protocol/v1.md` in the **hub** repo (AGENTS §2.1)—this plan should only *consume* Protocol v1.

**Hub package pin (dev):**

```text
C:\Users\alan\Desktop\at-series-mcp-hub\.worktrees\p0a-mcp-hub\packages\mcp-hub
```

(or after merge: `...\at-series-mcp-hub\packages\mcp-hub`)

**Spec anchors:** hub `docs/requirements.md` P0b / AGENTS.md §8.1–8.2 / `docs/protocol/v1.md`.

**Out of scope:** JumpServer (P0c), series skill migration (P1), tool rename v2 (P2), changing SSH/SFTP business logic except wiring + risk metadata.

---

## File map (in `at-terminal-series`)

| Path | Action |
|------|--------|
| *(entire tree)* | Copied from ssh-plugins (exclude `.git`, `node_modules`, `dist`, `.vsix`) |
| `package.json` / `package.mcp.json` / `package.base.json` | Remove `languageModelTools` + LM activationEvents; rename display if desired; add `@at-series/mcp-hub` dep |
| `esbuild.config.mjs` | MCP variant: **stop** bundling `src/mcp/server.ts` → `dist/mcp-server.js`; copy/packaged hub.js into VSIX instead |
| `scripts/package-variant.mjs` | Ensure hub bundle lands in VSIX (`media/hub.js` or `dist/hub.js`); MCP package no longer requires mcp-server.js |
| `src/mcp/toolCatalog.ts` | **Create** — single source of tools + risk + inputSchema |
| `src/mcp/BridgeServer.ts` | Rewrite to Protocol v1 HTTP API |
| `src/mcp/BridgeDiscovery.ts` | Replace with thin wrapper around `FsBridgePublisher` **or delete** and call hub publisher from BridgeServer |
| `src/mcp/BridgeProtocol.ts` | Align types/headers with series (`x-at-series-token`); keep domain request types if still needed by schemas |
| `src/mcp/bridgeSchemas.ts` | Keep Zod for invoke args validation |
| `src/mcp/McpConfigInstaller.ts` | Replace body with `ensureAtSeriesMcpConfig` / uninstall helpers + hostApp detect |
| `src/mcp/hostApp.ts` | **Create** — detect `cursor`/`kiro`/`vscode`/… |
| `src/mcp/hubSync.ts` | **Create** — resolve packaged hub path + `syncHubBundle` |
| `src/mcp/server.ts` | **Delete** or leave unused (not built) |
| `src/mcp/BridgeClient.ts` | **Delete** (Hub owns client) |
| `src/agent/AgentTools.ts` | Stop registering `vscode.lm` tools from MCP activate path |
| `src/extension.ts` | Wire: hub sync → bridge start/publish/heartbeat → ensure AT Series config; dispose unpublish only |
| `test/mcp/**` | Rewrite for invoke/health/tools + publisher paths |
| `README` / skill pointers | Point to AT Series / hub docs; do not document per-plugin mcp-server |

---

### Task 1: Copy tree + independent git repo

**Files / dirs:**
- Create: `C:\Users\alan\Desktop\at-terminal-series\` (full copy)
- Create: `.gitignore` (ensure `node_modules/`, `dist/`, `*.vsix`, `.vscode-test/` ignored)
- Create: initial commit only in the **new** repo

- [ ] **Step 1: Copy without .git / node_modules / dist**

PowerShell:

```powershell
$src = "C:\Users\alan\Desktop\ssh-plugins"
$dst = "C:\Users\alan\Desktop\at-terminal-series"
if (Test-Path $dst) { throw "Destination already exists: $dst" }
New-Item -ItemType Directory -Path $dst | Out-Null
robocopy $src $dst /E /XD .git node_modules dist .worktrees /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }
```

- [ ] **Step 2: Verify original untouched**

```powershell
# Must still exist and be a git repo (or whatever it was); do not commit there
Test-Path "C:\Users\alan\Desktop\ssh-plugins\src\extension.ts"
```

- [ ] **Step 3: Init clean git repo in destination**

```powershell
cd C:\Users\alan\Desktop\at-terminal-series
git init
# Ensure .gitignore contains node_modules, dist, *.vsix
git add -A
git commit -m "chore: import AT Terminal snapshot for AT Series Hub adaptation"
```

**Do not** `git remote add` pointing at ssh-plugins. Remotes only when user explicitly asks later.

- [ ] **Step 4: Sanity install + existing tests baseline (expect current tests to pass or note known failures)**

```powershell
cd C:\Users\alan\Desktop\at-terminal-series
npm install
npm test
```

Record baseline. If tests fail due to missing env, fix only copy/setup issues—not Hub adaptation yet.

- [ ] **Step 5: Commit any gitignore/setup fixes**

```powershell
git commit -m "chore: normalize ignore rules after import"
```

---

### Task 2: Depend on `@at-series/mcp-hub` (file: link)

**Files:**
- Modify: `package.json` (and `package.mcp.json` if deps duplicated)
- Modify: root README note about local hub path

- [ ] **Step 1: Add dependency**

In `package.json` dependencies:

```json
"@at-series/mcp-hub": "file:../at-series-mcp-hub/.worktrees/p0a-mcp-hub/packages/mcp-hub"
```

If worktree path unavailable, use:

```json
"@at-series/mcp-hub": "file:../at-series-mcp-hub/packages/mcp-hub"
```

(only after P0a merged to that path).

- [ ] **Step 2: Build hub package once so `dist/` + `dist/hub.js` exist**

```powershell
cd C:\Users\alan\Desktop\at-series-mcp-hub\.worktrees\p0a-mcp-hub
npm install
npm run build -w @at-series/mcp-hub
npm run build:hub -w @at-series/mcp-hub
```

- [ ] **Step 3: Install in at-terminal-series**

```powershell
cd C:\Users\alan\Desktop\at-terminal-series
npm install
node -e "console.log(require.resolve('@at-series/mcp-hub'))"
node -e "console.log(require.resolve('@at-series/mcp-hub/hub'))"
```

Expected: paths resolve under hub package `dist/`.

- [ ] **Step 4: Commit**

```powershell
git commit -m "build: depend on @at-series/mcp-hub via file link"
```

---

### Task 3: Single tool catalog with `risk`

**Files:**
- Create: `src/mcp/toolCatalog.ts`
- Create: `test/mcp/toolCatalog.test.ts`
- Later tasks consume this catalog (Bridge `/tools`, publisher, autoApprove)

- [ ] **Step 1: Write failing test** listing 9 tool names + risk mapping

```ts
import { describe, it, expect } from 'vitest';
import { AT_TERMINAL_TOOL_CATALOG, AT_TERMINAL_PLUGIN_ID } from '../../src/mcp/toolCatalog';

describe('toolCatalog', () => {
  it('uses stable pluginId', () => {
    expect(AT_TERMINAL_PLUGIN_ID).toBe('at.terminal');
  });

  it('declares risk for all nine tools', () => {
    const byName = Object.fromEntries(AT_TERMINAL_TOOL_CATALOG.map((t) => [t.name, t.risk]));
    expect(byName.list_ssh_servers).toBe('read');
    expect(byName.get_terminal_context).toBe('read');
    expect(byName.sftp_list_directory).toBe('read');
    expect(byName.sftp_stat_path).toBe('read');
    expect(byName.sftp_read_file).toBe('read');
    expect(byName.sftp_write_file).toBe('write');
    expect(byName.sftp_create_file).toBe('write');
    expect(byName.sftp_create_directory).toBe('write');
    expect(byName.run_remote_command).toBe('exec');
  });
});
```

- [ ] **Step 2: Run fail → implement catalog** (titles/descriptions/schemas aligned with current `server.ts` / package.mcp.json; use `ToolCatalogEntry` from `@at-series/mcp-hub`)

```ts
import type { ToolCatalogEntry } from '@at-series/mcp-hub';

export const AT_TERMINAL_PLUGIN_ID = 'at.terminal' as const;
export const AT_TERMINAL_TOOL_CATALOG: ToolCatalogEntry[] = [ /* 9 tools */ ];
```

- [ ] **Step 3: Tests pass → commit**

```powershell
git commit -m "feat: centralize AT Terminal MCP tool catalog with risk"
```

---

### Task 4: `hostApp` detection helper

**Files:**
- Create: `src/mcp/hostApp.ts`
- Create: `test/mcp/hostApp.test.ts`

- [ ] **Step 1: Failing tests** for strings containing cursor/kiro/vscode/qoder/windsurf → canonical HostApp; unknown → `unknown`

Use pure function:

```ts
export function detectHostApp(input: {
  appName?: string;
  appRoot?: string;
  uriScheme?: string;
  extensionPath?: string;
}): HostApp
```

Port heuristics from existing `resolveIdeMcpConfigTarget` in `McpConfigInstaller.ts` (read-only from copy).

- [ ] **Step 2: Implement → pass → commit**

```powershell
git commit -m "feat: detect AT_SERIES hostApp for registry and MCP env"
```

---

### Task 5: Rewrite Bridge HTTP to Protocol v1

**Files:**
- Modify: `src/mcp/BridgeServer.ts` (major)
- Modify: `src/mcp/BridgeProtocol.ts` (token header constant → prefer series; keep domain types)
- Modify: `test/mcp/BridgeServer.test.ts` (or create if missing)

**Behavior:**

- Listen `127.0.0.1:0`
- Auth: require `x-at-series-token`; **also accept** legacy `x-at-terminal-token` during migration (P2)
- Body limit 2MiB
- `GET /health` → rich health JSON (`protocolVersion`, `bridgeId`, `pluginId`, `pluginDisplayName`, `pluginVersion`, `hostApp`, `pid`, `updatedAt`, `connectedTargets`, `toolCount`, `ok: true`)
- `GET /tools` → `{ protocolVersion: 1, tools: AT_TERMINAL_TOOL_CATALOG }`
- `POST /invoke` `{ name, arguments }` → dispatch to `AgentToolService` methods (same mapping as old `/tools/<name>`); success `{ ok: true, name, result }`; errors `{ error: { code, message, details? } }`
- Map user cancel → `USER_CANCELLED`
- Keep Zod validation from `bridgeSchemas.ts`
- **Remove** old `/tools/<name>` routes as product API (optional temporary 410 with message during one release—prefer hard cut in this new project)

- [ ] **Step 1: Write tests with http client** against BridgeServer + fake AgentToolService stub

Cover: 401 without token; health shape; tools includes risk; invoke list_ssh_servers; validation error code.

- [ ] **Step 2: Implement BridgeServer rewrite**

- [ ] **Step 3: Pass + commit**

```powershell
git commit -m "feat: Bridge HTTP health/tools/invoke for AT Series protocol"
```

---

### Task 6: Registry publish via `FsBridgePublisher`

**Files:**
- Modify: `src/mcp/BridgeServer.ts` start/dispose to publish/unpublish
- Delete or gut: `src/mcp/BridgeDiscovery.ts` (stop writing `~/.at-terminal/...`)
- Create: `test/mcp/bridgePublish.test.ts` (temp home)

- [ ] **Step 1: On start**

```ts
import {
  FsBridgePublisher,
  type BridgeRegistryRecord
} from '@at-series/mcp-hub';
import { randomUUID } from 'node:crypto';

const bridgeId = randomUUID();
const publisher = new FsBridgePublisher({ bridgeId, hostApp });
await publisher.publish({ /* full record with tools catalog, port, token, ... */ });
// heartbeat interval <= 30s: publisher.heartbeat({ capabilities: { connectedTargets } })
```

- [ ] **Step 2: On dispose** — `await publisher.unpublish()` only (never delete hub.js / MCP config)

- [ ] **Step 3: Tests** with `home` override if publisher supports it (hub `FsBridgePublisher` opts.home) — assert file under `<home>/.at-series/bridges/<hostApp>/`

- [ ] **Step 4: Commit**

```powershell
git commit -m "feat: publish AT Terminal bridges into ~/.at-series registry"
```

---

### Task 7: Hub bundle sync into VSIX + activate

**Files:**
- Create: `src/mcp/hubSync.ts`
- Modify: `esbuild.config.mjs` / `scripts/package-variant.mjs` to copy `require.resolve('@at-series/mcp-hub/hub')` → `dist/hub.js` (or `media/hub.js`) on MCP build/package
- Modify: `src/extension.ts` MCP branch: call `syncHubBundle` before/with bridge start

- [ ] **Step 1: hubSync helper**

```ts
import { syncHubBundle } from '@at-series/mcp-hub';
import * as vscode from 'vscode';

export async function syncPackagedHub(context: vscode.ExtensionContext): Promise<void> {
  const bundlePath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'hub.js').fsPath;
  const version = context.extension.packageJSON.version as string; // or hub package version — prefer hub's package version for election
  await syncHubBundle({
    version: require('@at-series/mcp-hub/package.json').version,
    bundlePath,
    pluginId: 'at.terminal',
    pluginVersion: context.extension.packageJSON.version
  });
}
```

Use hub package version for `version` field (election compares hub runtime semver).

- [ ] **Step 2: Build pipeline copies hub.js into extension package**

After `npm run build:mcp`, script:

```powershell
node -e "const fs=require('fs');const p=require.resolve('@at-series/mcp-hub/hub');fs.copyFileSync(p,'dist/hub.js')"
```

Wire into `package.json` script `build:mcp`.

- [ ] **Step 3: extension activate (MCP_ENABLED)** calls `syncPackagedHub`

- [ ] **Step 4: Unit test hubSync with temp home + fake bundle file calling syncHubBundle**

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: package and elect AT Series hub.js on MCP activate"
```

---

### Task 8: Replace MCP config installer with AT Series helper

**Files:**
- Rewrite: `src/mcp/McpConfigInstaller.ts`
- Modify: command `sshManager.installMcpConfig` title/tooltip → Install/Repair AT Series MCP Config
- Add command: Uninstall AT Series MCP Config (calls `uninstallAtSeriesMcpConfig`)
- Modify: `package.mcp.json` contributes.commands
- Modify: `src/extension.ts` ensure on activate

- [ ] **Step 1: Implement**

```ts
import {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig,
  MCP_SERVER_DISPLAY_NAME
} from '@at-series/mcp-hub';
import { detectHostApp } from './hostApp';
import { AT_TERMINAL_TOOL_CATALOG } from './toolCatalog';
import * as os from 'node:os';
import * as path from 'node:path';

export async function ensureAtSeriesConfigForCurrentIde(...): Promise<void> {
  const hostApp = detectHostApp({ ...vscode.env, extensionPath: context.extensionUri.fsPath });
  const hubJs = path.join(os.homedir(), '.at-series', 'mcp', 'hub.js');
  const target = hostApp === 'kiro' ? 'kiro' : hostApp === 'cursor' ? 'cursor' : /* continue needs workspace */ 'cursor';
  await ensureAtSeriesMcpConfig({
    target,
    hostApp,
    hubJsAbsolutePath: hubJs,
    registryTools: AT_TERMINAL_TOOL_CATALOG,
    workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
}
```

Map Continue when user runs install from Continue-detected host or explicit Continuetarget—reuse old Continue detection if present.

- [ ] **Step 2: Tests** with temp `home` — after ensure, mcp.json has only AT Series among AT entries; third-party preserved; autoApprove excludes `run_remote_command`

- [ ] **Step 3: Commit**

```powershell
git commit -m "feat: install AT Series MCP config via hub helper"
```

---

### Task 9: Remove LM tools + per-plugin mcp-server product surface

**Files:**
- Modify: `package.mcp.json` — remove entire `contributes.languageModelTools`, remove `onLanguageModelTool:*` activationEvents
- Modify: `src/extension.ts` — remove `registerAgentTools(...)` call
- Modify: `esbuild.config.mjs` — remove mcp-server bundle entry
- Modify: `scripts/package-variant.mjs` — stop requiring mcp-server.js in MCP vsix
- Delete unused: `src/mcp/server.ts`, `src/mcp/BridgeClient.ts` (if nothing imports)
- Keep: `src/agent/AgentToolService.ts` and confirmation code paths

- [ ] **Step 1: Update package.mcp.json**

- [ ] **Step 2: Update extension activate wiring**

- [ ] **Step 3: Update build scripts; `npm run build:mcp` succeeds without mcp-server.js**

- [ ] **Step 4: Grep for languageModelTools / mcp-server.js product references — must be zero in contributes/README install instructions**

```powershell
rg "languageModelTools|mcp-server\.js" package.mcp.json README.md docs src -g'!**/node_modules/**'
```

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: remove LM tools and per-plugin mcp-server entry"
```

---

### Task 10: extension lifecycle integration (end-to-end wire)

**Files:**
- Modify: `src/extension.ts` MCP block order:

1. detect hostApp  
2. `syncPackagedHub`  
3. construct `AgentToolService` (unchanged confirm policies)  
4. start `BridgeServer` (publish registry + heartbeat)  
5. `ensureAtSeriesConfigForCurrentIde`  
6. register Install/Repair + Uninstall commands  
7. dispose: stop heartbeat, `unpublish`, dispose bridge — **do not** uninstall MCP config / delete hub.js  

- [ ] **Step 1: Implement ordering + disposables**

- [ ] **Step 2: Manual smoke checklist (document in PR notes)**

1. `npm run build:mcp`  
2. Launch Extension Development Host (Cursor or VS Code)  
3. Confirm `~/.at-series/mcp/hub.js` exists  
4. Confirm bridge json under `~/.at-series/bridges/<hostApp>/`  
5. IDE MCP has `AT Series` pointing at hub.js with `AT_SERIES_HOST_APP`  
6. Agent `tools/list` shows AT Terminal tools when window alive  

- [ ] **Step 3: Commit**

```powershell
git commit -m "feat: wire AT Series hub sync, bridge publish, and MCP install on activate"
```

---

### Task 11: Rewrite MCP tests + keep AgentToolService auth tests green

**Files:**
- Update/create: `test/mcp/*.test.ts`
- Ensure existing `test/agent/**` confirmation tests still pass

- [ ] **Step 1: Port Bridge tests to invoke API**

- [ ] **Step 2: Remove tests that assert `~/.at-terminal` discovery or mcp-server installer writing `AT Terminal`**

- [ ] **Step 3: Run full suite**

```powershell
cd C:\Users\alan\Desktop\at-terminal-series
npm test
npm run build:mcp
```

Expected: all pass; dist contains `extension.js` + `hub.js`; no `mcp-server.js` required.

- [ ] **Step 4: Commit**

```powershell
git commit -m "test: align MCP suite with AT Series Hub protocol"
```

---

### Task 12: Docs + ADR pointer in new repo

**Files:**
- Update: `README.md` / `docs/features*.md` — AT Series only MCP entry
- Add: `docs/decisions/ADR-00X-at-series-hub-adaptation.md` — points to hub ADR-001; states original ssh-plugins unchanged
- Update skill folder: replace install instructions OR add README pointing to hub series skill (full skill move is P1)

- [ ] **Step 1: Docs edits**

- [ ] **Step 2: Commit**

```powershell
git commit -m "docs: document AT Series Hub adaptation for at-terminal-series"
```

---

### Task 13: P0b acceptance checklist

Verify with evidence:

- [ ] `ssh-plugins` directory git status clean / unmodified by this work
- [ ] `at-terminal-series` is its own `.git` with no old remote
- [ ] MCP build has no product dependency on `dist/mcp-server.js`
- [ ] No `languageModelTools` in package.mcp.json
- [ ] Bridge serves health/tools/invoke with series token
- [ ] Registry files under `~/.at-series/bridges/<hostApp>/`
- [ ] `syncHubBundle` elects hub.js; lower version cannot downgrade (unit covered via hub package)
- [ ] Installer writes `AT Series` + migrates `AT Terminal`; preserves third-party
- [ ] autoApprove excludes `run_remote_command` and sftp writes
- [ ] `AgentToolService` still enforces command confirm / SFTP write auth (existing tests)
- [ ] Fixture: with hub runtime + this bridge published, tools appear (optional local script using hub `createHubRuntime`)

Write results to `docs/superpowers/plans/2026-07-27-p0b-acceptance.md` inside **at-terminal-series** (create `docs/superpowers/plans` if needed).

- [ ] **Commit:** `docs: record P0b acceptance checklist`

---

## Self-review (plan)

### Spec coverage

| Requirement | Tasks |
|-------------|-------|
| Copy not modify ssh-plugins | 1 |
| Independent git | 1 |
| Consume P0a hub package | 2, 7, 8 |
| Bridge protocol v1 | 5–6 |
| tool risk + names kept | 3 |
| hostApp isolation | 4, 6, 8 |
| Remove LM + mcp-server entry | 9 |
| Keep AgentToolService auth | 5, 10, 11 |
| Installer AT Series | 8 |
| Hub sync election | 7 |
| Docs | 12–13 |

### Deferred

- P0c JumpServer copy/adapt (separate plan, same “copy don’t edit original” rule)
- Series skill content move into hub repo (P1)
- npm publish of `@at-series/mcp-hub` (still file: until user publishes)

### Risk notes for implementers

- `file:` dependency breaks if hub path moves—document in README.
- Packaging must copy **built** `hub.js` (run hub `build:hub` before extension package).
- Do not reintroduce full autoApprove of all tools (old AT Terminal bug).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-at-terminal-series-p0b.md` (in the hub worktree).

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task + reviews  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
