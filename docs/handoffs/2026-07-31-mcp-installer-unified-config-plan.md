# Unified AT Series MCP installer config — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hub installer writes one canonical `AT Series` MCP entry (meta-only autoApprove + progressive env including `IDLE_MS=0`); plugins stop owning config content and only call Hub `ensure` idempotently.

**Architecture:** Change `buildAtSeriesMcpServerConfig` / `isSame…` in `@at-series/mcp-hub`. Update Cursor/Kiro/Continue installers via that builder. In Terminal / JumpServer / Grafana: remove catalog-based writing (`registryTools`), keep thin `ensure`/`uninstall` wrappers + activate/Install commands.

**Tech Stack:** TypeScript, Vitest, `@at-series/mcp-hub` 0.2.x → bump patch/minor as needed.

**Spec:** `docs/handoffs/2026-07-31-mcp-installer-unified-config-design.md`

---

### Task 1: Hub — failing installer tests for new shape

**Files:**
- Modify: `packages/mcp-hub/test/installer.cursor.test.ts`
- Modify: `packages/mcp-hub/test/installer.continue.test.ts`
- Modify: `packages/mcp-hub/test/installer.autoApprove.test.ts` (if installer path assertions)
- Modify: `packages/mcp-hub/test/p0a.e2e.functional.test.ts` (env/autoApprove expectations)
- Modify: `packages/mcp-hub/test/hub.conformance.test.ts` only if it asserts installer defaults incorrectly

- [ ] Update expected `env` to include discovery/selection keys; `IDLE_MS`/`MAX_CALLS` as `"0"`; `DISCOVERY`=`auto`; `THRESHOLD`=`"20"`
- [ ] Expect `autoApprove` = five meta tools only (even when `registryTools` passed)
- [ ] Add test: second ensure → `updated: false`
- [ ] Add test: stale JumpServer-style entry upgrades on ensure
- [ ] Run tests; expect failures before implementation

### Task 2: Hub — implement builder + equality

**Files:**
- Modify: `packages/mcp-hub/src/installer/serverConfig.ts`
- Modify: `packages/mcp-hub/src/installer/autoApprove.ts` (docs / optional builtins-only export)
- Modify: `packages/mcp-hub/src/protocol/index.ts` only if exporting default env constants for installer

- [ ] `buildAtSeriesMcpServerConfig` writes full env; ignores `registryTools` for autoApprove
- [ ] `isSameAtSeriesMcpServerConfig` compares all env keys
- [ ] Run installer tests → pass
- [ ] Commit hub package changes

### Task 3: Hub — docs samples

**Files:**
- Modify: `README.md`, `docs/guides/plugin-integration.md`, `skills/super-ops/references/setup.md`
- Bump `packages/mcp-hub/package.json` version (e. and root if needed)

- [ ] Samples match desired shape; note meta-only autoApprove; plugins call ensure without catalogs
- [ ] Commit

### Task 4: Plugins — strip owned writers (Terminal, JumpServer, Grafana)

For each of `at-terminal-series`, `at-jumpserver-series`, `at-grafana-series`:

**Files:**
- Modify: `src/mcp/McpConfigInstaller.ts` — remove `toolCatalog` import and `registryTools` arg
- Modify: `test/mcp/McpConfigInstaller.test.ts` (+ e2e that assert business autoApprove)
- Modify: setup skill samples if they show old autoApprove/env
- Bump `@at-series/mcp-hub` dependency when local link/pack available

- [ ] Ensure calls Hub with no registryTools
- [ ] Tests expect meta-only autoApprove + new env
- [ ] Delete any duplicate/local MCP JSON writers if present beyond Hub ensure
- [ ] Commit per repo

### Task 5: Verify

- [ ] Hub installer + plugin installer unit tests green
- [ ] Manual: ensure twice → second no-op; repair upgrades stale mcp.json

---
