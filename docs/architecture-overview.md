# 架构总览

> 定位：平台机制类 · 人类阅读
> 单一事实来源：代码（`app/src/` 目录结构、`src/db/schema/`、`src/permissions/`）
> 引用关系：← 被 README 引用；→ 引用 database-design / cache-system / auth-permission-model / deployment-ops / event-tracking / i18n（均只引用不复制）
> 更新触发：目录分层、基础设施（缓存/埋点/审计/请求上下文）、路由体系变更时

hub 的工程本体基于 TanStack Start（来自上游基座 `easyx-dev/fsdx` 的裁切），内置 RBAC 认证、事件埋点、操作审计、国际化等基础设施。中继定位与方案见 UCode 仓库的 [plans/hub.md](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md)，上游关系见 [UPSTREAM.md](../UPSTREAM.md)。

> 除特别说明外，文件路径均相对 `app/` 目录（单仓库多包，业务代码在 `app/`，库包在 `packages/`）。

## 系统分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          浏览器                                     │
│      ┌──────────────────┐      ┌──────────────────────────┐        │
│      │   /admin/* (SPA)  │      │    /* (SSR 前台)          │        │
│      │   管理端 (antd)    │      │   客户端 (shadcn/ui)      │        │
│      └────────┬─────────┘      └───────────┬──────────────┘        │
└───────────────┼────────────────────────────┼────────────────────────┘
                │                            │
┌───────────────┼────────────────────────────┼────────────────────────┐
│               │     Nitro (app/server.ts)   │                        │
│               │   bootstrap() + 指标埋点     │                        │
│               │                            │                        │
│  ┌────────────▼────────────────────────────▼──────────────────┐    │
│  │                TanStack Start (SSR + Server Functions)     │    │
│  │  Server Route handler（无鉴权）：/health、/api/metrics       │    │
│  ┌────────────▼──────┐  ┌──────────────────▼───────────────┐  │    │
│  │  requestMiddleware │  │  requestMiddleware                │  │    │
│  │  requestId +       │  │  requestId +                     │  │    │
│  │  locale + CSRF     │  │  locale + CSRF                   │  │    │
│  └────────┬───────────┘  └──────────────────┬───────────────┘  │    │
│           │                                 │                  │    │
│  ┌────────▼──────────────────────────────────▼───────────────┐ │    │
│  │              Server Functions (createServerFn)             │ │    │
│  │  ┌──────────────────┐    ┌─────────────────────────┐      │ │    │
│  │  │ 管理端 SFn         │    │ 客户端 / 公开 SFn        │      │ │    │
│  │  │ adminPermGuard()  │    │ (无需鉴权)               │      │ │    │
│  │  └────────┬─────────┘    └───────────┬─────────────┘      │ │    │
│  │           │                          │                     │ │    │
│  │  ┌────────▼──────────────────────────▼─────────────┐      │ │    │
│  │  │  functionMiddleware: sfErrorLogger (覆盖所有 SF)  │      │     │
│  │  └─────────────────────┬───────────────────────────┘      │     │
│  └────────────────────────┼──────────────────────────────────┘     │
│                           │                                        │
│  ┌────────────────────────▼──────────────────────────────────┐    │
│  │              服务层 (src/services/)                           │    │
│  │   业务逻辑按模块拆分（.server / schemas / cache / types 四件套）        │    │
│  │   模块清单以 src/services/ 目录为准                                │    │
│  └────────────────────────┬──────────────────────────────────┘    │
│                           │                                        │
│  ┌────────────────────────▼──────────────────────────────────┐    │
│  │      @ucode/hub-lib（纯可复用）+ src/shared-services（app 单例）     │    │
│  │   lib: utils / cache / infra(通用非单例)；零全局态·不读 env-db·无日志   │    │
│  │   导出清单见 @ucode/hub-lib README；shared-services 承载 logger/jwt/      │    │
│  │   metrics/storage/scheduler/mail/sms/request-context                │    │
│  └────────────────────────┬──────────────────────────────────┘    │
│                           │                                        │
│  ┌────────────────────────▼──────────────────────────────────┐    │
│  │               PostgreSQL (Drizzle ORM)                    │    │
│  │   表清单见 database-design（以 src/db/schema/ 为准）               │    │
│  │   缓存实例见 cache-system（以 cache skill 清单为准）                  │    │
│  └───────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## 核心设计决策

### 1. 双端同构架构

同一套 TanStack Start 服务同时承载**管理端 SPA** 和**客户端 SSR 前台**：

| 维度 | 管理端 (`/admin/*`) | 客户端前台 (`/*`) |
|------|---------------------|-------------------|
| 渲染模式 | SPA (`ssr: false`) | SSR |
| UI 组件库 | Ant Design 6 | shadcn/ui + Tailwind |
| 认证方式 | `adminPermGuard` 中间件 | `beforeLoad` 调用 `getCurrentClientSFn` |
| Cookie | `hub_admin_token` | `hub_client_token` |
| 错误通知 | antd `message.error` | sonner `toast.error` |

### 2. 服务层与路由层分离（SFn 就近路由）

每类代码有唯一归属，**禁止越层**：

```
src/services/{module}/        # 服务层：业务逻辑 + zod 单一来源
├── {module}.server.ts        # 服务逻辑（可被 .functions.ts / 其他 .server.ts 引用）
├── {module}.schemas.ts       # zod schema 单一来源，服务层用 z.infer 派生类型
├── {module}.cache.ts         # 内存缓存实例（唯一归属）
└── {module}.types.ts         # 模块内部共享类型

src/routes/**/-mods/          # 路由层：UI 组件 + 就近的 SFn
├── *.functions.ts            # 消费该页面的 SFn（createServerFn）
└── 组件/路由局部 schema（*.server.ts 一律归 services/，禁止出现在 -mods/）
```

- `.server.ts` 中的函数**禁止**以 `SFn` 为后缀；`.functions.ts` 中的 `createServerFn`**必须**以 `SFn` 为后缀
- **SFn 就近路由**：RPC 边界随消费页面放入路由 `-mods/`，跨端实体 SFn 各拆到所属端路由；仅无页面消费的跨端共享 SFn（auth / captcha / track SDK / message / dict 选项 / 客户端可见配置 / 初始化状态 / 文件上传列表）留在 `services/<module>/`
- 被服务层 `z.infer` 派生或跨端复用的 schema 必须收 `services`；纯路由局部 schema 可随 SFn 留路由
- 路由文件与组件**禁止**直接 import `.server.ts`，一律经 SFn 调用

> 完整契约、SFn 放置规则、`src/services/` 准入门槛、违规自查 → [server-function](../.agents/skills/server-function/SKILL.md)

### 3. 路由分层

```
__root.tsx                    # HTML shell，按 pathname 前缀分发 AdminRootDocument / SSRRootDocument
├── 前台（SSR）               # / · /about · /devices · /messages · /login · /register · /forgot-password
├── /file/r/$id               # 文件读取路由（公共访问 + 同源校验，inline 预览/打开）
├── /api/metrics              # Prometheus 指标端点（Server Route handler，无鉴权）
└── admin.tsx                 # 管理端 SPA 根（SSR=false）；admin/login · admin/init · admin/forgot-password 无布局外壳
    └── admin/_admin.tsx      # 管理端鉴权布局（beforeLoad + SSR=false）
        ├── 仪表盘 / 用户（admins · clients）/ 角色（admin-roles · client-roles）
        ├── dicts · config · files · file-explorer · logs · operation-logs
        └── ai-providers · translations · track · messages · system（系统监控）
```

路由目录组织约定（`-mods/` companion 收纳、单页 vs 子路由决策矩阵、页面本体必须是路由文件、首页不目录化等）详见 [AGENTS.md](../AGENTS.md)；完整路由树以 `src/routes/` 目录（`src/routeTree.gen.ts`）为准。

### 4. 中间件执行链路

`src/start.ts` 注册全局中间件：

- **requestMiddleware**（按序）：`requestIdMiddleware`（透传/生成 x-request-id，写 ALS + 回写响应头）→ `localeMiddleware` → `createCsrfMiddleware`（仅 ServerFn）
- **functionMiddleware**：`sfErrorLogger`（覆盖所有 SF，鉴权失败记 warn / 系统异常记 error，埋 SF 耗时与结果指标，`toClientError()` 归一化后抛出）
- 各 SFn 内部经 `.middleware([adminPermGuard(perm)])` 等完成鉴权（管理端）或 `clientAuthGuard` / `clientPermGuard`（客户端）

完整中间件链路与 `resolveAdminAuthContext` 解析流程 → [auth-permission-model](auth-permission-model.md)。

### 5. 缓存分层

`MemoryCache<T>` 通用基类在 `@ucode/hub-lib/cache`（基于 Map，支持 TTL 过期与命名空间），实例按模块拆分在 `services/<module>/<module>.cache.ts`（config/dict/i18n 等系统域在 `shared-services/`）。每个实例只能在唯一服务模块中直接操作；读缓存函数必须懒加载（miss → 查库 → 写缓存 → 返回）。完整实例清单、设计、生命周期与失效策略 → [缓存体系](cache-system.md)。

### 6. 缓冲写入策略

两类高频写入数据（事件埋点 `trackEvent()`、操作日志 `logOperation()`）统一复用 `@ucode/hub-lib/batch-writer` 的 `BatchWriter`：fire-and-forget 入内存队列，满批/定时刷新、超上限丢弃最旧、进程退出强制刷入（参数见 [AGENTS.md](../AGENTS.md) 与 [事件埋点](event-tracking.md)）。

### 7. 请求链路与可观测性

**请求 ID 贯通**：`requestIdMiddleware`（`src/middleware/request-id.ts`）注册于 requestMiddleware 首位，优先透传上游 `x-request-id`（超长截断至 100）否则生成 UUID，写入 ALS 上下文并回写响应头。logger mixin 自动注入 requestId，操作审计落库 `operation_log.request_id`，实现日志与审计全链路追踪。

**Prometheus 指标**：`src/shared-services/metrics` 进程内注册表（`Counter` + `Histogram`，无第三方依赖），预置指标（清单以代码为准）：

| 指标 | 类型 | 标签 |
|------|------|------|
| `http_requests_total` | Counter | `method` |
| `server_function_requests_total` | Counter | `result`（success/error） |
| `server_function_duration_seconds` | Histogram | — |
| `external_calls_total` | Counter | `system` / `outcome`（success/error） |
| `external_call_duration_seconds` | Histogram | `system` |

- `/api/metrics` 端点（Server Route handler）输出 Prometheus text 格式，无鉴权，对外暴露需在反代层加访问控制
- 埋点位置：`app/server.ts`（HTTP 入口）、`src/middleware/sf-error-logger.ts`（SF 耗时/结果）、`src/shared-services/external-observability`（外部系统调用耗时/结果）
- 外部系统调用（`logExternalRequest`）不落审计表：成功调用仅入指标（日志为 `debug`，默认 `LOG_LEVEL=info` 下被过滤），失败日志为 `warn`；排障成功调用需临时 `LOG_LEVEL=debug`
- 进程内计数，多实例部署需实例层聚合 → [部署运维](deployment-ops.md)

**应用内系统监控**：`src/services/system-metric` 提供进程与存储的自监控，落点 `/admin/system/monitor`：

- 每分钟采样进程 CPU / 内存 / 事件循环延迟 / 活跃资源 / 请求增量 / 依赖健康 / 数据库总量，按天写入 `{STORAGE_DIR}/metrics/YYYY-MM-DD.ndjson`（保留 7 天，每日清理）
- 实时快照现读进程指标（不读文件、不探测数据库），供前端 5 秒轮询；历史趋势按范围分桶聚合采样文件
- STORAGE_DIR 占用与数据库各表占用按需查询 + 内存缓存（手动刷新强制重算）
- 与 Prometheus 指标是两套并存范式：前者面向管理端可视化，后者供外部监控系统拉取

## 数据流全景

```
用户操作 → 客户端埋点 SDK (track.ts)
    │
    ├─ trackEventSFn() ──→ track.functions.ts
    │                           │
    │                     track.server.ts（校验 track.validate / 元数据 track.meta）
    │                      ├─ 频控（60 条/分钟）+ 时间钳制
    │                      ├─ 校验事件名/属性键 + 值类型（trackEventMetaCache / trackPropertyMetaCache）
    │                      └─ 入缓冲 → 批量写入 track_event 表
    │
    └─ 管理端操作 ──→ logOperation()
                          │
                    operation-log.server.ts
                     └─ 入缓冲 → 批量写入 operation_log 表

管理端查询:
  track_event 表 → searchTrackEvents() / getTrackAnalytics()
  operation_log 表 → searchOperationLogs()
```

## 目录职责

目录层级与各目录职责见 [AGENTS.md「工程结构」](../AGENTS.md)（唯一目录树）与「包边界约定」章节；跨目录依赖遵循 [AGENTS.md「Server Function 依赖方向」](../AGENTS.md) 硬规则（`routes → services → (lib 基础库) → db`），缓存实例归属与可导入方约束见「内存缓存约定」。包级导出清单与集成约束见各子包 README（[lib](../packages/lib/README.md) / [ui-ssr](../packages/ui-ssr/README.md) / [ui-spa](../packages/ui-spa/README.md)）；图片处理（`@easyx/image-toolkit`）为外部 npm 包，约束见其 npm 包 README。

## 相关文档

| 文档 | 说明 |
|------|------|
| [@ucode/hub-lib README](../packages/lib/README.md) | @ucode/hub-lib 导出清单与边界 |
| [@ucode/hub-ui-ssr README](../packages/ui-ssr/README.md) | @ucode/hub-ui-ssr 组件清单与集成约定 |
| [@ucode/hub-ui-spa README](../packages/ui-spa/README.md) | @ucode/hub-ui-spa 组件清单与集成约定 |
| [认证与权限](auth-permission-model.md) | 双用户体系、RBAC、JWT、中间件链路 |
| [数据库设计](database-design.md) | 表清单、ER 图、列命名约定、约束汇总 |
| [缓存体系](cache-system.md) | MemoryCache 与缓存实例 |
| [国际化](i18n.md) | 两层翻译模型、语言检测链路、缓存与写路径 |
| [事件埋点](event-tracking.md) | 埋点链路与预置元数据 |
| [部署运维](deployment-ops.md) | 启动流程、定时任务、日志、部署 |

> 关键入口文件职责见 [AGENTS.md「工程结构」](../AGENTS.md) 唯一目录树（含各目录职责注释），不再重复罗列。
