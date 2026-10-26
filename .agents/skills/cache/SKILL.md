---
name: cache
description: >
  内存缓存使用指南。缓存实例只能在所属模块中操作，其他模块通过导出函数访问。
  涉及缓存读写、懒加载模式、新增缓存、缓存测试 mock 时触发。
---

# 内存缓存开发

## 快速索引

| 需求 | 跳转 |
|------|------|
| 了解缓存所属模块 | → [缓存实例所有权](#缓存实例所有权) |
| 实现缓存读操作 | → [懒加载模式](#懒加载模式) |
| 新增缓存实例 | → [新增缓存实例](#新增缓存实例) |
| 写测试 mock | → [测试-mock-模式](#测试-mock-模式) |
| 自查违规 | → [违规自查清单](#违规自查清单) |

## 缓存实例所有权

`MemoryCache<T>` 泛型类在 `@ucode/hub-lib/cache`，各实例按模块拆分在 `services/<module>/<module>.cache.ts`，每个实例**只能在唯一一个服务端模块中直接操作**：

| 缓存实例 | 实例文件 | 所属模块 | 存储内容 |
|----------|----------|----------|----------|
| `configCache` | `config.cache.ts` | `src/shared-services/config/config.server.ts` | 系统配置全量列表（key=`"all"`） |
| `configTranslationCache` | `config.cache.ts` | `src/shared-services/config/config.server.ts` | 系统配置的 content_translation 翻译 |
| `dictCache` | `dict.cache.ts` | `src/shared-services/dict/dict.server.ts` | 字典条目（按 slug 分片） |
| `uiTranslationCache` | `i18n.ui.cache.ts` | `src/shared-services/i18n/i18n.ui.server.ts` | UI 文案翻译（按 locale 分片） |
| `clientUserCache` | `client-user.cache.ts` | `src/services/client-auth/client-auth.server.ts` | 客户端用户（按 userId，TTL 5 分钟） |
| `adminUserCache` | `admin-user.cache.ts` | `src/services/admin-auth/admin-auth.server.ts` | 管理员用户（按 userId，TTL 5 分钟） |
| `trackEventMetaCache` | `track.cache.ts` | `src/services/track/track.meta.ts` | 元事件名校验（`track.server.ts` 经 track.meta 导出的查询函数只读访问） |
| `trackPropertyMetaCache` | `track.cache.ts` | `src/services/track/track.meta.ts` | 元属性键及数据类型（同上） |
| `sessionRateCache` | `track.validate.ts` | `src/services/track/track.validate.ts` | 埋点 per-session 频控计数（TTL 60s，**内部实例**，不遵循懒加载/新增流程） |

> 实例清单以代码为准（领域数据缓存 + 内部频控缓存）。新增缓存实例时须**同步**更新本表与 [docs/cache-system.md](../../../docs/cache-system.md)。

## 核心规则

1. **缓存实例只能在所属模块中直接操作**（get/set/delete/has/clear），其他模块禁止跨模块 import 缓存实例
2. 外部模块访问缓存数据时，必须调用所属模块导出的函数
3. 读缓存的函数必须实现**懒加载模式**（cache miss → 查库 → 写缓存 → 返回）

## 懒加载模式

所有读缓存的函数必须按如下模板实现：

```ts
export async function getXxx(key: string): Promise<string> {
  let cached = xxxCache.get("all");
  if (!cached) {
    await loadXxxCache();
    cached = xxxCache.get("all") ?? defaultValue;
  }
  return cached.find((item) => item.key === key)?.value ?? "";
}
```

关键点：
- 先查缓存，命中直接返回
- 缓存 miss 时调用 `load*Cache()` 从数据库加载并回填缓存
- 再次查缓存获取结果并返回 — 双查模式确保缓存数据一定存在

已符合此模式的示例：
- `src/shared-services/config/config.server.ts` 中的 `getConfig(key)` — 先查 `configCache`，miss 则 `await loadConfigCache()`
- `src/shared-services/dict/dict.server.ts` 中的 `getDictLabel(slug, value)` — 先 `ensureCache()` 再查 `dictCache`
- `src/shared-services/i18n/i18n.ui.server.ts` 中的 `getUITranslations(locale)` — 先查 `uiTranslationCache`，miss 则查库回填

## 新增缓存实例

当需要新的内存缓存时，按以下步骤操作：

1. 在所属服务端模块目录下新建 `<模块名>.cache.ts`（如 `shared-services/config/config.cache.ts`），定义 `MemoryCache` 实例并导出缓存条目类型，指定 `name` 和合适的 `defaultTTL`
2. 明确其所属服务端模块（一个模块可以拥有多个缓存，但每个缓存只能属于一个模块）
3. 在所属模块中：
   - 实现 `load*Cache()` 函数（清空旧缓存 + 从数据库加载 + 写入缓存）
   - 实现对外导出的读函数（遵循懒加载模式）
4. 若为高频读取的元数据（如 track 元事件），在 `src/bootstrap.ts` 的启动流程中加载确保首次请求前就绪；一般业务缓存懒加载即可
5. 其他模块通过该模块的导出函数访问数据，禁止直接 import 缓存实例

## 测试 mock 模式

测试中对缓存必须使用 `vi.mock`，禁止直接 import 缓存实例并操作：

```ts
// 正确：vi.mock 三段式（mock 缓存实例所在的模块文件）
const { mockCache } = vi.hoisted(() => ({
  mockCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    has: vi.fn(),
    keys: vi.fn(() => []),
  },
}));
vi.mock("#/shared-services/config/config.cache", () => ({ configCache: mockCache }));

// 错误：直接 import 并操作
import { configCache } from "#/shared-services/config/config.cache";
beforeEach(() => configCache.clear());
```

pre setup step → `vi.hoisted()` 创建 mock 对象 → `vi.mock` 注入 mock → import 被测模块。

## 违规自查清单

新增或修改缓存相关代码时，逐项检查：

1. 是否在非所属模块中直接 import 了缓存实例？
2. 读缓存函数是否有 cache miss → 查库 → 写缓存 → 返回的完整后备流程？
3. 启动时是否 `await` 了缓存加载（避免首次请求缓存未就绪）？
4. 测试文件是否用 `vi.mock` mock 了缓存实例？
