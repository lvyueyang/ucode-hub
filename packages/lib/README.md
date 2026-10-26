# @ucode/hub-lib

纯可复用逻辑库，无 React 依赖、零全局态、不读 env/db、不做日志耦合。`src/` 下每个 subpath 对应一个模块子文件夹（含 `index.ts` 入口与内部文件，如 `ms/`、`cache/`、`semaphore/`），是 ui-ssr / ui-spa / app / shared-services 四者的公共底座。

## 定位与边界

| 项 | 约定 |
|----|------|
| 是否含 React | 否，纯 TS 逻辑 |
| 全局单例 | 零全局单例：禁止创建模块级或 globalThis 单例 |
| 环境/DB 读取 | 禁止读取 `process.env` / DB |
| 日志耦合 | **禁止** import 任何 logger / 日志单例；错误向上抛出（throw/reject），警告用 `console` 直接输出或经可选 `onEvent` 钩子推事件（供宿主接管，如 `batch-writer`） |
| 客户端引用安全 | `utils/`、`cache/` 为同构纯逻辑，客户端可安全引用 |
| 服务端保护 | `infra/` 仅服务端；客户端组件禁止引用 `infra/` 对应模块，宿主 `vite.config.ts` 的 import-protection 会把服务端专属依赖（清单见其 `importProtection.client.specifiers`）拒于客户端 bundle 之外 |
| 反向依赖 | lib 内不得出现 `#/services`、`#/shared-services`、`#/db`、`#/routes` 反向引用 |

> app 绑定单例（logger / jwt / metrics / storage / scheduler / mail / sms / request-context）已迁至宿主 `src/shared-services/`；i18n 类型与配置已并入 `src/shared-services/i18n/`，均不在 lib 内。

## 目录分层与 subpath 导出

`package.json` 的 `exports` 将每个模块扁平映射为一个 subpath，无根桶。跨包引用一律使用 `@ucode/hub-lib/<subpath>`。

### utils/（同构纯工具）

| subpath | 源文件 | 关键导出 |
|---------|--------|----------|
| `@ucode/hub-lib/ms` | `src/ms/index.ts` | `ms(value, options?)` 时间字符串 ⇄ 毫秒互转；`parse` / `parseStrict` / `format` |
| `@ucode/hub-lib/export` | `src/export/index.ts` | `toCsv(rows, columns)`（带 UTF-8 BOM，Excel 兼容）、`toJson(data)`、`downloadFile(content, filename, mimeType)` |
| `@ucode/hub-lib/match-permission` | `src/match-permission/index.ts` | `matchPermission(rolePermissions, requiredCode)` 权限码匹配（`**` → 精确 → `group:*` 三级优先级） |
| `@ucode/hub-lib/cn` | `src/cn/index.ts` | `cn(...inputs)` className 合并（clsx + tailwind-merge） |
| `@ucode/hub-lib/clipboard` | `src/clipboard/index.ts` | `copyToClipboard(text)` 复制到剪贴板（Clipboard API 优先，非安全上下文退回 `execCommand` 兜底，返回是否成功） |
| `@ucode/hub-lib/date-format` | `src/date-format/index.ts` | `DEFAULT_TASK_TIME_ZONE`（`Asia/Shanghai`，业务统一时区）、`DATE_ONLY_REGEX`、`toDateString(date)`、`parseDateOnly(dateStr)`、`toDayRange(dateStr)`（按业务时区解析天边界，不依赖服务器时区） |
| `@ucode/hub-lib/format-bytes` | `src/format-bytes/index.ts` | `formatBytes(bytes, precision?)` 字节数 → `B / KB / MB / GB / TB` 可读字符串（B 级不带小数，非正数与非法数值返回 `0 B`） |

### cache/

| subpath | 源文件 | 关键导出 |
|---------|--------|----------|
| `@ucode/hub-lib/cache` | `src/cache/index.ts` | `MemoryCache<T>` 泛型内存缓存：`get` / `set(key, value, ttl?)` / `delete` / `has` / `clear` / `keys` / `size`，`defaultTTL` 与 `name` 可配置，`ttl=0` 永不过期，`get()` 自动清理过期项 |

### infra/（仅服务端，通用非单例）

| subpath | 源文件 | 关键导出 | 说明 |
|---------|--------|----------|------|
| `@ucode/hub-lib/storage` | `src/storage/index.ts` | `StorageAdapter` 接口（save / read / delete / getUrl / exists） | 纯契约；实现与单例在宿主 `shared-services/storage` |
| `@ucode/hub-lib/batch-writer` | `src/batch-writer/index.ts` | `BatchWriter<T>` 通用批量缓冲写入器（满 `batchSize` 立即刷 / 定时 `flushInterval` 刷 / 超 `maxBufferSize` 丢弃最旧 / `shutdown()` 强制刷；`flush()` 失败向上抛、警告经 `onEvent` 钩子） | 日志解耦，`onEvent` 供宿主接管 |
| `@ucode/hub-lib/semaphore` | `src/semaphore/index.ts` | `Semaphore` 并发限流（`acquire` / `release` / `activeCount` / `queueLength`）、`SemaphoreTimeoutError`；许可打满时有界排队，队列满 / 等待超时拒绝 | 纯逻辑类 |
| `@ucode/hub-lib/task-manager` | `src/task-manager/index.ts` | `createTaskManager<TState, TEvent>()` 内存任务管理器（状态机 + TTL 惰性清理 + 事件缓冲 / SSE 订阅与断线回放） | 纯逻辑工厂 |

> 原属 lib 的 app 绑定模块（logger / jwt / request-context / scheduler / mail / sms / storage 实现）已迁至宿主 `src/shared-services/`；`i18n.types` / `i18n.config` 已并入 `src/shared-services/i18n/`。AI 已下沉为 app 服务层 `src/shared-services/ai`（基于 TanStack AI），均由宿主承担，lib 保持纯可复用。

## 主要外部依赖

`clsx` / `tailwind-merge`（cn）。

## 测试

`pnpm --filter @ucode/hub-lib test`。各模块测试就近放置在 `__tests__/` 子目录，覆盖 utils / cache / infra 全部导出。

## 相关文档

- 应用层架构与目录职责：[docs/architecture-overview.md](../../docs/architecture-overview.md)
- 缓存体系（实例归属与懒加载约定）：[docs/cache-system.md](../../docs/cache-system.md)
- 数据库 Schema（业务层，位于 app）：[docs/database-design.md](../../docs/database-design.md)
- 组件库：[@ucode/hub-ui-ssr](../ui-ssr/README.md)（shadcn）、[@ucode/hub-ui-spa](../ui-spa/README.md)（antd）
