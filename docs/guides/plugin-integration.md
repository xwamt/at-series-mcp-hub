# Plugin integration guide (Protocol v1)

This guide is for authors of a **new** AT Series capability plugin.  
Normative rules: [../protocol/v1.md](../protocol/v1.md)  
Product requirements: [../requirements.md](../requirements.md)

## What you build

You do **not** ship a standalone MCP stdio server for end users.

You ship:

1. Domain features in the VS Code extension host
2. A localhost **Bridge** (`127.0.0.1`) that executes tools
3. A **registry publisher** that registers the Bridge with Hub
4. Optional: Hub bundle sync + `AT Series` MCP config installer (if MCP-capable build)

```text
Your extension host
  鈹溾攢 Bridge HTTP  GET /health  GET /tools  POST /invoke
  鈹溾攢 publish ~/.at-series/bridges/<hostApp>/<bridgeId>.json
  鈹斺攢 (MCP build) sync ~/.at-series/mcp/hub.js
```

## Depend on the shared package

```bash
npm install @at-series/mcp-hub
```

```ts
import {
  FsBridgePublisher,
  syncHubBundle,
  ensureAtSeriesMcpConfig,
  defaultAutoApproveToolNames,
  hubJsPath,
  AT_SERIES_PROTOCOL_VERSION,
  type BridgeRegistryRecord,
  type ToolCatalogEntry
} from '@at-series/mcp-hub';
```

Hub bundle path for packaging / sync:

```ts
const bundledHub = require.resolve('@at-series/mcp-hub/hub'); // dist/hub.js
```

You still **implement your own** Bridge HTTP server. This package does not ship a Bridge framework.

## Step-by-step

### 1. Choose stable identities

| Field | Example | Rules |
|-------|---------|-------|
| `pluginId` | `at.example` | reverse-domain, stable forever |
| tool name prefix | `example_` | required for new plugins |
| `hostApp` | `cursor` | detect current IDE product |

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

- `read` -> installer may autoApprove
- `write` / `exec` -> never default autoApprove; enforce UI confirmation in plugin

### 3. Implement Bridge endpoints

Auth header: `x-at-series-token: <token>`

#### `GET /health` -> 200

Return identity + `ok: true` + optional `connectedTargets`.

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
const publisher = new FsBridgePublisher({
  bridgeId: 'window-1',
  hostApp: 'cursor'
});

await publisher.publish(record); // BridgeRegistryRecord
await publisher.updateTools(tools);
await publisher.heartbeat();
await publisher.unpublish(); // deactivate: delete file only
```

Lifecycle:

- activate/start Bridge -> `publish`
- tools change -> `updateTools`
- every <= 30s -> `heartbeat` (`updatedAt`)
- deactivate -> `unpublish` (delete file only; never delete hub.js)

### 5. Sync Hub bundle (MCP-capable builds)

On activate:

```ts
await syncHubBundle({
  version: '0.1.0',
  bundlePath: require.resolve('@at-series/mcp-hub/hub'),
  pluginId: 'at.example',
  pluginVersion: '1.2.3'
});
```

Rules: higher semver wins; same semver + different hash overwrites (hotfix); lower semver never downgrades. Do not point IDE config at your extension version path — always `~/.at-series/mcp/hub.js`.

### 6. Install MCP config once

Prefer the helper (migrates legacy AT entries; does not delete third-party servers):

```ts
await ensureAtSeriesMcpConfig({
  target: 'cursor', // 'kiro' | 'continue'
  hostApp: 'cursor',
  hubJsAbsolutePath: hubJsPath(),
  registryTools: tools as ToolCatalogEntry[]
});

const autoApprove = defaultAutoApproveToolNames(tools);
// -> risk=read names + at_list_providers
```

Resulting Cursor/Kiro shape:

```json
{
  "mcpServers": {
    "AT Series": {
      "command": "node",
      "args": ["C:/Users/<you>/.at-series/mcp/hub.js"],
      "env": {
        "AT_SERIES_HOST_APP": "cursor"
      },
      "autoApprove": ["at_list_providers", "example_ping"]
    }
  }
}
```

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
- [ ] Disabling extension removes tools without deleting hub.js
- [ ] Second AT plugin tools appear without config edits
- [ ] write/exec tools still prompt inside the IDE
- [ ] No passwords/keys in tool results

## Common failures

| Symptom | Likely cause |
|---------|----------------|
| No tools except `at_list_providers` | Bridge not published, wrong hostApp, or unhealthy Bridge |
| Tools missing after IDE switch | `AT_SERIES_HOST_APP` mismatch |
| MODULE_NOT_FOUND on MCP start | Config still points at old extension path instead of `~/.at-series/mcp/hub.js` |
| Duplicate/conflict tools | Another plugin reused your tool names |
| Cross-window wrong terminal | Target ids missing; multi-bridge routing fell back 鈥?pass `terminalId`/`serverId` |

## What you never need to change in Hub

Adding tools, changing schemas, or shipping a brand-new AT plugin should require:

- **no** Hub business code changes
- **no** new IDE MCP server entry

Only protocol-breaking changes need a `protocolVersion` bump in the Hub repo.

## Package boundary reminder

Depend on **`@at-series/mcp-hub`** for:

- protocol types
- registry publisher + hub bundle sync
- MCP config installer helper (`AT Series` + migration + read-only autoApprove)

You **implement your own** Bridge HTTP server (`GET /health`, `GET /tools`, `POST /invoke`). The Hub package does **not** ship a shared Bridge HTTP framework.

Every `risk=write|exec` tool MUST prompt (or equivalent authorize) inside the extension host.

