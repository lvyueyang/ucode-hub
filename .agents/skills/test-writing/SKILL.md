---
name: test-writing
description: >
  单元测试编写指南。当需要为新模块编写 Vitest 测试、修复测试失败、
  理解三段式 vi.hoisted() mock 模式、或设置 mockDb 链式调用时触发。
---

# 单元测试编写

## 测试类型速判

| 被测模块位置 | 测试类型 | Mock 需求 | 测试文件位置 |
|-------------|---------|----------|-------------|
| `src/services/*/*.server.ts` | Service 测试 | 需 mock DB | `src/services/<module>/__tests__/<module>.test.ts` |
| `src/shared-services/*/`（纯逻辑） | 纯逻辑测试 | 无需 mock | `src/shared-services/<module>/__tests__/<module>.test.ts` |
| 路由 SFn schema | Schema 测试 | 无需 mock | 就近：路由 `__tests__/` 或 schema 定义模块 `__tests__/` |
| `src/middleware/` | 中间件类型测试 | 无需 mock | `src/middleware/__tests__/<module>.test.ts` |

**判断标准**：被测模块 import 了 `#/db` 或任何 `.server.ts` → Service 测试（需 mock）。

**命名**：测试文件默认 `<模块名>.test.ts`；允许按子模块/子功能拆分命名（如 `logs-cleanup.test.ts`、`log-reader.test.ts`、`forgot-password.test.ts`），只要位于被测模块的 `__tests__/` 目录内。

## Service 测试：三段式 Mock 模式

> ⚠️ **顺序至关重要**：所有 mock 必须在源模块 import 之前。源模块的 import 必须放在最后。

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// ═══════════════════════════════════════════════════
// 第 1 段：静态 vi.mock（无运行时依赖的模块）
// ═══════════════════════════════════════════════════
vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ═══════════════════════════════════════════════════
// 第 2 段：vi.hoisted() 创建 mock 对象
// ═══════════════════════════════════════════════════
const { mockGetContentTranslations } = vi.hoisted(() => {
  return { mockGetContentTranslations: vi.fn() };
});

// 外部服务 mock（使用 hoisted 值）
vi.mock("#/shared-services/i18n/i18n.server", () => ({
  getContentTranslations: mockGetContentTranslations,
}));

const { mockDb, mockRows } = vi.hoisted(() => {
  // 可 await 的 select 链：from/where/orderBy/limit/offset 均返回自身，
  // await 链时 resolve 到 mockRows 指定的行数组，覆盖 findFirst(limit) 与 findMany(where 即终点)
  const rows = vi.fn().mockResolvedValue([]);
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    orderBy: vi.fn(() => selectChain),
    limit: vi.fn(() => selectChain),
    offset: vi.fn(() => selectChain),
    innerJoin: vi.fn(() => selectChain),
  };
  Object.defineProperty(selectChain, "then", {
    value: (onFulfilled) => rows().then(onFulfilled),
  });
  return {
    mockDb: {
      select: vi.fn(() => selectChain),
      $count: vi.fn(),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn() })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn() })),
      })),
      delete: vi.fn(() => ({ where: vi.fn() })),
      transaction: vi.fn(),
    },
    mockRows: rows,
  };
});

// ═══════════════════════════════════════════════════
// 第 3 段：使用 hoisted 值的 vi.mock
// ═══════════════════════════════════════════════════
vi.mock("#/db", () => ({ db: mockDb }));

// ═══════════════════════════════════════════════════
// 第 4 段：所有 mock 之后才 import 被测模块
// ═══════════════════════════════════════════════════
import {
  getProductList,
  createProduct,
  updateProduct,
  deleteProduct,
} from "#/services/product/product.server";

// ═══════════════════════════════════════════════════
// 测试夹具
// ═══════════════════════════════════════════════════
const productRecord = {
  id: "p-1", name: "测试产品", description: "测试描述",
  status: "active", isPublished: false, sortOrder: 0,
  coverImageId: null,
  createdById: null, updatedById: null,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
};
```

## mockDb 完整模板 —— select 链统一承载所有查询

`mockDb.select` 返回一个**可 await 的查询链**（from/where/orderBy/limit/offset/innerJoin 均返回自身），`await` 链时 resolve 到 `mockRows` 控制的行数组。这样 `db.select().from(T).where(...).limit(1)`（findFirst）与 `db.select().from(T).where(...)`（findMany/列表）共用同一套 mock，无需为每张表单独声明 query 方法。`.server.ts` 模块之间的交叉引用可能在测试时意外触发其他表查询，统一走 select 链即可覆盖。

> 查询链可直接复用 `#/test-utils/db-mock` 的 `mockSelect(rows)` 工厂（可在 `vi.hoisted` 内调用），返回支持 from/where/innerJoin/leftJoin/groupBy/having/orderBy/limit/offset/$dynamic 且可被 await 的链对象，省去逐处手写链式 mock；适合返回值固定的查询。需要按用例切换返回值（如 findFirst 后再查列表）时，仍按上文用可变 `mockRows` 自建链。

> ⚠️ 由于 `vi.clearAllMocks()` 只清调用记录不清 mock 实现，`mockRows` 的返回值会跨测试残留。默认 `mockResolvedValue([])`；每个用例如需特定返回值，显式设置 `mockRows.mockResolvedValue(...)`；当 findFirst 与后续查询（如 loadDictCache 的列表查询）需要不同返回值时，用 `mockRows.mockReset().mockResolvedValueOnce(...).mockResolvedValue(...)` 按调用顺序编排。

## Mock 链式调用 Setup 速查

### select 查询（列表/分页）

```ts
mockRows.mockResolvedValue([productRecord]);      // 列表返回行数组
mockDb.$count.mockResolvedValue(1);               // 分页总数单独 mock
```

### findFirst（单条，where → limit(1) 后 await）

```ts
// 找到：行数组含一条记录，服务层取 [0]
mockRows.mockResolvedValue([productRecord]);
// 未找到
mockRows.mockResolvedValue([]);
```

### findMany（多条，where 即终点）

```ts
mockRows.mockResolvedValue([productRecord]);
```

### 同一用例内多个查询返回不同结果

```ts
// 按服务调用顺序用 mockResolvedValueOnce 编排，末位用 mockResolvedValue 兜底
mockRows
  .mockReset()
  .mockResolvedValueOnce([productRecord])       // 第一次 select（如 findFirst）
  .mockResolvedValueOnce([])                    // 第二次 select
  .mockResolvedValue([]);
```

### 断言 select 链被调用 / 未调用

```ts
expect(mockDb.select).toHaveBeenCalledTimes(2);
expect(mockDb.select).not.toHaveBeenCalled();
// 断言 where 条件内容时，可从 select 链的 where mock 取参数：
// const sql = extractSqlText(mockSelectChain.where.mock.calls[0][0]);
```

### insert

```ts
mockDb.insert.mockReturnValue({
  values: vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([productRecord]),
  })),
});
```

### update

```ts
mockDb.update.mockReturnValue({
  set: vi.fn(() => ({
    where: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([productRecord]),
    })),
  })),
});
```

### delete

```ts
mockDb.delete.mockReturnValue({
  where: vi.fn().mockResolvedValue(undefined),
});
```

### $count

```ts
mockDb.$count.mockResolvedValue(1);
```

## 测试命名规范

```ts
// describe 名称 = 被测函数名
// it 名称 = 中文场景描述
describe("getProductList", () => {
  beforeEach(() => {
    vi.clearAllMocks();  // ⚠️ 每个测试前必须清理
  });

  it("返回分页的产品列表", async () => {
    // setup mock ...
    const result = await getProductList();
    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  it("空列表返回 records 空数组", async () => {
    // setup mock 返回空 ...
    const result = await getProductList();
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("按状态筛选", async () => {
    // setup mock + 验证筛选参数 ...
  });
});

describe("createProduct", () => {
  beforeEach(() => vi.clearAllMocks());

  it("成功创建产品并返回记录", async () => {
    // ...
  });

  it("名称重复时抛出错误", async () => {
    // setup mock insert 抛出 ...
    await expect(
      createProduct({ name: "已存在的名称" }),
    ).rejects.toThrow();
  });
});
```

## 覆盖要求

每个导出函数**至少**覆盖以下场景：

| 场景 | 最低数量 | 示例 |
|------|---------|------|
| 正常路径 | 1-2 个 | 正常参数返回预期结果 |
| 边界条件 | 1-2 个 | 空列表、null 值、不存在、默认参数 |
| 错误路径 | 1 个 | DB 异常、参数非法、记录不存在 |

## Schema 测试模板

路由 SFn 的 Zod Schema 测试就近放置：实体 schema 测试在 `services/<module>/__tests__/` 目录，页面局部 schema 测试在路由 `__tests__/` 目录。**优先 import 真实 schema 对象**（源文件需导出），禁止本地复制副本导致测试与真实 schema 漂移。

```ts
import { describe, expect, it } from "vitest";

// 从 services 模块导入真实 schema（源文件需导出），而非复制定义
import { productCreateSchema } from "#/services/product/product.schemas";
import { z } from "zod";

describe("产品 Schema 校验", () => {
  describe("productCreateSchema", () => {
    it("合法创建参数应通过校验", () => {
      expect(() =>
        productCreateSchema.parse({ name: "新产品" }),
      ).not.toThrow();
    });

    it("缺失 name 应失败", () => {
      expect(() => productCreateSchema.parse({})).toThrow();
    });

    it("空字符串 name 应失败", () => {
      expect(() =>
        productCreateSchema.parse({ name: "" }),
      ).toThrow();
    });

    it("status 非法值应失败", () => {
      expect(() =>
        productCreateSchema.parse({ name: "标题", status: "deleted" }),
      ).toThrow();
    });

    it("默认值生效", () => {
      const result = productCreateSchema.parse({ name: "新产品" });
      expect(result.status).toBe("active");
      expect(result.isPublished).toBe(false);
    });
  });
});
```

## 运行测试

```bash
# hub 的测试（脚本自带 NODE_ENV=test，即 vitest run）
pnpm --filter @ucode/hub test            # 全量
pnpm --filter @ucode/hub test <file>     # 指定文件
pnpm --filter @ucode/hub exec vitest     # watch 模式（开发时推荐）
pnpm --filter "./hub/**" test            # hub 全部包（app + 三个 packages）
```

## 常见 Mock 错误

| 错误现象 | 原因 | 修复 |
|---------|------|------|
| `db.select(...).from(...).where(...).limit is not a function` | `mockDb.select` 返回的不是完整链（缺 limit/offset） | 使用模板中的可 await 查询链（from/where/orderBy/limit/offset 均返回自身） |
| `await` 链得到的是链对象而非行数组 | 查询链未挂 thenable | 用 `Object.defineProperty(selectChain, "then", ...)` 挂 then，`await` 时返回 `mockRows()` |
| 查询返回上一条用例的值 | `mockRows` 实现被 `vi.clearAllMocks()` 保留 | 用例开头显式 `mockRows.mockResolvedValue(...)` 或 `mockRows.mockReset()` |
| Mock 没有生效，仍调用真实 DB | `import` 在 `vi.mock` 之前 | 将被测模块的 `import` 移到 mock 之后 |
| 测试被上一个测试的 mock 值污染 | 缺少 `vi.clearAllMocks()` | 添加 `beforeEach(() => vi.clearAllMocks())` |
| hoisted 值在 `vi.mock` 中引用不到 | `vi.mock` 回调无法访问外部变量 | 用 `vi.hoisted()` 包裹 mock 对象声明 |
| `select.mockReturnValue` 不生效 | `mockDb.select` 初始定义不正确 | 确保 `select: vi.fn(() => selectChain)` |

## 相关 Skill

- 被测模块是 SFn → [server-function](../server-function/SKILL.md)
- 被测模块是新 CRUD → [admin-crud](../admin-crud/SKILL.md)
- 被测模块是 DB Schema → [db-schema](../db-schema/SKILL.md)
