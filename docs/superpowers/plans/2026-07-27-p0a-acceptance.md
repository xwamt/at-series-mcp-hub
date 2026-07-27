# P0a Acceptance Checklist — 2026-07-27

**Status:** PASS  
**Verified at:** 2026-07-27 (Task 14 manual verification)  
**Base SHA (pre-report):** `fb82df5efc271b9c582de2bc0c7c89b01a55c0aa`  
**Package:** `@at-series/mcp-hub` `0.1.0`  
**Workspace:** `C:\Users\alan\Desktop\at-series-mcp-hub\.worktrees\p0a-mcp-hub`

## Verification commands (all exit 0)

```text
npm test -w @at-series/mcp-hub
  → Test Files  16 passed (16)
  → Tests  64 passed (64)

npm run build -w @at-series/mcp-hub
npm run build:hub -w @at-series/mcp-hub
  → Bundled hub.js (0.1.0) -> dist/hub.js
npm run typecheck -w @at-series/mcp-hub
```

## Checklist

- [x] **Single package name `@at-series/mcp-hub`**  
  Evidence: `packages/mcp-hub/package.json` `"name": "@at-series/mcp-hub"`.

- [x] **No Bridge HTTP framework for plugins (outbound client OK)**  
  Evidence: only `packages/mcp-hub/src/bridgeClient/http.ts` (Hub→Bridge client). No `createServer` / `express` / `BridgeServer` / `.listen(` under `packages/mcp-hub/src`. ADR-001 still states Hub does not ship a shared Bridge HTTP framework.

- [x] **No vscode dependency in package.json**  
  Evidence: `packages/mcp-hub/package.json` dependencies are `@modelcontextprotocol/sdk`, `js-yaml`, `semver` only; no `vscode`.

- [x] **`dist/hub.js` builds via `npm run build:hub -w @at-series/mcp-hub`**  
  Evidence: build:hub exit 0; output `Bundled hub.js (0.1.0) -> dist/hub.js`.

- [x] **Smoke: hub.js exists and size > 0**  
  Evidence: `packages/mcp-hub/dist/hub.js` exists, size `771188` bytes (avoided hanging stdio `require`).

- [x] **Conformance §15: hub.conformance.test.ts exists; npm test passes including those cases**  
  Evidence: `packages/mcp-hub/test/hub.conformance.test.ts` (9 tests); full suite 64/64 pass including conformance.

- [x] **Installer migrates old names, preserves third-party**  
  Evidence: `packages/mcp-hub/test/installer.migrate.test.ts` — strips `AT Terminal` / `AT JumpServer Terminal` (and AT-style mcp-server.js heuristics); keeps `other-server` / unrelated third-party entries.

- [x] **autoApprove only read**  
  Evidence: `packages/mcp-hub/src/installer/autoApprove.ts` + `test/installer.autoApprove.test.ts` — builtins + `risk=read` only; write/exec and missing risk excluded.

- [x] **Hub sync respects semver + hash**  
  Evidence: `packages/mcp-hub/src/publisher/HubBundleSync.ts` + `test/publisher.hubBundleSync.test.ts` — lower refused; greater overwrites; same semver + different hash overwrites; same semver + same hash no-op.

- [x] **Docs links point at packages/mcp-hub paths**  
  Evidence: `docs/protocol/v1.md` typed mirror → `packages/mcp-hub/src/protocol/index.ts`; README / AGENTS / requirements / plugin-integration cite `@at-series/mcp-hub` and `packages/mcp-hub`. Stale `packages/protocol` mentions remain only in historical plan notes under `docs/superpowers/plans/`.

- [x] **No silent protocol drift**  
  Evidence: `docs/protocol/v1.md` §8.6 election rules match `HubBundleSync.ts` (greater overwrite; equal+different hash overwrite; lower refuse; equal+same hash no-op). Protocol file clean in working tree; last intentional touch in history was scaffold/move (`9e45a93`), not an ad-hoc behavior change during this verification.

## Final test counts

| Command | Result |
|---------|--------|
| `npm test -w @at-series/mcp-hub` | **16** files, **64** tests, **0** failures |
| `npm run build -w @at-series/mcp-hub` | pass |
| `npm run build:hub -w @at-series/mcp-hub` | pass (`dist/hub.js` ~771 KiB) |
| `npm run typecheck -w @at-series/mcp-hub` | pass |

**Verdict:** P0a acceptance checklist **PASS**. Ready for P0b plugin integration against this package.
