# AT Series MCP Hub P0a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the single npm package `@at-series/mcp-hub` (protocol + registry/publisher + hub stdio runtime + hub bundle sync + MCP config installer helpers) with protocol §15 conformance tests, so AT Terminal / JumpServer can depend on it without Hub business changes.

**Architecture:** IDE starts one stdio MCP process (`~/.at-series/mcp/hub.js`). Hub reads `~/.at-series/bridges/<hostApp>/*.json`, health-checks Bridges, aggregates tools, routes `tools/call` via `POST /invoke`. Plugins own all product auth (trust agent, confirmations, etc.). This package has **no** Bridge HTTP framework and **no** `vscode` dependency.

**Tech Stack:** TypeScript, Node.js ≥18, `@modelcontextprotocol/sdk`, `semver`, `js-yaml`, `esbuild` (hub.js bundle), `vitest`, Windows-first paths via `os.homedir()`.

**Spec anchors:** `docs/requirements.md` (P0a / D16 / D26), `docs/protocol/v1.md`, `AGENTS.md` §2.1 / §3–§6.

**Out of scope (separate plans):** P0b `ssh-plugins` migration, P0c `jumpserver-plugins` migration, P1 skill / Repair UX polish, P2 tool rename.

**Interface-doc gate:** Any task that changes registry/HTTP/Hub/installer contracts MUST update `docs/protocol/v1.md` (+ types) in the same commit set (`AGENTS.md` §2.1).

---

## File structure (target)

```text
packages/mcp-hub/                         # publishes as @at-series/mcp-hub
  package.json
  tsconfig.json
  vitest.config.ts
  esbuild.hub.mjs                         # builds dist/hub.js (CJS bundle)
  src/
    index.ts                              # public exports
    protocol/
      index.ts                            # moved from packages/protocol/src/index.ts
      paths.ts                            # ~/.at-series path helpers
    registry/
      types.ts                            # re-export / parse helpers
      read.ts                             # list/read/validate records
      watch.ts                            # fs watch + ≤3s poll fallback
    publisher/
      BridgePublisher.ts                  # publish/updateTools/heartbeat/unpublish
      HubBundleSync.ts                    # semver + sha256 election
    bridgeClient/
      http.ts                             # GET health/tools, POST invoke + token header
    hub/
      aggregate.ts                        # collapse tools, conflicts, routing score
      listProviders.ts                    # at_list_providers result builder
      server.ts                           # McpServer wiring
      main.ts                             # CLI entry for hub.js
    installer/
      autoApprove.ts                      # risk=read + at_list_providers
      migrate.ts                          # detect/remove old AT series MCP entries
      cursor.ts / kiro.ts / continue.ts   # write/repair/uninstall
      index.ts                            # ensureIdeMcpConfig / uninstall facade
  test/
    protocol.paths.test.ts
    registry.read.test.ts
    publisher.bridgePublisher.test.ts
    publisher.hubBundleSync.test.ts
    hub.aggregate.test.ts
    hub.routing.test.ts
    hub.conformance.test.ts               # protocol §15
    installer.autoApprove.test.ts
    installer.migrate.test.ts
    fixtures/fakeBridge.ts                # tiny http.createServer Bridge fixture
packages/protocol/                        # DELETE after move (or leave re-export shim one release)
```

Root: add workspace `package.json` with scripts `test`, `build`, `build:hub`.

---

### Task 1: Scaffold `@at-series/mcp-hub` and move protocol

**Files:**
- Create: `package.json` (repo root workspace)
- Create: `packages/mcp-hub/package.json`
- Create: `packages/mcp-hub/tsconfig.json`
- Create: `packages/mcp-hub/vitest.config.ts`
- Create: `packages/mcp-hub/src/protocol/index.ts` (content from current `packages/protocol/src/index.ts`)
- Create: `packages/mcp-hub/src/index.ts`
- Modify: `README.md` (point package path)
- Delete after verify: `packages/protocol/**` OR replace with one-line re-export README note

- [ ] **Step 1: Create root workspace package.json**

```json
{
  "name": "at-series-mcp-hub-workspace",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm test -w @at-series/mcp-hub",
    "build": "npm run build -w @at-series/mcp-hub",
    "build:hub": "npm run build:hub -w @at-series/mcp-hub",
    "typecheck": "npm run typecheck -w @at-series/mcp-hub"
  }
}
```

- [ ] **Step 2: Create packages/mcp-hub/package.json**

```json
{
  "name": "@at-series/mcp-hub",
  "version": "0.1.0",
  "description": "AT Series shared MCP Hub runtime, publisher, and installer helpers",
  "license": "UNLICENSED",
  "type": "commonjs",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./hub": "./dist/hub.js"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "build:hub": "node esbuild.hub.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "js-yaml": "^4.1.0",
    "semver": "^7.6.3"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.17.0",
    "@types/semver": "^7.5.8",
    "esbuild": "^0.25.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 3: Add tsconfig + vitest config**

`packages/mcp-hub/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

`packages/mcp-hub/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
```

- [ ] **Step 4: Move protocol source and export**

Copy `packages/protocol/src/index.ts` → `packages/mcp-hub/src/protocol/index.ts` unchanged.

`packages/mcp-hub/src/index.ts`:

```ts
export * from './protocol/index';
```

- [ ] **Step 5: Write failing smoke test for protocol export**

Create `packages/mcp-hub/test/protocol.exports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  AT_SERIES_PROTOCOL_VERSION,
  MCP_SERVER_DISPLAY_NAME,
  normalizeToolRisk,
  isAutoApproveRisk
} from '../src/index';

describe('protocol exports', () => {
  it('exposes v1 constants', () => {
    expect(AT_SERIES_PROTOCOL_VERSION).toBe(1);
    expect(MCP_SERVER_DISPLAY_NAME).toBe('AT Series');
  });

  it('treats missing risk as exec (fail closed)', () => {
    expect(normalizeToolRisk(undefined)).toBe('exec');
    expect(isAutoApproveRisk(normalizeToolRisk(undefined))).toBe(false);
  });
});
```

- [ ] **Step 6: Install and run test**

Run:

```bash
cd C:/Users/alan/Desktop/at-series-mcp-hub
npm install
npm test -w @at-series/mcp-hub
```

Expected: PASS for `protocol.exports`.

- [ ] **Step 7: Remove old packages/protocol (after path updates in docs)**

Update `docs/requirements.md` doc map + `README.md` + `docs/protocol/v1.md` typed-mirror link to `packages/mcp-hub/src/protocol/index.ts`. Delete `packages/protocol/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold @at-series/mcp-hub and move protocol types

EOF
)"
```

---

### Task 2: `~/.at-series` path helpers

**Files:**
- Create: `packages/mcp-hub/src/protocol/paths.ts`
- Create: `packages/mcp-hub/test/protocol.paths.test.ts`
- Modify: `packages/mcp-hub/src/index.ts`
- Modify: `packages/mcp-hub/src/protocol/index.ts` (re-export paths)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  atSeriesRootDir,
  bridgesDirForHostApp,
  bridgeRecordPath,
  hubJsPath,
  hubVersionPath
} from '../src/protocol/paths';

describe('paths', () => {
  it('roots under homedir/.at-series', () => {
    const root = atSeriesRootDir();
    expect(root).toBe(path.join(os.homedir(), '.at-series'));
  });

  it('scopes bridges by hostApp and bridgeId', () => {
    expect(bridgesDirForHostApp('cursor')).toBe(
      path.join(os.homedir(), '.at-series', 'bridges', 'cursor')
    );
    expect(bridgeRecordPath('cursor', 'abc')).toBe(
      path.join(os.homedir(), '.at-series', 'bridges', 'cursor', 'abc.json')
    );
  });

  it('points hub artifacts under mcp/', () => {
    expect(hubJsPath()).toBe(path.join(os.homedir(), '.at-series', 'mcp', 'hub.js'));
    expect(hubVersionPath()).toBe(
      path.join(os.homedir(), '.at-series', 'mcp', 'hub-version.json')
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npm test -w @at-series/mcp-hub -- test/protocol.paths.test.ts`  
Expected: FAIL cannot find module / exports.

- [ ] **Step 3: Implement paths.ts**

```ts
import os from 'node:os';
import path from 'node:path';
import {
  AT_SERIES_ROOT_DIRNAME,
  AT_SERIES_BRIDGES_DIRNAME,
  AT_SERIES_MCP_DIRNAME,
  AT_SERIES_HUB_FILENAME,
  AT_SERIES_HUB_VERSION_FILENAME
} from './index';

export function atSeriesRootDir(home = os.homedir()): string {
  return path.join(home, AT_SERIES_ROOT_DIRNAME);
}

export function bridgesDirForHostApp(hostApp: string, home = os.homedir()): string {
  return path.join(atSeriesRootDir(home), AT_SERIES_BRIDGES_DIRNAME, hostApp);
}

export function bridgeRecordPath(
  hostApp: string,
  bridgeId: string,
  home = os.homedir()
): string {
  return path.join(bridgesDirForHostApp(hostApp, home), `${bridgeId}.json`);
}

export function mcpDir(home = os.homedir()): string {
  return path.join(atSeriesRootDir(home), AT_SERIES_MCP_DIRNAME);
}

export function hubJsPath(home = os.homedir()): string {
  return path.join(mcpDir(home), AT_SERIES_HUB_FILENAME);
}

export function hubVersionPath(home = os.homedir()): string {
  return path.join(mcpDir(home), AT_SERIES_HUB_VERSION_FILENAME);
}
```

Re-export from `protocol/index.ts` and package `src/index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hub/src/protocol/paths.ts packages/mcp-hub/test/protocol.paths.test.ts packages/mcp-hub/src/index.ts packages/mcp-hub/src/protocol/index.ts
git commit -m "$(cat <<'EOF'
feat: add ~/.at-series path helpers

EOF
)"
```

---

### Task 3: Registry read + validate

**Files:**
- Create: `packages/mcp-hub/src/registry/read.ts`
- Create: `packages/mcp-hub/test/registry.read.test.ts`

- [ ] **Step 1: Write failing tests** (use temp dir as fake home)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listBridgeRecords } from '../src/registry/read';

async function writeRecord(home: string, hostApp: string, name: string, body: unknown) {
  const dir = path.join(home, '.at-series', 'bridges', hostApp);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), JSON.stringify(body), 'utf8');
}

describe('listBridgeRecords', () => {
  let home: string;
  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'at-series-'));
  });
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('returns valid protocolVersion=1 records for hostApp', async () => {
    await writeRecord(home, 'cursor', 'a.json', {
      protocolVersion: 1,
      bridgeId: 'a',
      pluginId: 'at.terminal',
      pluginDisplayName: 'AT Terminal',
      pluginVersion: '0.2.17',
      hostApp: 'cursor',
      port: 1234,
      token: 't'.repeat(32),
      pid: 1,
      updatedAt: 1,
      tools: []
    });
    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records).toHaveLength(1);
    expect(records[0].bridgeId).toBe('a');
  });

  it('ignores records missing hostApp field even if file under folder', async () => {
    await writeRecord(home, 'cursor', 'bad.json', {
      protocolVersion: 1,
      bridgeId: 'b',
      pluginId: 'at.terminal',
      pluginDisplayName: 'AT Terminal',
      pluginVersion: '0.2.17',
      port: 1,
      token: 't'.repeat(32),
      pid: 1,
      updatedAt: 1,
      tools: []
    });
    const records = await listBridgeRecords({ hostApp: 'cursor', home });
    expect(records).toHaveLength(0);
  });

  it('ignores other hostApp directories when querying cursor', async () => {
    await writeRecord(home, 'kiro', 'k.json', {
      protocolVersion: 1,
      bridgeId: 'k',
      pluginId: 'at.terminal',
      pluginDisplayName: 'AT Terminal',
      pluginVersion: '0.2.17',
      hostApp: 'kiro',
      port: 1,
      token: 't'.repeat(32),
      pid: 1,
      updatedAt: 1,
      tools: []
    });
    expect(await listBridgeRecords({ hostApp: 'cursor', home })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `listBridgeRecords` + `parseBridgeRegistryRecord`**

Validate required fields from protocol §5.2; skip invalid JSON; skip `protocolVersion !== 1`; skip if `record.hostApp !== requested hostApp` (defense in depth). Prefer returning `{ record, path }[]`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: read and validate bridge registry records

EOF
)"
```

---

### Task 4: BridgePublisher

**Files:**
- Create: `packages/mcp-hub/src/publisher/BridgePublisher.ts`
- Create: `packages/mcp-hub/test/publisher.bridgePublisher.test.ts`

- [ ] **Step 1: Write failing tests** for `publish`, `updateTools`, `heartbeat`, `unpublish`

Cover: creates `bridges/<hostApp>/<bridgeId>.json`; `updateTools` rewrites tools array; `heartbeat` bumps `updatedAt`; `unpublish` deletes only own file.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement class**

```ts
export class FsBridgePublisher implements BridgePublisher {
  constructor(
    private readonly opts: {
      home?: string;
      bridgeId: string;
      hostApp: string;
    }
  ) {}

  async publish(record: BridgeRegistryRecord): Promise<void> { /* mkdir 0700 when possible; write 0600; atomic write via tmp+rename */ }
  async updateTools(tools: ToolCatalogEntry[]): Promise<void> { /* read-modify-write */ }
  async heartbeat(patch?: {...}): Promise<void> { /* updatedAt = Date.now() */ }
  async unpublish(): Promise<void> { /* unlink own path only */ }
}
```

On POSIX attempt `fs.chmod` 0o700/0o600; on Windows best-effort (no throw).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Export from `src/index.ts` + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add BridgePublisher for series registry files

EOF
)"
```

---

### Task 5: HubBundleSync (semver + sha256)

**Files:**
- Create: `packages/mcp-hub/src/publisher/HubBundleSync.ts`
- Create: `packages/mcp-hub/test/publisher.hubBundleSync.test.ts`
- If clarifying text needed: update `docs/protocol/v1.md` §8.6 only if behavior differs (already specifies hash rule — keep docs in sync if API names are documented later)

- [ ] **Step 1: Write failing tests**

Cases:

1. No existing hub → write hub.js + hub-version.json, `updated: true`
2. Candidate `0.1.0` vs active `0.2.0` → `updated: false`, active stays `0.2.0`
3. Candidate `0.2.0` vs active `0.1.0` → overwrite
4. Same `0.1.0`, different sha256 → overwrite
5. Same `0.1.0`, same sha256 → `updated: false`

Use temp home; create candidate file with known content; compute sha256 in test expectations via `crypto.createHash('sha256')`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `syncHubBundle`**

```ts
import semver from 'semver';
import crypto from 'node:crypto';

export async function syncHubBundle(input: {
  version: string;
  bundlePath: string;
  pluginId: string;
  pluginVersion: string;
  home?: string;
}): Promise<{ updated: boolean; activeVersion: string }> {
  // read hub-version.json if present
  // compare semver.gt / semver.eq + hash
  // copy file + write metadata atomically
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: elect hub.js writes by semver and bundle hash

EOF
)"
```

---

### Task 6: Bridge HTTP client (Hub → Bridge)

**Files:**
- Create: `packages/mcp-hub/src/bridgeClient/http.ts`
- Create: `packages/mcp-hub/test/fixtures/fakeBridge.ts`
- Create: `packages/mcp-hub/test/bridgeClient.http.test.ts`

- [ ] **Step 1: Implement minimal fake Bridge fixture**

`fakeBridge.ts` starts `http.createServer` on `127.0.0.1:0` requiring header `x-at-series-token`, serving:

- `GET /health` → identity JSON (`ok: true`, protocolVersion 1, …)
- `GET /tools` → `{ protocolVersion: 1, tools: [...] }`
- `POST /invoke` → `{ ok: true, name, result }` or structured error

- [ ] **Step 2: Write failing client tests** (health/tools/invoke success + 401 mapping)

- [ ] **Step 3: Implement client**

```ts
export async function bridgeGetHealth(record: BridgeRegistryRecord): Promise<BridgeHealthResponse>
export async function bridgeGetTools(record: BridgeRegistryRecord): Promise<BridgeToolsResponse>
export async function bridgeInvoke(
  record: BridgeRegistryRecord,
  req: BridgeInvokeRequest
): Promise<BridgeInvokeResponse>
```

Always send `AT_SERIES_TOKEN_HEADER`. Map non-2xx JSON `error.code`. Timeout ~2s for health.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add Hub→Bridge HTTP client for health/tools/invoke

EOF
)"
```

---

### Task 7: Tool aggregation + routing

**Files:**
- Create: `packages/mcp-hub/src/hub/aggregate.ts`
- Create: `packages/mcp-hub/test/hub.aggregate.test.ts`
- Create: `packages/mcp-hub/test/hub.routing.test.ts`

- [ ] **Step 1: Write failing aggregation tests** (protocol §8.2 / §15.1–3)

1. Two pluginIds disjoint tools → both present  
2. Same pluginId two bridges same tool → one MCP tool  
3. Different pluginIds same tool name → one winner by `(connectedTargets desc, updatedAt desc)`; loser in conflicts  

- [ ] **Step 2: Implement `aggregateTools(healthyBridges: HealthyBridge[]): AggregatedCatalog`**

```ts
export type HealthyBridge = {
  record: BridgeRegistryRecord;
  tools: ToolCatalogEntry[]; // live GET /tools preferred
  connectedTargets: number;
};

export type AggregatedCatalog = {
  tools: ToolCatalogEntry[]; // plus caller adds at_list_providers
  winners: Map<string, { pluginId: string; bridges: HealthyBridge[] }>;
  conflicts: Array<{ name: string; winnerPluginId: string; loserPluginIds: string[] }>;
};
```

- [ ] **Step 3: Write failing routing tests**

`pickBridgeForTool(name)` prefers higher `connectedTargets` then newer `updatedAt`; on transport failure try next same-pluginId once.

- [ ] **Step 4: Implement `pickBridgeForTool` + `scoreBridge`**

- [ ] **Step 5: Run — expect PASS + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: aggregate and route tools across healthy bridges

EOF
)"
```

---

### Task 8: `at_list_providers` builder

**Files:**
- Create: `packages/mcp-hub/src/hub/listProviders.ts`
- Create: `packages/mcp-hub/test/hub.listProviders.test.ts`

- [ ] **Step 1: Write test** asserting shape from protocol §8.5; **MUST NOT** include tokens; includes conflicts; counts ignored unscoped if provided.

- [ ] **Step 2: Implement `buildListProvidersResult(...)`**

- [ ] **Step 3: PASS + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: build at_list_providers diagnostic result

EOF
)"
```

---

### Task 9: Hub MCP stdio server (core)

**Files:**
- Create: `packages/mcp-hub/src/hub/server.ts`
- Create: `packages/mcp-hub/src/hub/main.ts`
- Create: `packages/mcp-hub/test/hub.conformance.test.ts` (start with subset; expand in Task 11)
- Create: `packages/mcp-hub/esbuild.hub.mjs`

- [ ] **Step 1: Implement `createHubServer({ home, hostApp, hubVersion })`**

Using `@modelcontextprotocol/sdk`:

- Register tool `at_list_providers` (empty input schema, risk read)
- `ListTools` handler: refresh from registry → health → aggregate → return tools
- `CallTool` handler: builtins vs `bridgeInvoke`
- Map Bridge errors to MCP tool error text JSON (include `code`)

Read `process.env.AT_SERIES_HOST_APP` default `unknown`.

- [ ] **Step 2: Implement `main.ts` entry**

```ts
async function main() {
  const hostApp = process.env.AT_SERIES_HOST_APP ?? 'unknown';
  const server = await createHubServer({ hostApp, hubVersion: require('../../package.json').version });
  // connect stdio transport
}
main();
```

- [ ] **Step 3: esbuild.hub.mjs**

```js
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/hub/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/hub.js',
  target: 'node18'
});
```

Add npm script already defined; run `npm run build:hub -w @at-series/mcp-hub`.

- [ ] **Step 4: Integration test with two fake Bridges** (conformance #1)

Publish two registry files under temp home with different pluginIds; set `AT_SERIES_HOST_APP`; call hub aggregation API (prefer testing `createHubServer` internals / exported `refreshCatalog` rather than full stdio if awkward).

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add Hub stdio MCP server and hub.js bundle entry

EOF
)"
```

---

### Task 10: Registry watch + list_changed

**Files:**
- Create: `packages/mcp-hub/src/registry/watch.ts`
- Modify: `packages/mcp-hub/src/hub/server.ts`
- Modify: `packages/mcp-hub/test/hub.conformance.test.ts`

- [ ] **Step 1: Write test** — after `unpublish` / delete registry file, catalog drops tool and `list_changed` notification fires (spy on server notification send).

- [ ] **Step 2: Implement watch**

- Prefer `fs.watch` on `bridges/<hostApp>/`
- Fallback poll interval ≤ 3000ms if watch throws
- Debounce refresh; on catalog fingerprint change emit `notifications/tools/list_changed`
- Also re-health unhealthy every 3–5s; healthy ≤15s (protocol §8.4)

- [ ] **Step 3: PASS + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: watch bridge registry and emit tools/list_changed

EOF
)"
```

---

### Task 11: Protocol §15 conformance suite

**Files:**
- Modify: `packages/mcp-hub/test/hub.conformance.test.ts`
- Modify: `packages/mcp-hub/test/installer.autoApprove.test.ts` (if autoApprove already exists; else create stub failing tests now and finish in Task 12)

- [ ] **Step 1: Implement all nine conformance cases as vitest tests**

| # | Test name | Assertion |
|---|-----------|-----------|
| 1 | `two plugins disjoint tools` | both names in list |
| 2 | `same pluginId two bridges collapse` | one tool; invoke still ok |
| 3 | `cross pluginId name conflict` | one winner; conflict in providers |
| 4 | `wrong hostApp ignored` | kiro bridge invisible to cursor hub |
| 5 | `unscoped ignored` | missing hostApp skipped |
| 6 | `registry delete removes tools` | + list_changed spy |
| 7 | `lower hub semver cannot overwrite` | HubBundleSync |
| 8 | `autoApprove only read` | helper unit test |
| 9 | `invoke routes and maps errors` | 422/USER_CANCELLED surfaced |

- [ ] **Step 2: Run full suite**

```bash
npm test -w @at-series/mcp-hub
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
test: add protocol v1 §15 conformance coverage

EOF
)"
```

---

### Task 12: Installer helpers (Cursor / Kiro / Continue)

**Files:**
- Create: `packages/mcp-hub/src/installer/autoApprove.ts`
- Create: `packages/mcp-hub/src/installer/migrate.ts`
- Create: `packages/mcp-hub/src/installer/cursor.ts`
- Create: `packages/mcp-hub/src/installer/kiro.ts`
- Create: `packages/mcp-hub/src/installer/continueYaml.ts`
- Create: `packages/mcp-hub/src/installer/index.ts`
- Create: `packages/mcp-hub/test/installer.autoApprove.test.ts`
- Create: `packages/mcp-hub/test/installer.migrate.test.ts`
- Create: `packages/mcp-hub/test/installer.cursor.test.ts`
- Modify if needed: `docs/protocol/v1.md` §9 (only if helper API details need documenting — prefer keep normative behavior; document helper signatures in guide if new)

**Known old server names to migrate/remove:**

- `AT Terminal`
- `AT JumpServer Terminal`
- args ending with per-plugin `mcp-server.js` from AT installers

**Never delete** unrelated `mcpServers` keys.

- [ ] **Step 1: autoApprove tests + impl**

```ts
export function defaultAutoApproveToolNames(input: {
  builtin?: string[];
  registryTools: ToolCatalogEntry[];
}): string[] {
  const names = new Set<string>([...(input.builtin ?? HUB_BUILTIN_TOOL_NAMES)]);
  for (const t of input.registryTools) {
    if (isAutoApproveRisk(normalizeToolRisk(t.risk))) names.add(t.name);
  }
  return [...names].sort();
}
```

- [ ] **Step 2: migrate tests + impl** — given mcp.json with old + third-party entries, after ensure only `AT Series` + third-party remain.

- [ ] **Step 3: Cursor writer**

Path: `path.join(home, '.cursor', 'mcp.json')`  
Write:

```json
{
  "mcpServers": {
    "AT Series": {
      "command": "node",
      "args": ["<absolute hub.js with / separators>"],
      "env": { "AT_SERIES_HOST_APP": "cursor" },
      "autoApprove": ["at_list_providers", "...read tools"]
    }
  }
}
```

Idempotent: skip write if semantically equal.

- [ ] **Step 4: Kiro writer** — `~/.kiro/settings/mcp.json` same shape; `hostApp: kiro`.

- [ ] **Step 5: Continue writer** — workspace `.continue/mcpServers/at-series.yaml` via `js-yaml`; name `AT Series`.

- [ ] **Step 6: Facade**

```ts
export async function ensureAtSeriesMcpConfig(input: {
  target: 'cursor' | 'kiro' | 'continue';
  hostApp: HostApp;
  hubJsAbsolutePath: string;
  home?: string;
  workspaceFolder?: string; // required for continue
  registryTools?: ToolCatalogEntry[];
}): Promise<{ updated: boolean }>
export async function uninstallAtSeriesMcpConfig(...): Promise<{ removed: boolean }>
```

Plugins pass `hostApp` (no vscode inside package).

- [ ] **Step 7: Run installer tests + full suite PASS**

- [ ] **Step 8: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add AT Series MCP config installer for Cursor/Kiro/Continue

EOF
)"
```

---

### Task 13: Public API surface + docs alignment

**Files:**
- Modify: `packages/mcp-hub/src/index.ts`
- Modify: `README.md`
- Modify: `docs/guides/plugin-integration.md` (show imports from `@at-series/mcp-hub`)
- Modify: `AGENTS.md` layout if paths differ from reality
- Modify: `docs/requirements.md` doc map paths
- **Only if contracts changed during impl:** `docs/protocol/v1.md` (mandatory per §2.1)

- [ ] **Step 1: Finalize exports**

```ts
export * from './protocol/index';
export * from './protocol/paths';
export { listBridgeRecords } from './registry/read';
export { watchBridgeRegistry } from './registry/watch';
export { FsBridgePublisher } from './publisher/BridgePublisher';
export { syncHubBundle } from './publisher/HubBundleSync';
export {
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig,
  defaultAutoApproveToolNames
} from './installer/index';
// Do NOT export createHubServer as required plugin API; hub.js is the runtime entry.
// Optional: export for tests only via separate path if needed.
```

- [ ] **Step 2: README quick start for plugin authors** (depend on package, sync hub bundle from `require.resolve('@at-series/mcp-hub/hub')` or packaged `dist/hub.js`, publish bridge, call installer)

- [ ] **Step 3: Run `npm run build && npm run build:hub && npm test`**

Expected: typecheck/build/hub bundle/tests all green.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: align README and guides with @at-series/mcp-hub P0a API

EOF
)"
```

---

### Task 14: P0a acceptance checklist (manual)

- [ ] **Step 1: Verify against requirements P0a / protocol §15**

Checklist:

- [ ] Single package name `@at-series/mcp-hub`
- [ ] No Bridge HTTP framework in package
- [ ] No vscode dependency in package.json
- [ ] `dist/hub.js` runs under `node` (smoke: start + exit on stdin close)
- [ ] Conformance §15 all green
- [ ] Installer migrates old names, preserves third-party
- [ ] autoApprove only read
- [ ] Hub sync respects semver + hash rules
- [ ] Docs: protocol/requirements/AGENTS links point at real paths
- [ ] No silent protocol drift (if any behavior changed, protocol.md updated in same commits)

- [ ] **Step 2: Final commit only if checklist fixes needed; else stop**

---

## Self-review

### Spec coverage (P0a)

| Requirement | Task |
|-------------|------|
| Protocol types | 1 |
| Paths `~/.at-series` | 2 |
| Registry read / hostApp / ignore unscoped | 3, 11 |
| Publisher publish/heartbeat/unpublish | 4 |
| Hub bundle election semver+hash | 5, 11#7 |
| Bridge client health/tools/invoke | 6, 11#9 |
| Aggregate / conflict / multi-bridge | 7, 11#1–3 |
| `at_list_providers` | 8 |
| Hub stdio + hub.js | 9 |
| watch + list_changed | 10, 11#6 |
| Installer Cursor/Kiro/Continue + migrate + autoApprove | 12, 11#8 |
| Doc/API alignment + §2.1 gate | 13–14 |
| H14 no business creds / no Bridge framework | enforced by scope (no tasks add them) |

**Deferred (intentional):** P0b/P0c plugin migrations, P1 series skill, Repair command UX in plugins, P2 naming.

### Placeholder scan

No TBD/TODO left in tasks; each task has files, tests, impl direction, commit.

### Type consistency

- `FsBridgePublisher` implements protocol `BridgePublisher`
- `syncHubBundle` matches `HubBundleSync` signature (+ optional `home` for tests)
- Installer facade uses `HostApp` + `ToolCatalogEntry` from protocol
- Header name constant `AT_SERIES_TOKEN_HEADER` / display name `MCP_SERVER_DISPLAY_NAME`

---

## Follow-up plans (do not implement in this plan)

1. `2026-07-XX-at-terminal-hub-migration.md` (P0b) — `ssh-plugins`
2. `2026-07-XX-jumpserver-hub-migration.md` (P0c) — `jumpserver-plugins`
3. P1 skill + Repair/Uninstall command wiring in plugins
