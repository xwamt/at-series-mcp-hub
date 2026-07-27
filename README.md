# @at-series/mcp-hub

AT Series shared MCP Hub: one stdio MCP entry for all AT-family IDE plugins.

This repository is the **single source of truth** for:

- Bridge registration protocol
- Hub runtime contract
- TypeScript package `@at-series/mcp-hub` (`packages/mcp-hub`)
- Series-level MCP skill (planned, P1)

## Status

**P0a** — protocol, registry, publisher, hub runtime, and installer helpers are implemented under `packages/mcp-hub`. Plugin migrations (P0b/P0c) consume this package.

## Docs

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | **Agent implementation guide** (this repo + plugin migration checklists) |
| [docs/requirements.md](docs/requirements.md) | **Grilled product requirements** (decisions, scope, acceptance) |
| [docs/protocol/v1.md](docs/protocol/v1.md) | **Normative** interface specification (start here for new plugins) |
| [docs/guides/plugin-integration.md](docs/guides/plugin-integration.md) | Plugin integration checklist |
| [docs/decisions/ADR-001-at-series-mcp-hub.md](docs/decisions/ADR-001-at-series-mcp-hub.md) | Architecture decision record |
| [packages/mcp-hub/src/protocol/index.ts](packages/mcp-hub/src/protocol/index.ts) | Typed contracts mirroring v1 (`@at-series/mcp-hub`) |

## Product model (summary)

- IDE configures **one** MCP server: `AT Series` -> `~/.at-series/mcp/hub.js`
- Each capability plugin runs a localhost **Bridge** in the extension host
- Plugins publish bridge records under `~/.at-series/bridges/<hostApp>/`
- Hub aggregates tools dynamically and routes `tools/call` via `POST /invoke`
- Credentials, confirmations, and domain logic stay inside plugins

## Quick start (plugin authors)

### 1. Depend on the package

```json
{
  "dependencies": {
    "@at-series/mcp-hub": "^0.1.0"
  }
}
```

During local development you may use a workspace/`file:` dependency until the package is published.

### 2. Sync Hub bundle on activate

Ship the packaged hub (`dist/hub.js` from this package) inside your VSIX, then elect it into the stable path:

```ts
import { syncHubBundle, hubJsPath } from '@at-series/mcp-hub';

// Prefer the dedicated package export (CJS):
const bundledHub = require.resolve('@at-series/mcp-hub/hub');
// equivalent: .../node_modules/@at-series/mcp-hub/dist/hub.js

await syncHubBundle({
  version: '0.1.0', // hub package semver you ship
  bundlePath: bundledHub,
  pluginId: 'at.example',
  pluginVersion: '1.2.3'
});

const hubPath = hubJsPath(); // ~/.at-series/mcp/hub.js
```

Election rules: higher semver wins; same semver with different `bundleSha256` overwrites (hotfix); lower semver never downgrades.

### 3. Publish Bridge lifecycle

Implement Bridge HTTP yourself (`GET /health`, `GET /tools`, `POST /invoke`). Use the publisher only for registry files:

```ts
import {
  FsBridgePublisher,
  AT_SERIES_PROTOCOL_VERSION,
  type BridgeRegistryRecord
} from '@at-series/mcp-hub';

const publisher = new FsBridgePublisher({
  bridgeId: 'window-1',
  hostApp: 'cursor'
});

const record: BridgeRegistryRecord = {
  protocolVersion: AT_SERIES_PROTOCOL_VERSION,
  bridgeId: 'window-1',
  pluginId: 'at.example',
  pluginDisplayName: 'AT Example',
  pluginVersion: '1.2.3',
  hostApp: 'cursor',
  port: 43123,
  token: '...', // never log in plaintext
  pid: process.pid,
  updatedAt: Date.now(),
  tools: [/* ToolCatalogEntry[] with risk */]
};

await publisher.publish(record);
// every <= 30s:
await publisher.heartbeat();
// on deactivate:
await publisher.unpublish(); // deletes only your registry file
```

### 4. Ensure IDE MCP config

Write/repair the single **`AT Series`** entry (migrates legacy AT Terminal / JumpServer names; does not delete third-party servers):

```ts
import {
  ensureAtSeriesMcpConfig,
  defaultAutoApproveToolNames,
  hubJsPath
} from '@at-series/mcp-hub';

await ensureAtSeriesMcpConfig({
  target: 'cursor', // or 'kiro' | 'continue'
  hostApp: 'cursor',
  hubJsAbsolutePath: hubJsPath(),
  registryTools: myTools // used to compute read-only autoApprove
});

// autoApprove = risk=read tools + at_list_providers
const autoApprove = defaultAutoApproveToolNames(myTools);
```

### 5. Read the contracts

1. [docs/protocol/v1.md](docs/protocol/v1.md) — normative fields and behavior
2. [docs/guides/plugin-integration.md](docs/guides/plugin-integration.md) — checklist
3. [AGENTS.md](AGENTS.md) — migration rules and anti-patterns

Do **not** ship a separate per-plugin MCP stdio server or `languageModelTools` for the same tools.
