# 需求实现 / 功能验证矩阵（2026-07-27）

**验证工作区：** `.worktrees/p0a-mcp-hub` @ `feature/p0a-mcp-hub`  
**新鲜命令证据（本次）：**

```text
npm run typecheck -w @at-series/mcp-hub  → exit 0
npm run build -w @at-series/mcp-hub      → exit 0
npm run build:hub -w @at-series/mcp-hub  → Bundled hub.js
npm test -w @at-series/mcp-hub           → 17 files / 67 tests / 0 fail
  (含 protocol §15 conformance 9 + P0a e2e functional 3)
```

**范围说明（重要）：**

| 范围 | 状态 |
|------|------|
| **P0a** 本仓 `@at-series/mcp-hub` | 已实现，并完成本次功能验证 |
| **P0b** `ssh-plugins` 迁入 | **未做** |
| **P0c** `jumpserver-plugins` 迁入 | **未做** |
| **P1** skill / Repair UX 打磨 | **未做**（helper 级 Uninstall 已有） |
| **P2** 工具命名双名 | **未做** |

因此：**不能**声称「整份 `requirements.md` 产品验收全部通过」。  
能声称的是：**Hub 共享包 P0a 契约与功能，在 fixture Bridge 下端到端通过。**

---

## 1. 决策表 D1–D31

| ID | 结论 | 验证状态 |
|----|------|----------|
| D1–D12, D16–D21, D24–D27, D29, D31 | Hub 侧决策 | **P0a 满足**（代码+测试） |
| D13–D15, D18, D22–D23, D28, D30 | 插件表面 / Skill / 确认补齐 | **待 P0b/P0c/P1** |
| D10 同 semver+hash | HubBundleSync | **通过** e2e + unit |
| D26 不含 Bridge 框架 | 仅有 outbound client | **通过** |

---

## 2. Hub 功能 H1–H15

| ID | 状态 | 证据 |
|----|------|------|
| H1 stdio MCP | **通过** | `main.ts` + `build:hub` → `dist/hub.js` |
| H2 名 AT Series | **通过** | `MCP_SERVER_DISPLAY_NAME` + installer |
| H3 registry 发现 | **通过** | `listBridgeRecords` + e2e |
| H4 hostApp 隔离 | **通过** | e2e kiro 仅见 builtin |
| H5 忽略无 hostApp | **通过** | registry + conformance |
| H6 不健康不贡献 | **通过** | createHubRuntime health 失败路径 |
| H7 动态 list | **通过** | refresh on list |
| H8 list_changed | **通过** | watch e2e + onToolsListChanged |
| H9 list 重算保底 | **通过** | listToolsForMcp → refreshCatalog |
| H10 invoke 路由 | **通过** | e2e example_ping |
| H11 多桥折叠选路 | **通过** | aggregate/routing + conformance |
| H12 冲突可诊断 | **通过** | conformance + at_list_providers |
| H13 at_list_providers | **通过** | e2e；无 token |
| H14 无业务凭据 | **通过** | 包内无 SSH/JS 业务 |
| H15 watch/poll | **通过** | watch.ts + tests（P1 优先级但已做） |

---

## 3. Bridge B1–B10（插件侧）

| ID | 状态 |
|----|------|
| B1–B10 | **未在真实插件落地**；本仓仅用 `fakeBridge` 模拟 Hub 对端行为。真实 AT Terminal / JumpServer Bridge 改写属 **P0b/P0c**。 |

Hub 出站客户端已强制：`127.0.0.1`、`x-at-series-token`、结构化错误解析（对 fakeBridge）。

---

## 4. 打包同步 P1–P6

| ID | 状态 |
|----|------|
| P1 VSIX 打入 hub | **待插件**（本仓产出 `dist/hub.js` 可供打入） |
| P2/P3/P6 sync 选举 | **本仓 helper 通过**（e2e syncHubBundle）；插件 activate 接线待 P0b/P0c |
| P4 base 不贡献 | **待 ssh-plugins** |
| P5 JS 可独立贡献 | **能力具备**；接线待 P0c |

---

## 5. IDE 配置 C1–C11

| ID | 状态 |
|----|------|
| C1–C7, C10–C11 | **本仓 helper 通过**（e2e Cursor/Kiro/Continue + migrate + idempotent + uninstall） |
| C8 Uninstall helper | **通过**（API 级）；插件命令挂载待插件 |
| C9 Repair 命令 | **部分**：ensure=修复写入；显式 IDE 命令待插件 |

---

## 6. 产品表面 U1–U4 / 确认 A1–A2

| ID | 状态 |
|----|------|
| U1–U3 | **待插件仓删除 LM tools / per-plugin MCP** |
| U4 系列 skill | **未迁入**（P1） |
| A1–A2 | **待插件**（D30） |

---

## 7. 验收标准 §8（产品手工项）

| # | 状态 |
|---|------|
| 1–10 真实 IDE + 真插件场景 | **不能在本阶段签过**；需 P0b/P0c 后手工验收 |
| 10 fixture 假 Bridge 聚合 | **本仓 e2e 已覆盖等价能力** |

---

## 8. 已知 P0a 硬化缺口（不挡 P0a，建议 P0b 前修）

来自终审，本次复测仍存在：

1. `GET /tools` / `POST /invoke` 无超时（仅 health 2s）
2. `hubTooOld` 诊断未写入 providers
3. invoke 对 `NOT_FOUND`/`VALIDATION_ERROR` 的同 plugin 再试（protocol SHOULD）不完整
4. 发布缺 `prepublishOnly` 强制 `build:hub`
5. `ignoredUnscopedBridgeCount` 恒 0

---

## 9. 结论

- **P0a（本仓 Hub 包）：功能验证通过（67/67 自动化测试含 e2e）。**
- **整份产品需求：未全部实现**——插件 Bridge/Installer 接线、删 LM tools、Skill、真实 IDE 联调均未完成。

下一步若要「全部需求」闭环：执行 **P0b（ssh-plugins）→ P0c（jumpserver-plugins）**，再跑 §8 手工验收清单。
