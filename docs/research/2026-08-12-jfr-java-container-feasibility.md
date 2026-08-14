# Java 容器服务 JFR 适用性调研与排障手册

| 项 | 内容 |
| --- | --- |
| 文档类型 | 技术调研 / 排障手册 |
| 状态 | 已完成（现场只读核查） |
| 版本 | 1.0 |
| 调研时间 | 2026-08-12 10:24:00 ~ 10:27:00 +08:00 |
| 适用环境 | `192.168.99.92`（标签 `99.92`）离线 Java 微服务容器集群 |
| 证据来源 | AT Terminal `run_remote_command` → `docker ps` / `docker exec` 只读检查 |
| 编写说明 | 事实与建议分区标注；敏感启动参数已脱敏 |

## 修订记录

| 版本 | 时间 | 变更内容 | 编写人 | 审核人 |
| --- | --- | --- | --- | --- |
| 1.0 | 2026-08-12 | 初稿：适用性结论 + JFR 排障用法 | Agent | 待确认 |

---

## 1. 背景与目标

### 1.1 背景

目标主机以 Docker 容器部署多套 Java 服务。需确认这些服务是否可使用 **JFR（Java Flight Recorder）** 做运行时排障，并沉淀可执行的采集 / 分析流程，供后续存档与应急使用。

### 1.2 目标

1. 判定各 Java 容器对 JFR 的**适用性**（运行时能力、许可、工具链缺口）。
2. 给出**不编造现场结果**的证据摘要。
3. 补充 **JFR 排障操作手册**：何时用、怎么采、怎么看、风险与回退。

### 1.3 范围

| 纳入 | 排除 |
| --- | --- |
| 主机 `192.168.99.92` 上 `cl-*-offline` / `cl-taskcenter` Java 容器 | 非 Java 容器（Redis / MariaDB / Frappe） |
| JFR 录制与 `jfr` CLI / JMC 分析路径 | 已实际启动长时间录制（本次未执行，避免改变生产状态） |
| 动态录制与重启录制两种方案 | 永久改镜像 / 改生产启动参数（仅作建议） |

### 1.4 术语

| 名称 | 含义 |
| --- | --- |
| JFR | Java Flight Recorder，JDK 内置低开销事件录制 |
| JMC | JDK Mission Control，Oracle/OpenJDK 生态常用的 `.jfr` 可视化分析工具 |
| `jfr` CLI | JDK 自带命令行，用于打印 / 汇总 / 拆分已生成的 `.jfr` |
| `jcmd` | 向运行中 JVM 发送诊断命令（含 `JFR.start` / `JFR.stop` / `JFR.dump`） |

> **说明**：自 JDK 11 起，OpenJDK 中的 JFR 已开源可用，**不再依赖 Oracle JDK 商业许可**。Eclipse Temurin 等发行版均可使用。

---

## 2. 现场核查结论

### 2.1 总判定

**结论：适用。** 已抽查与批量核对的 12 个 Java 服务容器均可使用 JFR 做排障。

限制：**镜像精简，缺少 `jcmd` 可执行文件**，因此**默认不能**对热进程直接 `jcmd JFR.start`；需采用「重启参数开录」或「临时补齐 jcmd」方案。

### 2.2 已验证事实

| 事实 | 证据 |
| --- | --- |
| 目标主机已连接，用户 `root`，标签 `99.92` | `get_terminal_context` |
| 12 个 Java 业务容器处于 `Up` | `docker ps`（2026-08-12） |
| 运行时为 Eclipse Temurin OpenJDK 17 | 容器内 `java -version`：`Temurin-17.0.19+10` 或 `Temurin-17.0.17+10` |
| `JAVA_HOME=/opt/java/openjdk` | 容器环境变量与路径探测 |
| JVM 模块含 `jdk.jfr`、`jdk.management.jfr`、`jdk.jcmd`、`jdk.attach` | `/opt/java/openjdk/release` 中 `MODULES=` |
| VM 暴露 `FlightRecorder` / `StartFlightRecording` 等开关 | `java -XX:+PrintFlagsFinal -version` |
| 当前进程**未**主动开启 Flight Recording（默认 `FlightRecorder=false`） | 同上；属正常默认态 |
| 镜像 `/opt/java/openjdk/bin` 仅有 5 个二进制：`java`、`jfr`、`jrunscript`、`keytool`、`rmiregistry` | 目录列举 |
| **`jcmd` 可执行文件缺失** | `ls` / `command -v`；抽查 `cl-payment-engine-offline`、`cl-notification-offline`、`cl-taskcenter` |
| 容器内仍保留 `jfr` CLI，可做离线分析 | 同上 |
| `/tmp`、工作目录 `/cl-tech` 可写 | `touch` 探测 |
| `/cl-tech/logs` 挂载异常：可见但无法写入，目录为空 | `mount` + `ls` + `touch` 失败（`ENOENT`） |

### 2.3 服务清单（Java）

| 容器名 | 镜像 | JDK（已验证） | GC（观察） | JFR 能力 | `jcmd` |
| --- | --- | --- | --- | --- | --- |
| `cl-payment-engine-offline` | `…/cl-payment-engine-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-auth-offline` | `…/cl-auth-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-gateway-offline` | `…/cl-gateway-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-merchant-admin-offline` | `…/cl-merchant-admin-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-openapi-offline` | `…/cl-openapi-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-file-offline` | `…/cl-file-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-local-deposit-offline` | `…/cl-local-deposit-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-merchant-offline` | `…/cl-merchant-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-system-offline` | `…/cl-system-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-account-offline` | `…/cl-account-offline:latest` | Temurin 17.0.19 | ZGC | 可用 | 缺失 |
| `cl-notification-offline` | `…/cl-notification-offline:latest` | Temurin 17.0.17 | ZGC | 可用 | 缺失 |
| `cl-taskcenter` | 本地镜像 ID | Temurin 17.0.17 | G1GC | 可用 | 缺失 |

> 镜像仓库地址已弱化展示。启动参数中的加解密口令等敏感项**不写入本文**。

### 2.4 观察与推断

| 类型 | 内容 |
| --- | --- |
| 观察 | 业务容器普遍 `-jar app.jar`，工作目录 `/cl-tech`；多数使用 ZGC，`cl-taskcenter` 使用 G1。 |
| 观察 | 启动参数已配置 GC/JVM 日志路径到 `/cl-tech/logs/...`，但该挂载当前无法写入。 |
| 推断 | GC/JVM 文件日志可能未真正落盘；排障时不应假设这些日志可用，优先用 JFR 或重建可写挂载。 |
| 推断 | 镜像为「精简 JDK」策略：保留 JFR 运行时模块与 `jfr` CLI，但剥离 `jcmd`/`jmap`/`jstack` 等诊断二进制。 |

### 2.5 适用性判定矩阵

| 判定项 | 结果 | 说明 |
| --- | --- | --- |
| JVM 是否内置 JFR | **是** | Temurin 17 + `jdk.jfr` |
| 是否需要 Oracle 商业许可 | **否** | OpenJDK 11+ 开源 JFR |
| 容器内能否离线分析 `.jfr` | **是** | 有 `jfr` CLI |
| 容器内能否热开录（默认） | **否** | 缺 `jcmd` |
| 能否通过重启参数开录 | **是** | `-XX:StartFlightRecording=...` |
| 推荐落盘路径 | `/tmp` 或 `/cl-tech` | **不要**写 `/cl-tech/logs`（当前异常） |

---

## 3. JFR 排障手册

### 3.1 适用场景

| 症状 | JFR 是否优先 | 关注事件 / 视图 |
| --- | --- | --- |
| CPU 飙高、单核打满 | 是 | Method Profiling、CPU 负载、热点方法 |
| 接口偶发/持续变慢 | 是 | Java Application、Socket Read/Write、锁争用 |
| 疑似锁竞争 / 线程阻塞 | 是 | Java Monitor Wait/Enter、Thread Park |
| 内存上涨、疑似泄漏 | 是（配合多次 dump 对比） | Object Allocation、GC、Old Object Sample（需开启相关事件） |
| GC 停顿或分配压力 | 是 | GC、TLAB、Allocation |
| 类加载 / 元空间异常 | 是 | Class Loading、Metaspace |
| 仅需看一行业务错误栈 | 否，先看应用日志 | — |

### 3.2 安全与审批

| 风险等级 | 动作 | 要求 |
| --- | --- | --- |
| 中 | 短时录制（≤ 1~2 分钟，默认 profile） | 说明目标容器、时长、落盘路径；评估磁盘与 CPU |
| 高 | 重启容器并改 JAVA_OPTS 开录 | 变更窗口、业务影响、回滚命令、明确审批 |
| 高 | 向生产镜像拷入二进制或挂载宿主机 JDK | 版本匹配、审计、用后清理 |
| 严重 | 长时间全事件录制、或写入将满磁盘 | 默认禁止；需专项评估 |

录制建议：

1. 先短后长：首次 30~60 秒，确认有信号再加长。
2. 落盘到 **可写且空间充足** 路径（当前建议 `/tmp`）。
3. 录完立刻 `docker cp` 拉出，再删除容器内文件。
4. 默认 profile 开销通常较低；勿一上来开 `profile=…without-thresholds` 或海量自定义事件。

### 3.3 方案 A：重启开录（当前环境主推）

适用于：缺 `jcmd`、可接受短暂重启、需要一次完整采样。

#### 3.3.1 录制参数示例（示例值，部署前按服务改）

在容器原有 JVM 参数后追加（示例）：

```text
-XX:StartFlightRecording=name=diag,settings=profile,duration=60s,filename=/tmp/<service>-diag.jfr,maxsize=256m
```

常用字段：

| 字段 | 建议 | 说明 |
| --- | --- | --- |
| `settings` | `profile` | 比 `default` 更适合性能排障；开销略高 |
| `duration` | `30s`~`120s` | 超时自动停止；也可不设 duration 改用 `maxage`/`maxsize` 环形缓冲 |
| `filename` | `/tmp/...jfr` | 必须可写 |
| `maxsize` | `128m`~`512m` | 防止录爆盘 |
| `maxage` | 可选，如 `10m` | 环形缓冲按时间滚动 |

持续观察（需二次变更关闭）可用：

```text
-XX:StartFlightRecording=name=diag,settings=profile,filename=/tmp/<service>-ring.jfr,maxage=10m,maxsize=256m,disk=true
```

#### 3.3.2 操作步骤（模板）

> 以下为**计划模板**。实际执行前须完成审批；本节不代表已在 `99.92` 执行。

1. 确认目标容器、业务窗口、回滚方式（恢复原启动参数 / 原 compose / 原编排配置）。
2. 确认落盘路径可写、磁盘余量充足：

```sh
# Purpose: check free space before JFR dump
docker exec <container> df -h /tmp /cl-tech
```

3. 在编排或启动脚本中追加 `StartFlightRecording`（或临时 `docker run`/`compose` 覆盖 `JAVA_TOOL_OPTIONS`——以现网真实启动方式为准，**待确认**）。
4. 滚动重启**单个**目标实例，等待服务就绪。
5. 等待 `duration` 结束，或达到采样窗口后确认文件生成：

```sh
# Purpose: verify recording file exists
docker exec <container> ls -lh /tmp/<service>-diag.jfr
```

6. 拷出并校验大小非 0：

```sh
# Purpose: copy JFR out of container for analysis
docker cp <container>:/tmp/<service>-diag.jfr ./<service>-diag-$(date +%Y%m%d-%H%M%S).jfr
```

7. 删除容器内临时文件；恢复原 JVM 参数并视需要再重启（去掉录制参数）。
8. 用 JMC 或 `jfr` CLI 分析（见 §3.5）。

#### 3.3.3 回滚

- 去掉 `StartFlightRecording` / `FlightRecorderOptions` 相关参数，按原方式发布。
- 确认进程参数不再包含录制开关：`docker exec <container> ps -o args= -p 1`（或等价检查）。
- 清理 `/tmp/*.jfr`。

### 3.4 方案 B：临时补齐 `jcmd` 后热开录（无需改业务参数，仍有变更风险）

适用于：不能随便改业务 JVM 参数，但允许向容器放入与运行时**同主版本**的 `jcmd`。

#### 3.4.1 前置条件

- 宿主机或制品库有 **Temurin/OpenJDK 17** 的 `jcmd`（与容器大版本一致，避免 attach 异常）。
- 容器未禁用 attach（现场启动参数**未见** `-XX:+DisableAttachMechanism`）。
- 目标 PID 一般为容器内 PID `1`（现场观察 java 为 PID 1）。

#### 3.4.2 热开录命令模板

```sh
# Purpose: start a 60s profile recording on PID 1 (after jcmd is available in container)
docker exec <container> /path/to/jcmd 1 JFR.start name=diag settings=profile duration=60s filename=/tmp/<service>-diag.jfr maxsize=256m

# Purpose: check recording status
docker exec <container> /path/to/jcmd 1 JFR.check

# Purpose: stop early if needed
docker exec <container> /path/to/jcmd 1 JFR.stop name=diag

# Purpose: dump current buffer without stop (for continuous recordings)
docker exec <container> /path/to/jcmd 1 JFR.dump name=diag filename=/tmp/<service>-dump.jfr
```

> **注意**：向生产容器拷贝二进制、挂载宿主机 JDK 目录属于变更，需审批与用后清理。版本不匹配可能导致 attach 失败。

### 3.5 分析：容器内 `jfr` CLI 与本地 JMC

#### 3.5.1 容器内快速摘要（已具备 `jfr`）

```sh
# Purpose: summarize recording contents
docker exec <container> jfr summary /tmp/<service>-diag.jfr

# Purpose: print top events / filtered view (example: method samples)
docker exec <container> jfr print --events jdk.ExecutionSample /tmp/<service>-diag.jfr | head -n 200

# Purpose: view GC related events
docker exec <container> jfr print --events jdk.GarbageCollection,jdk.YoungGarbageCollection,jdk.OldGarbageCollection /tmp/<service>-diag.jfr | head -n 200
```

#### 3.5.2 推荐：拷出后用 JDK Mission Control（JMC）

1. 将 `.jfr` 拷到分析机（不要在业务高峰期用业务机做重分析）。
2. 用 JMC 打开，优先看：
   - **Automated Analysis Results**（自动规则提示）
   - **Method Profiling**（CPU 热点）
   - **Lock Instances** / **Java Application**（阻塞与锁）
   - **Garbage Collections**（停顿与频率）
   - **Memory** / **Allocations**（分配与泄漏线索）
3. 将「热点栈 + 时间窗 + 对应业务接口」写入故障报告；避免只贴截图不写结论条件。

### 3.6 按场景的解读要点

#### CPU 高

1. Method Profiling 找 Top 方法与调用栈。
2. 区分「业务计算」「JSON/序列化」「正则/加解密」「忙等循环」。
3. 对照同一时间窗的 QPS / 接口耗时（若有 Grafana，另开指标查询；本次未查）。

#### 接口慢

1. 看 Socket Read 是否长时间等待（下游/DB/Redis 超时）。
2. 看 Monitor/Park 是否锁等待。
3. 看 GC 停顿是否与慢请求时间对齐。
4. JFR **不能替代**业务日志中的错误码与 SQL；应并行取应用日志。

#### 内存上涨

1. 短录观察 Allocation 热点。
2. 需要泄漏结论时，间隔多次录制或配合 heap dump（heap dump 影响更大，另案审批）。
3. 注意 ZGC 与 G1 的解读差异：`cl-taskcenter` 为 G1，其余多数为 ZGC。

#### 线程阻塞 / 死锁嫌疑

1. 查看 Monitor Wait、Thread Dump 类事件（视 settings 是否包含）。
2. 必要时在同一窗口补充 `jstack`（当前镜像也无 `jstack`，需同类补齐诊断工具或重启方案）。

### 3.7 推荐默认作战流程（本环境）

```text
1) 确认症状时间窗与目标容器（单实例）
2) 选方案 A（重启开录 60s）或方案 B（临时 jcmd）
3) 落盘 /tmp → docker cp 出主机 → 删除容器内文件
4) JMC / jfr 分析 → 形成「热点栈 + 假设」
5) 用业务日志 / 指标验证假设（禁止把相关性直接写成根因）
6) 恢复启动参数 / 清理临时工具 → 记录变更
```

---

## 4. 风险、限制与后续事项

### 4.1 已知限制

| ID | 限制 | 影响 | 建议 |
| --- | --- | --- | --- |
| L1 | 镜像无 `jcmd`/`jmap`/`jstack` | 热诊断能力弱 | 构建「运维 sidecar / 诊断包」或镜像保留诊断二进制（需产品决策） |
| L2 | `/cl-tech/logs` 无法写入 | GC/JVM 文件日志与默认日志目录不可用 | 修复 volume/bind mount；JFR 勿写该路径 |
| L3 | JDK 小版本不完全一致（17.0.17 vs 17.0.19） | 通常不影响 JFR 可用性 | 补 `jcmd` 时尽量同发行版同主版本 |
| L4 | 本次未做实际开录验证 | 「可开录」基于模块与 flags，非端到端演练 | 在变更窗口对单一非关键实例做一次演练 |

### 4.2 待确认

- [ ] 各服务真实启动入口（compose / k8s / 脚本 / `JAVA_TOOL_OPTIONS`）以便最小改动追加录制参数。
- [ ] `/cl-tech/logs` 挂载来源与修复责任人。
- [ ] 生产变更审批链路与可回滚发布方式。
- [ ] 分析机是否已安装 JMC，以及 `.jfr` 外传合规要求。
- [ ] 是否允许在镜像中长期保留 `jcmd`（安全/体积权衡）。

### 4.3 建议落地项（非本次执行）

1. **P0**：修 `/cl-tech/logs` 挂载，恢复 GC/JVM 日志可观测性。  
2. **P1**：在预发对任一服务做一次 60s JFR 演练，固化命令与落盘规范。  
3. **P1**：准备与 Temurin 17 匹配的只读诊断包（至少 `jcmd`）。  
4. **P2**：评估基础镜像改为「生产精简 + 可选诊断层」，避免每次事故现场拷贝。

---

## 5. 附录

### 5.1 现场只读核查命令摘要

```sh
# Purpose: list containers
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'

# Purpose: inspect Java version and tools inside a container
docker exec <container> sh -c 'java -version; ls -1 /opt/java/openjdk/bin; grep -E "^(IMPLEMENTOR|JAVA_VERSION|MODULES)=" /opt/java/openjdk/release'

# Purpose: confirm FlightRecorder flags exist
docker exec <container> sh -c 'java -XX:+PrintFlagsFinal -version 2>/dev/null | grep -E "FlightRecorder|StartFlightRecording"'
```

### 5.2 参考

- OpenJDK Flight Recorder 概述（JDK 11+ 开源）
- `jcmd` JFR 子命令：`JFR.start` / `JFR.stop` / `JFR.dump` / `JFR.check`
- JDK Mission Control（JMC）用户手册

### 5.3 完成检查

| 检查项 | 状态 |
| --- | --- |
| 元数据与修订记录 | 已填 |
| 事实与证据可追溯 | 已填（AT Terminal 只读核查） |
| 计划与已执行分离 | 已区分（§3 为手册/模板，未声称已开录） |
| 敏感信息脱敏 | 已处理 |
| 回滚与风险 | 已写 |
| 待确认集中列出 | §4.2 |
