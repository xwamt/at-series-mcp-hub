# Plugin integration guide (Protocol v1)

This guide is for authors of a **new** AT Series capability plugin.  
Normative rules: [../protocol/v1.md](../protocol/v1.md) (Bridge wire) and [../protocol/v2.md](../protocol/v2.md) (Hub progressive exposure)
Product requirements: [../requirements.md](../requirements.md)

## What you build

You do **not** ship a standalone MCP stdio server for end users.

You ship:

1. Domain features in the VS Code extension host
2. A localhost **Bridge** (`127.0.0.1`) that executes tools
3. A **registry publisher** that registers the Bridge with Hub
4. Optional: Hub bundle sync + `AT Series` MCP config installer (**MCP-capable build only**; a base-only VSIX MUST NOT publish, sync, or write MCP config)

```text
Your extension host
  ├── Bridge HTTP  GET /health  GET /tools  POST /invoke
  ├── publish ~/.at-series/bridges/<hostApp>/<bridgeId>.json
  └── (MCP build) pack dist/hub.js → sync ~/.at-series/mcp/hub.js → ensure MCP config
```

## Agent tool discovery (Hub v2)

Hub v2 may progressively expose a large tool catalog. The agent flow is:

1. Call `at_list_providers`, then `at_search_tools` (and `at_get_tool` when full schema detail is needed).
2. Call `at_select_tools` with provider IDs and/or tool names.
3. Refresh `tools/list` after `notifications/tools/list_changed`, then call selected tools as first-class MCP tools.
4. Prefer `at_clear_tool_selection` (or `replace`) at task boundaries. The Hub also auto-clears selection after idle TTL (`AT_SERIES_TOOL_SELECTION_IDLE_MS`) or optional call budget (`AT_SERIES_TOOL_SELECTION_MAX_CALLS`).

Two defaults exist for idle TTL — do not mix them up:

- **Hub runtime** (env unset): `30000` (30s)
- **Installer-written config:** `0` (disabled; Cursor workaround). See protocol [v1.md §9.1](../protocol/v1.md) and [v2.md §4.1](../protocol/v2.md)

Plugins do not implement this flow and MUST NOT pre-filter their catalogs: continue publishing the complete invocable catalog from `GET /tools` and in the registry `tools` snapshot with `protocolVersion: 1`. The Hub owns discovery mode and selection. See [Protocol v2](../protocol/v2.md).

Agent guidance for the same flow lives in the series skill [`skills/super-ops`](../../skills/super-ops/SKILL.md) (SuperOps; plugin-specific and ops appendices under `references/`). Per-plugin skills should point agents at AT Series + discover→select→call rather than a legacy per-plugin MCP entry.

## Depend on the shared package

```bash
npm install @at-series/mcp-hub
```

```ts
import {
  FsBridgePublisher,
  syncHubBundle,
  ensureAtSeriesMcpConfig,
  uninstallAtSeriesMcpConfig,
  detectHostApp,
  hubJsPath,
  createBridgeToken,
  timingSafeEqualToken,
  AT_SERIES_BRIDGE_PROTOCOL_VERSION,
  type BridgeRegistryRecord,
  type ToolCatalogEntry,
  type McpInstallerTarget
} from '@at-series/mcp-hub';
```

Do **not** import `defaultAutoApproveToolNames` for installer use. The installer already writes Hub meta-tools only; plugins MUST NOT pass a business-tool list.

You still **implement your own** Bridge HTTP server. This package does not ship a Bridge framework.

## Step-by-step

### 1. Choose stable identities

| Field | Example | Rules |
|-------|---------|-------|
| `pluginId` | `at.example` | reverse-domain, stable forever; MUST match `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$` or the Hub skips your record |
| tool name prefix | `example_` | required for new plugins; every tool name MUST match `^[a-z][a-z0-9_]*$` |
| `hostApp` | `cursor` / `joycode-editor` | use `detectHostApp({ ... })` from `@at-series/mcp-hub` (path-derived; not an IDE allowlist). MUST match `^[a-z0-9][a-z0-9._-]{0,63}$` — `detectHostApp` output always does |

`detectHostApp` **requires** an input object (`DetectHostAppInput`). A bare `detectHostApp()` call is a TypeScript error. `detectHostApp({})` compiles but returns `unknown`.

```ts
const hostApp = detectHostApp({
  appName: vscode.env.appName,
  appRoot: vscode.env.appRoot,
  uriScheme: vscode.env.uriScheme,
  extensionPath: context.extensionPath
});
```

### 2. Define tools with risk

```ts
const tools = [
  {
    name: 'example_ping',
    title: 'Example Ping',
    description: 'Connectivity check for AT Example.',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'example_run',
    title: 'Example Run',
    description: 'Run an example action after confirmation.',
    risk: 'exec',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string', minLength: 1 } },
      required: ['command']
    }
  }
] as const;
```

Risk mapping:

- `read` -> may be manually allowlisted by users; installer does **not** autoApprove business tools
- `write` / `exec` -> never default autoApprove; enforce UI confirmation in plugin

### 3. Implement Bridge endpoints

Auth header: `x-at-series-token: <token>`

Mint the token once per Bridge process and compare it in constant time. Do **not** use `===` — it short-circuits at the first differing character, so the comparison duration reveals how much of a guess was correct (protocol §7.2):

```ts
const token = createBridgeToken(); // 43-char base64url, 32 bytes of entropy

function isAuthorized(headers: http.IncomingHttpHeaders): boolean {
  const received = headers['x-at-series-token'];
  return typeof received === 'string' && timingSafeEqualToken(received, token);
}
```

`timingSafeEqualToken` returns `false` on a length mismatch instead of throwing, so it is safe to call directly on an arbitrary request header.

Transport constraints (protocol §7.1 / §7.8) — a third-party Bridge that ignores these looks flaky under Hub:

- Listen on `127.0.0.1` only; body limit **2 MiB** both directions (`413` / `PAYLOAD_TOO_LARGE`)
- MUST NOT respond with `3xx` (Hub treats redirects as transport failure so the token is not forwarded)
- `/health` SHOULD answer from cached state within **2s**; `/tools` within **5s**. `/invoke` may block on a confirmation dialog (Hub ceiling **120s**)

#### `GET /health` -> 200

Return identity + `ok: true` + optional `connectedTargets` (used for Hub load-balancing when present; otherwise the Hub falls back to registry `capabilities.connectedTargets`).

#### `GET /tools` -> 200

Return `{ protocolVersion: 1, tools: [...] }` matching what invoke supports.

#### `POST /invoke` -> 200

Body:

```json
{ "name": "example_ping", "arguments": {} }
```

Success:

```json
{ "ok": true, "name": "example_ping", "result": { "pong": true } }
```

Errors must use:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

### 4. Publish registry record

Path:

```text
~/.at-series/bridges/<hostApp>/<bridgeId>.json
```

Minimum fields: see protocol section 5.

Use `FsBridgePublisher` from `@at-series/mcp-hub`:

```ts
// MUST be a UUID and MUST match ^[a-z0-9][a-z0-9._-]{0,63}$ (protocol §4.3).
// `randomUUID()` satisfies both; do not upper-case it and do not substitute a
// user-supplied string — the path helpers throw rather than resolve one.
const bridgeId = crypto.randomUUID();

const publisher = new FsBridgePublisher({
  bridgeId,
  hostApp
});

const record: BridgeRegistryRecord = {
  protocolVersion: AT_SERIES_BRIDGE_PROTOCOL_VERSION,
  bridgeId,
  pluginId: 'at.example',
  pluginDisplayName: 'AT Example',
  pluginVersion: '1.2.3',
  hostApp,
  port: 43123, // integer 1..65535; publish the real `listen()` port
  token, // from createBridgeToken(); never log in plaintext
  pid: process.pid,
  updatedAt: Date.now(),
  tools: tools as ToolCatalogEntry[],
  capabilities: { connectedTargets: 0 }
};

await publisher.publish(record);
await publisher.updateTools(tools as ToolCatalogEntry[]);
await publisher.heartbeat(); // bumps updatedAt
await publisher.heartbeat({
  capabilities: { connectedTargets: 2 } // optional: sessions/DB connections changed
});
await publisher.unpublish(); // deactivate: delete file only
```

`heartbeat(patch?)` always refreshes `updatedAt`. Pass `capabilities` when the connected-target count changes so Hub `scoreBridge` can prefer a live window. Omitting `patch` is valid when you only need liveness.

Lifecycle:

- activate/start Bridge -> `publish`
- tools change -> `updateTools`
- every <= 30s -> `heartbeat` (`updatedAt`; optionally `capabilities`)
- deactivate -> `unpublish` (delete file only; **never** delete `hub.js`; **never** uninstall MCP config)

### 5. Pack the Hub bundle (MCP-capable builds)

Production VSIX packages usually **do not** include `node_modules/@at-series/mcp-hub`. Calling `require.resolve('@at-series/mcp-hub/hub')` at activation time then throws `MODULE_NOT_FOUND`.

Copy the bundle at **build** time (standard plugin script, not a Hub export):

```js
// scripts/copy-hub.mjs — run from the extension package root before vsce package
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const hubEntry = require.resolve('@at-series/mcp-hub/hub'); // build-time only
const hubPkg = JSON.parse(
  readFileSync(join(dirname(hubEntry), '..', 'package.json'), 'utf8')
);
const { AT_SERIES_HUB_PROTOCOL_VERSION } = require('@at-series/mcp-hub');

mkdirSync('dist', { recursive: true });
copyFileSync(hubEntry, join('dist', 'hub.js'));
writeFileSync(
  join('dist', 'hub-version.json'),
  `${JSON.stringify(
    {
      version: hubPkg.version,
      protocolVersion: AT_SERIES_HUB_PROTOCOL_VERSION
    },
    null,
    2
  )}\n`
);
```

At runtime, pass the **packaged** path into `syncHubBundle`, and read Hub semver from `dist/hub-version.json` (do not hardcode `0.1.0`):

```ts
const bundlePath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'hub.js').fsPath;
// equivalent: context.asAbsolutePath('dist/hub.js')
```

`require.resolve('@at-series/mcp-hub/hub')` remains valid for local `npm start` / `file:` links that still have `node_modules`.

### 6. Activate: sync Hub, then install MCP config

This pair is a **strict serial async dependency**. `ensureAtSeriesMcpConfig` writes `node ~/.at-series/mcp/hub.js` into the IDE config. If that file has not been elected onto disk yet, the MCP client starts with `MODULE_NOT_FOUND`.

```ts
await syncHubBundle({
  version: hubPackageVersion, // from dist/hub-version.json
  bundlePath, // packaged dist/hub.js — not require.resolve in a VSIX
  pluginId: 'at.example',
  pluginVersion: String(context.extension.packageJSON.version)
});

type HostApp = string;
function resolveMcpInstallerTarget(
  hostApp: HostApp,
  workspaceFolder?: string
): McpInstallerTarget | undefined {
  // Plugin-side helper — NOT exported from @at-series/mcp-hub.
  // Hub only accepts 'cursor' | 'kiro' | 'continue'; other hosts must skip.
  if (hostApp === 'kiro') return 'kiro';
  if (hostApp === 'cursor') return 'cursor';
  if (hostApp === 'continue') return workspaceFolder ? 'continue' : undefined;
  return undefined; // vscode, windsurf, qoder, forks: do not write
}

const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
const target = resolveMcpInstallerTarget(hostApp, workspaceFolder);
if (target) {
  await ensureAtSeriesMcpConfig({
    target,
    hostApp,
    hubJsAbsolutePath: hubJsPath(), // ~/.at-series/mcp/hub.js — the elected file
    workspaceFolder // required when target === 'continue'; Hub throws if missing
  });
}
```

Do **not** pass `registryTools`. Installer `autoApprove` is Hub meta-tools only.

Every AT plugin may call `ensure` on activate — desired shape is identical, so repeats are no-ops. Prefer exposing command-palette **Install / Repair MCP Config** and **Uninstall MCP Config** (protocol §9.4). Uninstall removes only the `AT Series` entry:

```ts
if (target) {
  await uninstallAtSeriesMcpConfig({
    target,
    workspaceFolder
  });
}
```

Deactivate MUST NOT call uninstall (protocol §5.4).

Resulting Cursor/Kiro shape:

```json
{
  "mcpServers": {
    "AT Series": {
      "command": "node",
      "args": ["C:/Users/<you>/.at-series/mcp/hub.js"],
      "env": {
        "AT_SERIES_HOST_APP": "cursor",
        "AT_SERIES_TOOL_DISCOVERY": "auto",
        "AT_SERIES_TOOL_DISCOVERY_THRESHOLD": "20",
        "AT_SERIES_TOOL_SELECTION_IDLE_MS": "0",
        "AT_SERIES_TOOL_SELECTION_MAX_CALLS": "0"
      },
      "autoApprove": [
        "at_list_providers",
        "at_search_tools",
        "at_get_tool",
        "at_select_tools",
        "at_clear_tool_selection"
      ]
    }
  }
}
```

`IDLE_MS: "0"` here is the installer override, not the Hub runtime default of 30s.

Migrate away:

- `AT Terminal`
- `AT JumpServer Terminal`
- any args ending in per-plugin `mcp-server.js` from AT installers

### 7. Remove old surfaces

- Delete product dependency on per-plugin stdio MCP entry
- Do not register `languageModelTools` for the same tools
- Point skills/docs to Hub series skill

## Verification checklist

- [ ] Only `AT Series` appears in IDE MCP config after install/repair
- [ ] `at_list_providers` shows your plugin under current hostApp
- [ ] Your tools appear in MCP `tools/list` only while extension window is alive
- [ ] Disabling extension removes tools without deleting hub.js or MCP config
- [ ] Second AT plugin tools appear without config edits
- [ ] write/exec tools still prompt inside the IDE
- [ ] No passwords/keys in tool results
- [ ] Packaged VSIX syncs `dist/hub.js` (no `require.resolve` at activate)
- [ ] Uninstall command removes only `AT Series`; vscode/windsurf skip the write

## Common failures

| Symptom | Likely cause |
|---------|----------------|
| No tools except `at_list_providers` | Bridge not published, wrong hostApp, or unhealthy Bridge |
| Your Bridge is published but never health-checked | The record was rejected at parse time: non-integer or out-of-range `port`, a non-conforming `pluginId` or tool name, or an `endpoints` override outside `^\/[A-Za-z0-9._~\-\/]*$` (protocol §4.2, §4.4, §5.2) |
| `publish()` throws `Invalid bridgeId` / `Invalid hostApp` | The value is not a single path segment. Use `randomUUID()` and `detectHostApp({ ... })` (protocol §4.1, §4.3) |
| `detectHostApp` TypeScript error | Called with no argument. Pass `{ appName, appRoot, uriScheme, extensionPath }` |
| Tools missing after IDE switch | `AT_SERIES_HOST_APP` mismatch |
| `MODULE_NOT_FOUND` on MCP start | Config still points at old extension path **or** `ensure` ran before `syncHubBundle` finished **or** VSIX used `require.resolve` instead of packaged `dist/hub.js` |
| `workspaceFolder is required when ensuring Continue MCP config` | `target: 'continue'` with no folder. Skip the write (return `undefined` from the plugin-side target mapper) |
| Duplicate/conflict tools | Another plugin reused your tool names |
| Cross-window wrong terminal | Target ids missing; multi-bridge routing fell back — pass `terminalId`/`serverId` |

## What you never need to change in Hub

Adding tools, changing schemas, or shipping a brand-new AT plugin should require:

- **no** Hub business code changes
- **no** new IDE MCP server entry

The Hub records every business `tools/call` to `~/.at-series/logs/<hostApp>/` JSONL with no plugin opt-in. Do not use that file as confirmation or authorization.

Only protocol-breaking changes need a `protocolVersion` bump in the Hub repo.

## Package boundary reminder

Depend on **`@at-series/mcp-hub`** for:

- protocol types
- registry publisher + hub bundle sync
- MCP config installer helper (`AT Series` + migration + Hub-meta autoApprove + progressive env)

You **implement your own** Bridge HTTP server (`GET /health`, `GET /tools`, `POST /invoke`). The Hub package does **not** ship a shared Bridge HTTP framework.

Plugin-side conventions that are **not** Hub exports: `scripts/copy-hub.mjs`, `resolveMcpInstallerTarget` (`hostApp` → `cursor` \| `kiro` \| `continue` \| skip).

Every `risk=write|exec` tool MUST prompt (or equivalent authorize) inside the extension host.
