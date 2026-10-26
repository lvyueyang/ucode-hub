# 部署运维

> 定位：平台机制类 · 人类阅读
> 单一事实来源：`src/bootstrap.ts`（启动流程/优雅关闭）、`src/services/tasks/tasks.server.ts`（定时任务）、`src/shared-services/logger`（日志）、`app/server/**`（隧道与 ingress 数据面）
> 引用关系：← 被 architecture-overview 引用、README「文档」索引；→ 引用启动/任务/日志代码单一事实来源
> 更新触发：启动流程、定时任务、日志策略、部署/环境变量、数据面与反代配置变更时

## 生产环境部署

生产部署内容内联在本仓 `deploy/`（**仓内普通目录，不是 git 子模块**）：生产 compose（内置 PostgreSQL）、一键部署/更新、备份/恢复、迁移预检脚本与运维手册；部署目录 `/opt/hub/`，容器名 `hub-app` / `hub-db`。

- **部署运维手册**（首次部署 / 升级流程 / 回滚 / 定期备份 cron）→ [`deploy/README.md`](../deploy/README.md)
- 仓内 compose 分两份：`docker-compose.yml` 是开发用（`build:` 从源码构建），`deploy/docker-compose.yml` 是生产用（取已推送的镜像）

### 镜像来源

- **本仓没有镜像构建流水线**（仓内无 `.gitlab-ci.yml`；CI 仅跑 `.github/workflows/check.yml` 的检查），镜像由交付方自行构建推送
- 镜像标签与 registry 按交付方定，生产 compose 当前写的是 `ghcr.io/ucode/hub:${TAG}`（`TAG` 默认 `latest`）

---

## 启动流程

```
服务器启动
    │
    ▼
app/server.ts (Nitro entry)
    │
    ├── bootstrap()                          # src/bootstrap.ts
    │   ├── runMigrations()                 程序化数据库迁移（fail-fast：失败即应用启动失败）
    │   ├── await Promise.all([ensurePresetDicts(), ensurePresetConfigs()])
    │   │       等待预置字典和系统配置完成（同步等待，config 缓存随之热加载）
    │   ├── void ensurePresetTranslations()  fire-and-forget（不阻塞）
    │   ├── void Promise.all([ensurePresetEvents(), ensurePresetProperties()])
    │   │       .then(loadTrackMetaCache())  链式加载 track 元数据缓存（不阻塞）
    │   ├── registerAllTasks()              注册定时任务
    │   ├── 注册 uncaughtException 处理器 → logger.fatal + exit(1)
    │   ├── 注册 unhandledRejection 处理器 → logger.fatal + exit(1)
    │   └── 注册 SIGTERM/SIGINT/SIGQUIT 处理器 → 缓冲刷入（含超时保护）
    │
    └── TanStack Start SSR fetcher            # src/server.ts
        └── handler.fetch(request)
            匹配路由 → 直接响应（页面 / Server Function / Server Route）
            未匹配 → 返回 undefined → Nitro 继续处理静态资源等
```

HTTP 入口（`app/server.ts`）对每个请求 `httpRequestsTotal.inc({ method })` 埋点。

### 请求路由优先级

```
HTTP 请求
    ↓
Nitro server routes / middleware（`app/server/**`，先于 TanStack 匹配）
    ├── WS 升级到 /api/v1/tunnel → 隧道宿主（设备出站长连）
    └── Host = <设备 id>.<HUB_BASE_DOMAIN> 或路径 /d/<设备 id>/… → ingress 回灌（子域形态未配父域时不生效）
    ↓ 都不是
TanStack Start SSR / Server Functions
    ├── /health（Server Route handler，无鉴权）→ 健康检查 { status, uptime }
    └── /api/metrics（Server Route handler，无鉴权）→ Prometheus 文本
```

---

## 数据面：隧道与 ingress

```
UCode ──WS 出站长连──▶ hub  /api/v1/tunnel
浏览器 ──HTTP──▶ <设备 id>.relay.example.com ──ingress──隧道──▶ UCode 服务层
```

### 隧道（`app/server/routes/api/v1/tunnel.ts`）

- **握手**：WS 升级时校验 `Authorization: Bearer <deviceToken>`，令牌对不上或设备已吊销直接 401
  （`code: device_unauthorized`），不建连接；升级后客户端首帧必须是 `hello`，协议版本不一致回
  `reject`（`code: protocol_mismatch`）并关闭，通过则回 `welcome`（带 `deviceId` / `serverTime`）并登记上线。
- **心跳**：服务端每 30s 发 `ping`，90s 没收到 `pong` 断开连接（握手未完成同样受它保护）。
- **接管**：一台设备同一时刻只保留一条连接；新连接上线即接管旧连接（旧连接收到 `reject`，
  `code: device_taken_over`，随后被关闭，它在飞的请求全部失败）。
- **收尾**：连接关闭 / 出错时，这条连接上所有在飞的流逐条失败，公网侧不会悬着。
- **并发上限**：单条隧道同时在飞的请求上限 64（`MAX_CONCURRENT_STREAMS`），超限由 ingress 回 429。

### ingress（`app/server/middleware/ingress.ts`）

两种寻址都当作回灌请求，不进 admin / 前台路由：

- **路径形态**（默认可用，不依赖泛域名）：`/d/<设备 id>/…`，剥掉前缀后转发给 UCode；
  不带尾斜杠的 `/d/<设备 id>` 先 308 到带尾斜杠的地址。单域名部署下浏览器与中继同源，
  会话 Cookie 自然随请求带上，不需要额外的凭证中转。**WebSocket 升级也走这里**：升级请求由中间件
  放行给 `/d/<设备 id>/…` 的专用 WS route，那边用同一套 `admitIngress` 鉴权后终结连接。
- **子域形态**（配了 `HUB_BASE_DOMAIN` 才启用）：Host 为 `<设备 id>.<父域>`（设备 id 就是 uuid，
  大小写不敏感、可带端口）；带 `Upgrade` 的请求回 501。

- **鉴权（唯一门）**：接受 `Authorization: Bearer <jwt>`（与 `/api/v1/auth/login` 同一套签发）或
  管理端 / 客户端会话 Cookie；解出的账号还必须能在用户表里查到且未被禁用。经中继到达 UCode 的请求
  等同本机 owner 身份（可跑 `bash`），所以这里只放行设备属主；管理端账号可访问任意设备。
- **转发的头**：剥掉 `cookie` / `authorization` / `host` / 逐跳头（`connection` / `transfer-encoding` /
  `upgrade` 等）/ `forwarded` 与 `x-forwarded-*`；注入来源头 `x-hub-source: tunnel`、
  `x-hub-device: <设备 id>`、`x-hub-client: <登录用户 id>`；路径形态另注入
  `x-hub-base-path: /d/<设备 id>`（UCode 据此改写 `index.html` 的 `<base href>`）。本机 `serviceToken`
  由 UCode 侧的中继客户端补上——**hub 不持有任何 UCode 凭证**。
- **失败响应**：统一 `{ "error": "<中文>", "code": "<错误码>" }`（`code` 仅在能够归类时给出）。

| 状态 | `code` | 含义 |
| --- | --- | --- |
| 401 | — | 未认证或凭证无效 |
| 404 | — | 设备不存在或已被删除（越权与不存在同文案） |
| 502 | `device_offline` | 设备未连接（没有在线隧道；设备已吊销也按这条判） |
| 429 | `tunnel_busy` | 该隧道在飞请求已达上限 |
| 502 | 其余 | 隧道侧上报的失败码（如 UCode 服务层不可用）；流已开但中途失败时中断响应体 |
| 501 / 414 / 431 | — | 不支持 Upgrade / 路径过长 / 转发头过大 |

### 反向代理要求（回灌）

`/d/<设备 id>/` 与 `<设备 id>.<父域>` 都是任意的：路径形态只需一张普通证书，子域形态需要泛域名。

```nginx
server {
  listen 443 ssl;
  server_name relay.example.com *.relay.example.com;   # 只用路径形态时可去掉 *. 那条（但泛域名解析不用改）
  ssl_certificate     /etc/nginx/certs/relay.example.com.crt;      # 需含 *.relay.example.com
  ssl_certificate_key /etc/nginx/certs/relay.example.com.key;

  location / {
    proxy_pass http://127.0.0.1:3009;
    proxy_http_version 1.1;
    proxy_set_header Host $host;                        # 子域形态靠它认设备，不能改写
    proxy_set_header Upgrade $http_upgrade;             # 隧道 WS 升级要透传
    proxy_set_header Connection $connection_upgrade;
    proxy_buffering off;                                # 事件流必须逐帧到，不能等缓冲写满
    proxy_request_buffering off;                        # 大附件上传要边收边转
    proxy_read_timeout 3600s;                           # 长连接不设短超时，存活看隧道心跳
    proxy_send_timeout 3600s;
  }
}
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
```

服务端已对回灌响应下发 `X-Accel-Buffering: no`（事件流逐帧），反代侧仍必须关掉自身的缓冲。

### 已知限制

- 一台设备只保留一条隧道连接（新连接接管旧的）：多实例客户端会互相顶掉。
- 分发按连接串行：某条很慢的公网下载会拖慢同一隧道上其它流的响应帧（v1 没有逐流暂停帧）。
- 不给请求设超时：设备活着却不回包时，该流会一直占着并发额度，直到连接关闭或心跳判死。
- WebSocket 升级只在路径形态支持（协议 v2）；子域形态的升级请求回 501。
- 静态资源先于 ingress 匹配：与 hub 自身 `public/` 同名（`/logo512.png` / `manifest.json` / `robots.txt` 等）
  或与 hub 前端产物同名的路径会被 hub 自己接住，不回灌——设备侧页面不要用这些固定路径。
  路径形态（`/d/<设备 id>/`）把设备页面整个收在前缀下，不受这条影响。
- 路径形态靠 UCode 服务端按 `x-hub-base-path` 改写 `<base href>`：被访问的实例必须是含该改写的版本，
  否则页面里的相对资源会落到 hub 自己的路径上。WebSocket 升级同样要设备端是协议 v2 的版本（旧客户端会在
  帧结构上对不上：v2 的数据帧多了文本变体、控制帧多了 `close`）。

---

## 环境变量

环境变量文件位于 `app/` 下（`app/.env`、`app/.env.example`）：开发与构建期由 Nitro 以 app 为 root 把 `.env` / `.env.local` 读入 `process.env`，生产由部署声明（见 `deploy/docker-compose.yml`），CLI 入口（`pnpm db:migrate`）自己读 `.env`。

| 文件 | 说明 |
|------|------|
| `app/.env` | 运行环境变量（不入库） |
| `app/.env.example` | 环境变量模板（变量清单与说明的事实源） |
| `deploy/.env.example` | 生产部署变量模板（POSTGRES_* 等，compose 用它拼出应用的 DATABASE_URL） |

**读取与校验统一在 `app/src/env.ts`**（app 内唯一的 `process.env` 读取点，兼作启动期校验），业务代码不得再直读。

### 核心环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | —（必填） |
| `JWT_SECRET` | HS256 签名密钥（至少 32 字符） | —（必填） |
| `STORAGE_DIR` | 数据存储目录（上传文件 + 日志 + 监控采样） | —（必填） |
| `LOG_LEVEL` | 日志级别 | `info` |
| `PORT` | Nitro 监听端口（容器内固定 3009） | `3009` |
| `NODE_ENV` | 运行环境（`development` / `production` / `test`） | `development` |
| `COOKIE_SECURE` | 认证 Cookie 是否启用 Secure 标志（`true`/`false`），未设置时按 NODE_ENV 推断 | 生产为 `true` |
| `CONFIG_ENCRYPTION_KEY` | 系统配置敏感值加密主密钥（32 字节 Base64 或 64 位十六进制）；启用敏感配置后必填，缺失时读取敏感配置报错 | —（可选） |
| `HUB_BASE_DOMAIN` | ingress 回灌的父域（如 `relay.example.com`）：设了才启用 `<设备 id>.<父域>` 的子域回灌 | —（不设则只跑控制面） |
| `DB_POOL_MAX` | pg 连接池最大连接数 | `10` |
| `DB_POOL_IDLE_TIMEOUT_MS` | 连接空闲回收时间（毫秒） | `30000` |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | 连接获取超时（毫秒） | `2000` |

> 必需项缺失或任一项取值非法（如 `LOG_LEVEL` 不在白名单、`JWT_SECRET` 不足 32 字符）一律拒绝启动，一次报出全部问题；判定规则与默认值都集中在 `app/src/env.ts`。

> 连接池参数由 `src/db/index.ts` 从 `src/env.ts` 取值建 `pg.Pool`，postgres 驱动默认值见 [node-postgres 文档](https://node-postgres.com/features/pool)。

SMTP 邮件配置存储于系统配置表，通过 `/admin/config` 页面管理。

> **敏感系统配置加密**：`system_config` 的敏感项（`is_secret`）以 AES-256-GCM 密文入库，读取时解密、管理端列表脱敏、不参与客户端可见配置下发，导出备份也不携带原文。主密钥由 `CONFIG_ENCRYPTION_KEY` 提供，**密钥丢失后已加密的敏感配置无法解密恢复，须妥善备份**；未配置主密钥时读取敏感项会报错（不影响进程启动）。新增变量需同步 `deploy/docker-compose.yml` 的透传。

> **HTTPS 与 Cookie**：生产环境认证 Cookie 默认携带 `Secure` 标志（浏览器仅在 HTTPS 下保存）。线上若尚未启用 HTTPS（http:// 访问），必须在 `.env` 设置 `COOKIE_SECURE=false`，否则登录成功后 token 立即丢失、反复跳回登录页。启用 HTTPS 后应移除该配置或设回 `true`。`deploy/docker-compose.yml` 已透传该变量。

---

## 定时任务

通过 `#/shared-services/scheduler` 的 `registerTask()` 注册 cron 任务：

| 任务 | Cron | 处理函数 | 说明 |
|------|------|----------|------|
| 清理过期临时文件 | `0 * * * *`（每整点） | `cleanExpiredFiles()` | 扫描 `expired_at < now()` 的 `status='temp'` 文件，删除物理文件 + 软删除记录 |
| 清理过期日志文件 | `0 3 * * *`（每天 3:00） | `cleanExpiredLogs()` | 删除 N 天前的日志文件 |

定时任务在 `bootstrap()` 末尾通过 `registerAllTasks()` 统一注册。

> **时区约定**：cron 执行与日志按天切割均以 `Asia/Shanghai` 为统一时区基准（`@ucode/hub-lib/date-format` 的 `DEFAULT_TASK_TIME_ZONE`），**不依赖服务器系统时区**。部署环境无需设置 `TZ`，服务器时区变更不影响任务执行时间与日志文件名日期。

---

## 日志体系

### Pino 多流输出

```
logger.error/warn/info/debug
    │
    ├── 文件流 (info 级别)
    │   └── {STORAGE_DIR}/logs/YYYY-MM-DD.log
    │
    └── 控制台流
        ├── 生产环境: process.stdout (warn 级别)
        └── 开发环境: pino-pretty (info 级别，带颜色)
```

按天自动分割：`createWriteStream` 写入当天日期的日志文件。文件名按 `Asia/Shanghai` 时区生成（与日志清理、定时任务同一时区基准），随进程重启自然切换到新日期。

### SF 错误日志中间件

`src/middleware/sf-error-logger.ts` 注册在 `start.ts` 的 `functionMiddleware` 中，自动覆盖所有 Server Function：

| 错误类型 | 日志级别 | 行为 |
|----------|----------|------|
| `AdminAuthError` / `ClientAuthError` (401/403) | warn | 记录状态码 + 消息 |
| 其他异常 | error | `sanitizeError()` 脱敏后记录 |
| 开发环境成功请求 | debug | 记录耗时 |

- 中间件同时埋入 SF 耗时直方图与结果计数器（`server_function_duration_seconds` / `server_function_requests_total`）
- 错误经 `toClientError()` 归一化后抛出，保证客户端 `err.message` 始终为业务/校验/兜底文案，不影响框架 error boundary 和客户端 catch

### 日志查询

管理端 `/admin/logs` 页面通过 `src/services/logs/logs.server.ts` 提供：
- `getLogDates()` — 列出所有日志文件日期
- `searchLogs(query)` — 按关键词/级别/日期范围搜索
- `getLogRawContent(date)` — 获取指定日期日志原始内容

### 请求 ID 贯通

`requestIdMiddleware`（`src/middleware/request-id.ts`）注册于 requestMiddleware 首位：优先透传上游 `x-request-id`（超长截断至 100），否则生成 UUID，写入 ALS 上下文并回写响应头。logger mixin 自动注入 requestId，操作审计落库 `operation_log.request_id`——日志、审计、埋点可按同一 requestId 全链路串联。

---

## 监控（Prometheus）

`src/shared-services/metrics` 为进程内指标注册表（`Counter` + `Histogram`，无第三方依赖），HTTP 入口与 SF 中间件自动埋点：

| 指标 | 类型 | 标签 | 埋点位置 |
|------|------|------|----------|
| `http_requests_total` | Counter | `method` | `app/server.ts` 入口 |
| `server_function_requests_total` | Counter | `result`（success/error） | `sf-error-logger` |
| `server_function_duration_seconds` | Histogram | — | `sf-error-logger` |
| `external_calls_total` | Counter | `system` / `outcome`（success/error） | `external-observability` |
| `external_call_duration_seconds` | Histogram | `system` | `external-observability` |

拉取端点 `/api/metrics`（Server Route handler，无鉴权）输出 Prometheus text 格式。接入 Prometheus 即可采集，**注意**：
- 无鉴权端点，如对外暴露需在反向代理层加访问控制
- 指标为进程内计数，多实例部署需在实例层聚合（Prometheus 直接抓取多实例再聚合即可）

### 应用内系统监控

`/admin/system/monitor`（权限码 `system:monitor:view`）在后台内展示程序自身运行状态，无需外部监控系统：

- **采样落盘**：`src/services/system-metric` 每分钟采集进程 CPU / 内存 / 事件循环延迟 / 活跃资源 / 请求增量 / 依赖健康 / 数据库总量，写入 `{STORAGE_DIR}/metrics/YYYY-MM-DD.ndjson`（NDJSON，按业务时区按天切割），保留 7 天并由每日定时任务清理
- **实时快照**：现读进程指标（微秒级、零 IO、零数据库探测），前端每 5 秒轮询；依赖健康取最近一次采样，避免轮询打数据库
- **历史趋势**：切换范围（1h / 24h / 7d）时按时间桶聚合采样文件，流式读取、内存 `O(桶数)`
- **存储 / 数据库占用**：STORAGE_DIR 体积（含顶层目录分解与文件系统容量）与数据库各表占用（`pg_relation_size` 等）按需查询 + 内存缓存，页面「刷新」强制重算
- 常驻开销：每分钟一次毫秒级采样 + 一行追加写，约 350 B/分钟；无建表、无迁移

> 该功能与 Prometheus 指标并存：应用内监控面向管理端可视化，Prometheus 面向外部监控系统与告警。

---

## 文件存储

`#/shared-services/storage` 提供文件存储实现层（`LocalStorageAdapter` + `storage` 单例，基于 `@ucode/hub-lib/storage` 的 `StorageAdapter` 契约），存储基址为 `{STORAGE_DIR}/uploads/`：

```
上传文件
    ↓
uploadFileSFn()
    ↓
sha256 校验 → 秒传检测（相同哈希复用已有文件）
    ↓
物理存储: {STORAGE_DIR}/uploads/{YYYY-MM-DD}/{stored_name}
    ↓
数据库记录: file 表 (status='temp' / 'permanent')
```

文件状态：
- **temp**：临时上传，未关联业务实体，`expired_at` 指定过期时间
- **permanent**：已关联业务实体，不会被定时清理

---

## 优雅关闭

进程监听 `SIGTERM`、`SIGINT` 和 `SIGQUIT` 信号，在退出前执行：

```typescript
const gracefulShutdown = async () => {
    // 刷新缓冲中的事件埋点和操作日志，避免数据丢失
    // 10 秒超时保护，防止缓冲刷入挂起导致进程无法退出
    await Promise.race([
        Promise.all([flushTrackEvents(), flushOperationLogs()]),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("缓冲刷入超时，强制退出")), 10_000),
        ),
    ]);
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("SIGQUIT", gracefulShutdown);
```

---

## 单实例与数据一致性边界

- **架构假设单实例**：内存缓存、埋点频控、`BatchWriter` 缓冲、本地文件存储、cron 定时任务均为进程内/本机实现，多实例部署会导致缓存不一致、定时任务重复执行、埋点缓冲各实例分散。
- **崩溃丢数据窗口**：埋点事件与操作日志的 `BatchWriter` 缓冲（5 秒 / 100 条窗口）在进程被 kill -9 或崩溃时丢失；优雅关闭（SIGTERM/SIGINT/SIGQUIT）会强制刷新。
- **fire-and-forget 通知不持久**：邮件 / 短信 / AI 翻译为触发即忘，无持久队列，进程退出即丢失未完成的发送任务。
- **扩容路径**：真正横向扩容前需先外部化状态——Redis 承载缓存与分布式限流、消息队列承载埋点/任务投递、对象存储承载文件、集中式日志。

---

## 首次部署 — 系统初始化

```
首次访问 /admin
    ↓
admin/init/index.tsx beforeLoad → checkInitStatus()
    ↓
SELECT FROM admin_user WHERE is_root = true → null
    ↓
重定向到 /admin/init 初始化页面
    ↓
用户填写管理员信息 + 站点设置
    ↓
initSystem() 在事务中执行:
    ├── 再次校验 is_root (防并发)
    ├── INSERT role (超级管理员, permissions: ["**"])
    ├── INSERT admin_user (is_root=true)
    └── INSERT system_config (站点名、SMTP、AI)
    ↓
刷新配置缓存 → 跳转 /admin/login
```

---

## 镜像构建

### 本地构建

> 构建上下文是**本仓库根**（Dockerfile 在根下）：

```bash
# 默认官方源构建
docker build -t hub .

# 使用国内 npm 镜像源加速构建
docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t hub .
```

### Dockerfile 结构

```
多阶段构建
    │
    ├── builder 阶段 (node:24-slim)
    │   ├── ARG NPM_REGISTRY           # 可选，自定义 npm 镜像源（默认 npmmirror）
    │   ├── npm install -g pnpm@12 → 全局装 pnpm
    │   ├── 只拷各包 package.json → pnpm install --ignore-scripts（不再拉构建期用不到的安装脚本）
    │   └── pnpm --filter @ucode/hub build → .output/（第三方依赖已打进 _libs/）
    │
    └── runner 阶段 (node:24-alpine)
        ├── 非 root 用户 (nodejs:nodejs)
        ├── HEALTHCHECK → GET /health（每 30s）
        ├── VOLUME /app/data（日志 + 上传文件）
        ├── EXPOSE 3009
        └── CMD node .output/server/index.mjs
```

---

## 开发环境 docker compose

`docker-compose.yml` 用于本地开发（在本仓库根执行），`build:` 从本仓库根源码构建，自带默认配置开箱即用：

```bash
# 直接启动（使用默认配置）
docker compose up -d

# 查看日志
docker compose logs -f app

# 如需自定义，在 hub/ 下建 .env 覆盖对应变量（默认值见 docker-compose.yml 的 environment）
# 注意：hub/ 下没有 .env.example 模板；应用自身的变量模板在 app/.env.example
```

## 健康检查

```json
GET /health → 200
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": "2026-08-23T05:28:52.721Z",
  "version": "1.1.0",
  "checks": {
    "database": { "status": "up", "latencyMs": 9 },
    "storage": { "status": "up" }
  }
}
```

通过 TanStack Start Server Route 提供（`src/routes/health.tsx`），无鉴权。就绪语义：数据库连通（`SELECT 1`）与存储目录可写均正常返回 `200`，任一异常返回 `503`，供 Docker healthcheck / Playwright 等待依赖就绪。

---

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `deploy/`（仓内目录，非子模块） | 生产部署运维内容（compose / 脚本 / 手册） |
| `server.ts`（app 根目录） | Nitro 服务入口 + HTTP 指标埋点 |
| `server/routes/api/v1/tunnel.ts` | 隧道宿主（WS 端点：握手、心跳、上线登记、收尾） |
| `server/middleware/ingress.ts` | ingress：按 Host 认设备的子域回灌（鉴权 / 剥头 / 流式转发） |
| `server/tunnel/*` | 数据面纯逻辑（协议分发、连接注册表、响应桥、背压、请求侧解析） |
| `src/bootstrap.ts` | 启动初始化（init 注入、迁移、预置、定时任务、优雅关闭） |
| `src/server.ts` | TanStack Start 服务端入口 |
| `src/start.ts` | 全局中间件注册（requestId + locale + CSRF + sfErrorLogger） |
| `src/middleware/request-id.ts` | 请求 ID 中间件 |
| `src/shared-services/metrics` | Prometheus 进程内指标注册表 |
| `src/routes/api/metrics.tsx` | `/api/metrics` 指标端点（无鉴权） |
| `src/services/system-metric/` | 应用内系统监控（采样落盘 / 实时快照 / 历史聚合 / 存储与数据库占用） |
| `src/routes/admin/_admin/system/monitor.tsx` | `/admin/system/monitor` 系统监控页 |
| `src/services/tasks/tasks.server.ts` | 定时任务注册 |
| `src/shared-services/scheduler` | 定时任务调度器（`registerTask`） |
| `src/shared-services/logger` | Pino 日志单例壳（`createLogger` + `logger` 单例） |
| `src/middleware/sf-error-logger.ts` | SF 错误日志中间件 |
| `src/shared-services/storage` | 文件存储实现层（`LocalStorageAdapter` + `storage` 单例，`@ucode/hub-lib/storage` 契约） |
| `src/services/init/init.server.ts` | 系统初始化逻辑 |
| `src/services/logs/logs.server.ts` | 日志查询服务 |
| `src/services/logs/log-reader.ts` | 日志文件读取 |
| `src/services/logs/logs-cleanup.server.ts` | 过期日志清理 |
| `app/.env.example` | 环境变量模板（变量清单的事实源） |
| `deploy/.env.example` | 生产部署变量模板 |
| `Dockerfile` | Docker 多阶段构建（构建上下文是本仓库根） |
| `.dockerignore`（本仓库根） | Docker 构建排除规则 |
| `docker-compose.yml` | 开发环境 docker compose（build from source） |


