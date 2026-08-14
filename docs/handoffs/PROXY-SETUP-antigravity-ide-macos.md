# Antigravity IDE 强制走代理（macOS / 免 TUN）留档

> 编写日期：2026-08-11  
> 对应 Windows 留档：`Antigravity IDE\PROXY-SETUP.md`（本机路径示例）  
> 目标：关闭 TUN / 增强模式后，Antigravity IDE（含 Agent / language_server）仍可走本机代理

---

## 1. 与 Windows 方案的差异（先看这个）

| 项 | Windows（本机已实施） | macOS |
|----|----------------------|--------|
| 注入载体 | `version.dll`（DLL 劫持） | `*.dylib` + `DYLD_INSERT_LIBRARIES` |
| 能否直接改安装目录 | 可以，往 IDE 目录放 DLL | **通常不行**（Hardened Runtime 拦截注入） |
| 常见做法 | 同目录放 `version.dll` + `config.json` | 用 **Launcher 生成代理版副本** 或 **GUI 一键修复** |
| 参考项目 | [yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy) | [OkamiFeng/mac-antigravity-proxy-dylib](https://github.com/OkamiFeng/mac-antigravity-proxy-dylib)、[OpsinTech/AntigravityProxyLauncher](https://github.com/OpsinTech/AntigravityProxyLauncher) |

**结论：** macOS 不能照搬 Windows 的「复制 `version.dll` 到 exe 同级」；需要 dylib 注入 + 重签名，或 Proxifier / Surge 等按进程代理。

---

## 2. 问题根因（与 Windows 相同）

Antigravity IDE 含 Electron 宿主 + Go 写的 language server：

| 进程（macOS 典型名） | 是否吃系统代理 / `http.proxy` |
|----------------------|------------------------------|
| `Antigravity IDE` / Electron | 部分可以 |
| `language_server_macos_arm` / `language_server_macos_x64` | **通常不走**（Agent 失败主因） |
| 相关 `node` 子进程 | 不保证继承 |

只开 macOS「系统代理」或只改 `settings.json`，**不足以**让 Agent 稳定可用。

---

## 3. macOS 路径速查

| 用途 | 路径 |
|------|------|
| IDE 应用（常见） | `/Applications/Antigravity IDE.app` |
| Google Antigravity（另一产品） | `/Applications/Antigravity.app` |
| IDE 用户 settings | `~/Library/Application Support/Antigravity IDE/User/settings.json` |
| language_server | `Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_*` |
| MCP 配置（Antigravity 系） | `~/.gemini/config/mcp_config.json` 或 Agent 面板 → View raw config |
| language_server 日志 | `~/Library/Logs/Antigravity/language_server.log`（路径因版本可能略有不同） |

> 安装名可能是 **Antigravity IDE** 或 **Antigravity**，以 `/Applications` 里实际 App 名为准。

---

## 4. 本机代理客户端（Mac 上常见）

Mac 上一般不用 Windows 版 **v2rayN**，常见替代：

| 客户端 | 典型本地口 | 说明 |
|--------|------------|------|
| Clash Verge / Mihomo | mixed `7890`，SOCKS `7891` | 最常见 |
| Surge | 按配置 | 可用「增强模式 / 进程规则」替代注入 |
| v2rayU / Qv2ray | 常见 `1087` / `1080` | 需自己在客户端里查 |
| sing-box 独立运行 | 自定义 | 与 Windows v2rayN+sing-box 类似，**以实际监听端口为准** |

**先确认本地口再配置 Launcher**（终端示例）：

```bash
# 看谁在监听（把 7890 换成你怀疑的端口）
lsof -nP -iTCP:7890 -sTCP:LISTEN
lsof -nP -iTCP:1080 -sTCP:LISTEN

# SOCKS5 粗测（Clash 常见 7891）
curl -x socks5h://127.0.0.1:7891 -I --max-time 5 https://www.google.com

# HTTP 代理粗测（Clash mixed 常见 7890）
curl -x http://127.0.0.1:7890 -I --max-time 5 https://www.google.com
```

---

## 5. 推荐方案（按易用程度）

### 方案 A（推荐）：AntigravityProxyLauncher — GUI 一键修复 / 启动

- 仓库：[OpsinTech/AntigravityProxyLauncher](https://github.com/OpsinTech/AntigravityProxyLauncher)
- 支持：**Antigravity、Antigravity IDE、Gemini 桌面版**（macOS + Windows）
- 原理：dylib 注入 + FakeIP + 子进程同步（与 Windows 思路一致）

**步骤：**

1. 安装并打开代理客户端（Clash Verge 等），确认本地 SOCKS5/HTTP 口可用。
2. 完全退出 Antigravity IDE（含菜单栏 / Dock）。
3. 下载 Launcher 的 `.dmg`，拖入 `/Applications/`。
4. 打开 Launcher → **代理设置** → 填 `127.0.0.1` + 端口 → **检测**连通。
5. **运行状态** → 选择 **Antigravity IDE** → **修复** → **启动**。
6. **关闭 TUN**，仅用本地入站验证 Agent / 登录。

**优点：** 不用手改 dylib、不用自己 codesign。  
**注意：** IDE 升级后若代理失效，在 Launcher 里对 Antigravity IDE 再点一次 **修复**。

---

### 方案 B：mac-antigravity-proxy-dylib — Builder App 生成代理版

- 仓库：[OkamiFeng/mac-antigravity-proxy-dylib](https://github.com/OkamiFeng/mac-antigravity-proxy-dylib)
- 思路：对齐 Windows [yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)，macOS 用 dylib。
- **不修改** `/Applications/Antigravity.app`，在用户目录生成 runtime 副本。

**步骤：**

1. 原版 Antigravity 已装在 `/Applications/Antigravity.app`。
2. 从 Releases 下载 `Antigravity-Proxy.app`（Builder，体积小，不含 Google 本体）。
3. 第一次打开配置端口，例如 Clash Verge：
   - Host：`127.0.0.1`
   - SOCKS5 端口：`7890`（mixed 口）
   - 环境变量协议：`http`，端口：`7890`
4. 保存后以后双击 `Antigravity-Proxy.app` 启动代理版。
5. Runtime 生成位置示例：
   `~/Library/Application Support/Antigravity Proxy/Runtime/Antigravity-Proxy.app`

**若用的是 Antigravity IDE 而非 Google Antigravity：** 优先用方案 A（明确支持 IDE）；或查阅该仓库 Issues 是否已适配 `Antigravity IDE.app`。

**Clash 端口示例：**

| Clash 配置 | SOCKS5 端口 | env 协议 | env 端口 |
|------------|-------------|----------|----------|
| mixed 7890 | 7890 | http | 7890 |
| 独立 SOCKS 7891 | 7891 | socks5 | 7891 |

---

### 方案 C：raybz/Antigravity-Proxy — 命令行 + make

- 仓库：[raybz/Antigravity-Proxy](https://github.com/raybz/Antigravity-Proxy)
- 组合：`/etc/hosts` + SNI relay `:443` + `libantigravity.dylib` 注入
- 适合愿意自己 `make`、接受 `sudo` 改 hosts / 绑 443 的用户

```bash
git clone https://github.com/raybz/Antigravity-Proxy.git
cd Antigravity-Proxy
# 编辑 config.yaml：proxy.host / proxy.port / proxy.type
make          # build → sign → 带注入启动 Antigravity
```

升级 Antigravity 后需重新 `make sign` 或等价重签。

---

### 方案 D：商业 / 系统级按进程代理（不注入 dylib）

若已有 Surge / Proxifier 等，且 Antigravity IDE 已正常，**无需**再装注入工具：

- **Surge**：增强模式或进程规则，把 `Antigravity IDE`、`language_server_macos_*` 走代理。
- **Proxifier**：按应用名规则走 SOCKS5。

代价：可能是付费软件；规则范围需自己控，避免误伤其它 App。

---

## 6. 辅助层：IDE `settings.json`（建议仍配置）

即使用 dylib 注入，也建议在 IDE 层显式指定 HTTP 代理（与 Windows 留档一致）：

文件：`~/Library/Application Support/Antigravity IDE/User/settings.json`

```json
{
  "http.proxy": "http://127.0.0.1:7890",
  "http.proxySupport": "override",
  "http.proxyStrictSSL": false
}
```

把 `7890` 换成你 Mac 上代理客户端的 **HTTP / mixed** 口（不是盲目抄 Windows 的 `1080`）。

> 单独靠此文件 **不能** 替代 dylib / Launcher；language_server 仍会直连。

---

## 7. 故障排查：打开时报「已损坏，无法打开」

双击 `AntigravityProxyLauncher` / `.dmg` / `.app` 时若出现：

> “AntigravityProxyLauncher”已损坏，无法打开。你应该将它移到废纸篓。  
> “Edge”于今天下载了此文件。

这是 **Gatekeeper 隔离属性（quarantine）** 误报，不是安装包真坏了。社区未公证 App 从浏览器下载后常被这样拦截。

### 处理步骤

1. 弹窗点 **取消**（不要点「移到废纸篓」）。
2. 若还在 `.dmg` 里，先把 App 拖到 `/Applications`。
3. 打开「终端」，执行（路径按实际改）：

```bash
# App 已在「应用程序」
sudo xattr -rd com.apple.quarantine "/Applications/AntigravityProxyLauncher.app"

# 若还在下载目录 / 桌面，改成真实路径，例如：
# sudo xattr -rd com.apple.quarantine ~/Downloads/AntigravityProxyLauncher.app
# sudo xattr -rd com.apple.quarantine ~/Desktop/AntigravityProxyLauncher.app
```

4. 再双击打开。若仍拦，可再试：

```bash
# 右键 App →「打开」一次；或系统设置里允许
open "/Applications/AntigravityProxyLauncher.app"
```

系统设置 → **隐私与安全性** → 若出现「仍要打开」，点允许。

### 对 .dmg 本身

若挂载前就报损坏，可对 dmg 去隔离后再挂载：

```bash
xattr -d com.apple.quarantine ~/Downloads/AntigravityProxyLauncher*.dmg
# 然后双击挂载，把 .app 拖到 /Applications，再对 .app 执行上面的 -rd
```

### 备选：绕过 Gatekeeper 一次（慎用）

```bash
sudo spctl --master-disable   # 临时关闭；用完建议再开
# sudo spctl --master-enable
```

更稳妥仍是只清 quarantine，不要长期关 Gatekeeper。

---

## 8. 验证是否生效

### 7.1 Launcher / dylib 日志

- AntigravityProxyLauncher：应用内 **系统诊断** 查看日志路径。
- mac-antigravity-proxy-dylib：Builder / runtime 相关日志（见仓库 Troubleshooting）。
- 期望：注入成功、`language_server` 相关连接经 SOCKS5/HTTP。

### 7.2 代理客户端日志

在 Clash 等里应看到经代理的域名，例如：

- `accounts.google.com`
- `oauth2.googleapis.com`
- `daily-cloudcode-pa.googleapis.com`
- `generativelanguage.googleapis.com`

### 7.3 language_server 日志

```bash
tail -n 120 ~/Library/Logs/Antigravity/language_server.log
```

- `dial tcp ... i/o timeout`：Go 子进程仍直连 → 检查 Launcher 环境变量是否用了 mixed 口的 **http** 代理。
- 代理隧道成功但 Agent 报 `User location is not supported`：换节点 / 出口 IP，不是 TUN 问题。

---

## 9. 日常维护

| 场景 | 操作 |
|------|------|
| 改了 Clash 端口 | Launcher / Builder 里改端口；同步改 `settings.json` 的 `http.proxy` |
| 升级 Antigravity IDE | 完全退出 → Launcher **修复** 或 Builder 重新生成 runtime |
| 不想用注入 | 删除 runtime 副本，改用 Surge 增强 / TUN |
| 原版与代理版冲突 | **不要同时开**；退出后只开一种（见 mac-antigravity-proxy-dylib README） |

---

## 10. 风险与边界

1. **非官方组件**：dylib 注入来自社区项目，存在安全与 macOS 版本兼容风险。
2. **Hardened Runtime**：不能直接对 `/Applications/...app` 硬注入，必须副本 + 重签或 Launcher 处理。
3. **端口因机器而异**：Windows 本机是 `1080`；Mac 上 Clash 常见 `7890/7891`，**必须实测**。
4. **只代理目标 App**：设计目标就是免全局 TUN；其它 App 不受影响。
5. **出口 IP 限制**：代理通了仍可能被 Google 按地区 / ASN 拒绝。

---

## 11. 与 Windows 留档的对照表

| Windows（已做） | macOS 等价 |
|-----------------|------------|
| `version.dll` + `config.json` 放 IDE 目录 | Launcher **修复** 或 Builder 生成 `Antigravity-Proxy.app` |
| `proxy.port: 1080` | Clash 常见 `7890`（以本机 `lsof` 为准） |
| `settings.json` → `http://127.0.0.1:1080` | 同上路径，端口改为 Mac 本地 HTTP 口 |
| `logs\proxy-*.log` | Launcher 诊断 / `~/Library/Logs/Antigravity/` |
| 重启 IDE 加载 DLL | 用 Launcher **启动** 或双击 Builder 生成的代理版 |

---

## 12. 一句话总结（macOS）

> **macOS 不能复制 Windows 的 `version.dll` 方案；在确认 Clash/v2rayU 等本地代理口可用后，用 AntigravityProxyLauncher（首选）或 mac-antigravity-proxy-dylib 生成带 dylib 注入的代理版 IDE，并辅以 `settings.json` 的 `http.proxy`；关闭 TUN 后验证 language_server 与 Agent 是否经代理。**
