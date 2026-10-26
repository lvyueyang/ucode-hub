---
name: architecture
description: >
  项目架构与分层规范。当需要理解或修改项目的目录分层、基础设施（缓存/请求上下文/批量缓冲/埋点/审计）、
  模块归属（lib vs services vs routes），或评估某段代码该放哪里时触发。
---

# 架构规范

## 目录分层

| 目录 | 定位 | 示例 |
|------|------|------|
| `packages/lib/` | 纯逻辑库（同构工具 + 通用非单例基础设施，**可原样移植到其他项目**） | `@ucode/hub-lib/cache`、`@ucode/hub-lib/ms`、`@ucode/hub-lib/semaphore` |
| `packages/ui-ssr/` | shadcn 基础组件（前台 SSR） | `@ucode/hub-ui-ssr/ui`、`@ucode/hub-ui-ssr/theme` |
| `packages/ui-spa/` | antd 管理端组件（antd 单实例） | `@ucode/hub-ui-spa/table`、`@ucode/hub-ui-spa/upload` |
| `src/shared-services/` | 应用级基础设施单例壳 + 系统级共享域（读 env / 引 logger / 需全局态；**非通用共享桶**） | `src/shared-services/logger`、`src/shared-services/jwt`、`src/shared-services/metrics` |
| `src/services/` | 领域服务层（`server` 业务逻辑 + `schemas` zod + `cache` + `types`）+ 跨端共享 SFn | `src/services/device/`、`src/shared-services/query/`、`src/services/admin-auth/` |
| `src/constants/` | 项目级常量 | `src/constants/editor-types.ts` |
| `src/validators/` | 跨模块共享的 zod schema | `src/validators/common.schemas.ts` |
| `src/types/` | 跨模块共享类型 | `src/types/query.ts` |
| `src/utils/` | app 同构工具（无状态或仅轻量模块内状态，client / server 皆可引用） | `src/utils/sfn-error.ts`、`src/utils/error-utils/`、`src/utils/custom-head.ts` |
| `src/middleware/` | 请求级中间件（鉴权/权限/locale/错误日志） | `src/middleware/admin-auth.ts` |
| `src/routes/` | 路由层（页面 + UI 组件 + 就近 SFn + beforeLoad 守卫） | `src/routes/admin/_admin/devices/` |

**依赖方向**：`routes → services → (lib 基础库) → db`，服务层不得反向依赖表现层——`services/**` **禁止** import `routes/**`（含路由 `-mods/`、路由组件与路由局部 schema）；services 的上游仅限表现层入口（routes / middleware / bootstrap / lib SDK）与服务间协作（如 `logCrud`、`query-utils`）。`src/shared-services/` 禁止引入业务逻辑。`services/<module>/` 是领域服务层的归属：`server`（业务逻辑/DB）+ `schemas`（zod 单一来源，server 用 `z.infer` 派生）+ `cache` + `types`；跨端共享的 SFn（auth/captcha/track/message/...）也可留在 services。`routes/**/-mods/` 放 UI 组件与**就近的 SFn**（SFn + 路由局部 schema 随页面），页面通过 SFn 调服务层，禁止直接 import `*.server.ts`。

**归属判定（按性质，不默认 shared-services）**：

| 性质 | 归属 |
|------|------|
| 纯逻辑且**可原样移植**（脱离本仓库的框架 / 协议 / 环境仍成立） | `@ucode/hub-lib` |
| 耦合 app 内部约定的同构工具（无状态或仅轻量模块内状态，client / server 皆可引用） | `src/utils/` |
| shadcn 组件 / antd 组件 | `@ucode/hub-ui-ssr` / `@ucode/hub-ui-spa` |
| AI 富文本工作台 / 图片处理 | 外部 npm 包 `@easyx/ai-rich-editor` / `@easyx/image-toolkit`（不在本仓库维护） |
| app 级服务单例 / 系统级共享域（读 env、引 logger、需全局态） | `src/shared-services/` |
| **服务端专属能力**（Node 专有 API / 原生依赖 / 大体积二进制资源） | 仅单一业务消费 → `services/<module>/` 内部文件；跨业务共享 → `src/shared-services/` |
| 业务逻辑 / 领域服务 | `src/services` 或路由层 |

**lib 拒收清单**（命中即不得进 lib，由 `packages/lib/src/__tests__/lib-boundary.test.ts` 机械守门）：读取 `process.env` / `import.meta.env`、耦合 logger、模块级或 `globalThis` 单例、依赖框架（React / TanStack Start）或 UI 包（`@ucode/hub-ui-*`）、耦合 app 私有协议或权限码（`SfnError*` / `AdminAuthError` / `ADMIN_PERMISSIONS`）、反向引用 `#/*`、服务端专属运行时能力。

`shared-services` **不是「凡多处引用即入」的通用共享桶**：app 同构工具、无状态 helper 一律归 `src/utils/`（如客户端 SFn 错误处理 `#/utils/sfn-error`）。

> 每个子包的导出清单与边界见 [core](../../../packages/lib/README.md) / [ui-ssr](../../../packages/ui-ssr/README.md) / [ui-spa](../../../packages/ui-spa/README.md)。

## 基础设施

### 请求上下文（AsyncLocalStorage）

- `#/shared-services/request-context`：`runWithRequestContext` / `getRequestContext` / `getRequestOperator`
- 鉴权中间件（admin/client）验证身份后用 `runWithRequestContext({ operator })` 包裹 `next()`；`requestIdMiddleware`（requestMiddleware 首位）用 `runWithRequestContext({ requestId })` 注入请求 ID
- 下游所有异步调用通过 `getRequestOperator()` 读取当前操作者；无上下文（cron/后台任务）兜底返回 system
- 消费方：`logOperation()` 落库 requestId、`logExternalRequest()`（`#/shared-services/external-observability`）记录外部系统调用时从 ALS 读操作者；实现全链路追踪

### 可观测性（请求 ID + Prometheus）

- **请求 ID**：`src/middleware/request-id.ts` 透传/生成 `x-request-id`（超长截断至 100），写 ALS + 回写响应头；logger mixin 自动注入 requestId 与操作者身份（operatorId/Name/Type）
- **Prometheus 指标**：`src/shared-services/metrics` 进程内注册表（`Counter` + `Histogram`），预置 `http_requests_total` / `server_function_requests_total` / `server_function_duration_seconds` / `external_calls_total` / `external_call_duration_seconds`；`/api/metrics` 端点（Server Route，无鉴权）；新增指标须在该模块注册并同步 docs/architecture-overview.md 与 docs/deployment-ops.md

### 批量缓冲写入（BatchWriter）

- `@ucode/hub-lib/batch-writer`：通用缓冲写入器（定时/定量批量 INSERT + 容量上限 + shutdown 强制刷新）
- track 埋点与 operation-log 复用；operation-log 仅承载用户操作审计（CRUD/登录/注册），外部系统调用改走 pino + Prometheus 指标（不落审计表）
- **禁止**在模块内重复实现缓冲逻辑；新增高频写入场景优先复用 BatchWriter

### 操作日志审计

- `src/shared-services/operation-log/operation-log.server.ts`：`logOperation()` fire-and-forget；SFn 写 CRUD 审计**必须**用 `logCrud()` 一行式封装（自动装配操作人 + targetType 默认值）
- 审计表只留用户操作：`logOperation` 经 BatchWriter（上限 1000）落 `operation_log`；外部系统调用**不落审计表**，改由 `#/shared-services/external-observability` 的 `logExternalRequest()` 记 pino 结构化日志（成功 debug / 失败 warn）+ Prometheus 指标（`external_calls_total` / `external_call_duration_seconds`）
- 操作者身份经 request-context（AsyncLocalStorage）由鉴权中间件注入，无上下文兜底 system；requestId 自动从 ALS 捕获落库（`operation_log.request_id`），实现日志与审计全链路追踪
- 进程退出时自动刷新缓冲（SIGTERM / SIGINT）

### 内存缓存

- `MemoryCache<T>` 在 `@ucode/hub-lib/cache`，实例按模块拆分在 `services/<module>/<module>.cache.ts`
- 每个实例只能在唯一服务模块中直接操作，禁止跨模块 import 缓存实例
- 读缓存必须懒加载：cache miss → 查库 → 写缓存 → 返回
- 详见 [cache](../cache/SKILL.md)

### antd 静态方法桥接

- 管理端 `message`/`modal`/`notification` 统一从 `@ucode/hub-ui-spa/antd-static` 导入
- **禁止**静态 `import { message } from "antd"`（独立 root 会脱离 StyleProvider layer 与 ConfigProvider 主题）
- `AntdStaticBridge` 已挂载在管理端 `<App>` 内，从 `App.useApp()` 捕获实例
- 调用必须发生在 App 挂载后的交互/副作用中；loader/beforeLoad 阶段调用会抛错（宁抛错不静默）

## Schema 单一来源

- 有入参 SFn 的 zod schema 统一定义在 `.schemas.ts` 文件
- 服务层输入类型用 `z.infer<typeof schema>` 派生，**禁止**手写重复接口 + `as XxxInput` 桥接断言
- 跨路由共享的 schema 放 `src/services/<module>/<module>.schemas.ts`；跨模块共享的放 `src/validators/`

```ts
// ✅ 正确：schema 单一来源，服务层类型派生
// services/device/device.schemas.ts 声明 deviceRenameSchema，device.server.ts 按它派生入参类型：
export type DeviceRenameInput = z.infer<typeof deviceRenameSchema>;
export const renameDevice = async (input: DeviceRenameInput) => { ... };

// ❌ 错误：手写接口 + as 断言桥接
export interface DeviceRenameInput { id: string; name: string; ... }
const result = await renameDevice(data as DeviceRenameInput);
```

## 违规自查

- 领域实体的 `server`/`schemas`/`cache`/`types` 拆在路由 `-mods/` 里 → 收编到 `services/<module>/`，服务层只保留一处归属
- 路由 `-mods/` 下出现 `*.server.ts` → 按实体归属收编进 `services/<module>/`（`-mods/` 只放 SFn / 路由局部 schema / 组件 / 纯函数 / 常量）
- 可独立访问的页面视图以组件/函数形式塞进 `-mods/` → 应建成路由文件（页面本体禁止入 `-mods/`）
- 单路由文件内用 state/Tab 硬分屏承载 ≥2 个静态视图 → 拆为每视图一个路由文件
- 实体的 SFn 应就近放在消费页面的路由 `-mods/`，未在页面消费的跨端共享 SFn 才留在 services
- `.functions.ts` handler 中出现 DB 查询/业务逻辑 → 提取到 `.server.ts`
- `lib/` 中出现业务常量/业务类型 → 移到 `constants/` 或 `services/`
- `lib/` 中出现服务端专属能力（Node 专有 API / 原生依赖 / 大体积二进制资源）→ 按共享面下移：仅单一业务消费 → `services/<module>/`，跨业务共享 → `src/shared-services/`
- `lib/` 中出现项目私有协议耦合（如 `SfnError*` 消息后缀、中文 UI 文案约定）或 app 权限码 / 类型 / 表结构耦合 → 归 `src/utils/` 或 `services/`
- 把 app 同构工具 / 无状态 helper 塞进 `shared-services/` → 归 `src/utils/`（`shared-services` 只放 app 级服务单例 / 系统级共享域）
- 跨模块直接 `import` 缓存实例 → 改为所属模块导出函数
