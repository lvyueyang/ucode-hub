---
name: admin-crud
description: >
  新增管理端 CRUD 模块完整指南。当需要创建新的后台管理实体
  （如"产品管理""分类管理""公告管理"等带列表/创建/编辑的管理页面）时触发。
  ——引用 db-schema、server-function、permission、test-writing、i18n skill。
---

# 新增管理端 CRUD 模块

## 前置准备

开始前确认以下信息：

```
□ 实体中文名：________（如"产品"）
□ 实体英文名：________（如 Product，PascalCase）
□ 路由路径：________（如 /admin/products，kebab-case 复数）
□ 表名：________（如 product，单数 snake_case）
□ 模块标识：________（如 product，用于 permission code、logCrud module）

□ 是否需要软删除？（deleted_at）     □ 是  □ 否
□ 是否有状态机？（status 列）        □ 是  □ 否，状态值：________
□ 是否需要翻译？（实体字段翻译）      □ 是  □ 否
□ 是否有字典关联？（DictSelect）      □ 是  □ 否，字典 slug：________
□ 是否需要富文本编辑器？              □ 是  □ 否
```

**参考实现**：`src/routes/admin/_admin/devices/` —— 列表 + 筛选 + 操作列 + 弹窗操作的真实模块，对照参考。

## 文件生成清单

按顺序创建以下文件。将 `<ModuleName>` 替换为 PascalCase（如 `Product`），`<module-name>` 替换为 kebab-case（如 `product`）。

| # | 文件 | 用途 | 参考 Skill |
|---|------|------|-----------|
| 1 | `src/db/schema/<module-name>.ts` | Drizzle 表定义 | [db-schema](../db-schema/SKILL.md) |
| 2 | `src/db/schema/index.ts` | 追加 export | — |
| 3 | `src/permissions/admin-permissions.ts` | 追加权限码 | [permission](../permission/SKILL.md) |
| 4 | `src/services/<module-name>/<module-name>.schemas.ts` | Zod Schema（单一来源） | — |
| 5 | `src/services/<module-name>/<module-name>.server.ts` | 服务层 helper | — |
| 6 | `src/routes/admin/_admin/<module-name>/-mods/<module-name>.functions.ts` | SFn 包装器（就近路由） | [server-function](../server-function/SKILL.md) |
| 7 | `src/routes/admin/_admin/<module-name>/-mods/<moduleName>Columns.tsx` | 表格列工厂（含操作列） | — |
| 8 | `src/routes/admin/_admin/<module-name>/-mods/<ModuleName>Form.tsx` | antd Form 组件（抽屉承载） | — |
| 9 | `src/routes/admin/_admin/<module-name>/index.tsx` | 列表页（含新建 / 编辑抽屉） | — |
| 10 | `src/services/<module-name>/__tests__/<module-name>.test.ts` | 服务层测试 | [test-writing](../test-writing/SKILL.md) |
| 11 | 路由目录 `__tests__/`（schema 就近测试） | 追加 Schema 测试 | [test-writing](../test-writing/SKILL.md) |

> 服务层（schemas/server）统一收在 `src/services/<module-name>/`，SFn 就近放路由 `-mods/`（import services 的 schema/server），`-mods/` 同时放 UI 组件（Columns / Form）。**不创建 `create.tsx` / `$id/edit.tsx`**：新建 / 编辑统一在列表页内 `AdminFormDrawer` 完成。参考实现：`src/services/device/` + `src/routes/admin/_admin/devices/`。

---

## Step 1：创建 DB Schema

> 详细规范参考 [db-schema](../db-schema/SKILL.md)

创建 `src/db/schema/<module-name>.ts`：

```ts
/**
 * <实体中文名>表
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { adminUser } from "./admin-user";
import { file } from "./file";

export const product = pgTable(
  "product",
  {
    id: uuid().defaultRandom().primaryKey(),

    // 业务列 — 按实际字段替换
    name: varchar({ length: 200 }).notNull(),
    description: text("description"),
    status: varchar({ length: 20 }).default("active").notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),

    // 审计列 — 如果需要
    createdById: uuid("created_by_id").references(() => adminUser.id),
    updatedById: uuid("updated_by_id").references(() => adminUser.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // 软删除 — 按需
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_product_created_at").on(table.createdAt),
  ],
);
```

## Step 2：注册 Schema 导出

编辑 `src/db/schema/index.ts`，在末尾追加：

```ts
export { product } from "./product";
```

## Step 3：添加权限码

> 详细规范参考 [permission](../permission/SKILL.md)

编辑 `src/permissions/admin-permissions.ts`，在 `ADMIN_PERMISSIONS` 对象中追加：

```ts
// 产品管理
PRODUCT_VIEW: definePermission(
  "product:view",
  "查看产品",
  "允许查看产品列表和详情",
),
PRODUCT_CREATE: definePermission(
  "product:create",
  "创建产品",
  "允许创建新的产品",
),
PRODUCT_EDIT: definePermission(
  "product:edit",
  "编辑产品",
  "允许编辑已有产品",
),
PRODUCT_PUBLISH: definePermission(
  "product:publish",
  "产品上下架",
  "允许在列表内切换产品上架状态",
),
PRODUCT_DELETE: definePermission(
  "product:delete",
  "删除产品",
  "允许删除产品（软删除）",
),
```

**标准集**：每个模块至少需要 `view` / `create` / `edit` / `delete` 四个权限。如果模块无状态机，可以省略 `publish`；无导出功能可省略 `export`。

## Step 4：创建服务层

创建 `src/services/<module-name>/<module-name>.server.ts`。提供纯 DB 操作函数，不包含 `createServerFn`。

```ts
/**
 * <实体中文名>服务层：CRUD 操作
 */
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "#/db/index";
import { product } from "#/db/schema";
import type { PaginatedSortParams } from "#/types/query";
import {
  buildSortClause,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";

export type ProductRecord = typeof product.$inferSelect;

// ── 列表查询（分页 + 排序） ──

export async function getProductList(
  params?: PaginatedSortParams & { isPublished?: boolean },
) {
  const {
    isPublished,
    page = 1,
    pageSize = 20,
    sortField,
    sortOrder,
  } = params ?? {};
  const offset = paginationOffset(page, pageSize);

  const conditions = [notDeleted(product.deletedAt)];
  if (isPublished !== undefined) {
    conditions.push(eq(product.isPublished, isPublished));
  }
  const whereCondition = and(...conditions);

  const sortFieldMap = {
    sortOrder: product.sortOrder,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
  const direction = buildSortClause(
    sortFieldMap, sortField, sortOrder, "sortOrder",
  );

  const orderBy = sortField
    ? [direction]
    : [desc(product.sortOrder), desc(product.createdAt)];

  return executePaginatedQuery(
    db.select().from(product).where(whereCondition).orderBy(...orderBy)
      .limit(pageSize).offset(offset),
    db.$count(db.select().from(product).where(whereCondition)),
    page, pageSize,
  );
}

// ── 单条查询 ──

export async function getProductById(
  id: string,
): Promise<ProductRecord | null> {
  const [record] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, id), notDeleted(product.deletedAt)))
    .limit(1);
  return record ?? null;
}

// ── 创建 ──

export async function createProduct(params: {
  name: string;
  description?: string;
  status?: string;
  isPublished?: boolean;
  sortOrder?: number;
  createdById?: string;
}): Promise<ProductRecord> {
  const [record] = await db.insert(product).values({
    name: params.name,
    description: params.description ?? null,
    status: params.status ?? "active",
    isPublished: params.isPublished ?? false,
    sortOrder: params.sortOrder ?? 0,
    createdById: params.createdById ?? null,
  }).returning();

  return record;
}

// ── 更新 ──

export async function updateProduct(
  id: string,
  params: {
    name?: string;
    description?: string;
    status?: string;
    isPublished?: boolean;
    sortOrder?: number;
  },
): Promise<ProductRecord | null> {
  const existing = await getProductById(id);
  if (!existing) return null;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (params.name !== undefined) updateData.name = params.name;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.status !== undefined) updateData.status = params.status;
  if (params.isPublished !== undefined) updateData.isPublished = params.isPublished;
  if (params.sortOrder !== undefined) updateData.sortOrder = params.sortOrder;

  const [updated] = await db.update(product)
    .set(updateData)
    .where(eq(product.id, id))
    .returning();

  return updated ?? null;
}

// ── 单字段更新（列表内联编辑） ──

/** 修改排序权重：仅更新一个字段，避免复用整表更新回写其它字段 */
export async function updateProductSortOrder(
  id: string,
  sortOrder: number,
): Promise<boolean> {
  const existing = await getProductById(id);
  if (!existing) return false;

  await db.update(product)
    .set({ sortOrder, updatedAt: new Date() })
    .where(eq(product.id, id));

  return true;
}

/** 变更上架状态：仅更新一个字段 */
export async function setProductPublished(
  id: string,
  isPublished: boolean,
): Promise<boolean> {
  const existing = await getProductById(id);
  if (!existing) return false;

  await db.update(product)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(product.id, id));

  return true;
}

// ── 软删除 ──

export async function deleteProduct(id: string): Promise<boolean> {
  const existing = await getProductById(id);
  if (!existing) return false;
  await db.update(product)
    .set({ deletedAt: new Date() })
    .where(eq(product.id, id));
  return true;
}
```

**关键点**：
- `updatedAt` 在每次更新时手动设为 `new Date()`
- 更新时用 `Record<string, unknown>` 动态构建，避免 `undefined` 覆盖数据库
- 所有查询使用 `notDeleted()` 过滤软删除记录
- 排序权重 / 上架状态等**单字段修改各配一个函数**（仅 `set` 该字段），不复用整表更新

## Step 5：创建 Zod Schema

创建 `src/services/<module-name>/<module-name>.schemas.ts`：

```ts
import { z } from "zod";
import {
  listSchema,
  togglePublishedSchema,
  updateSortOrderSchema,
} from "#/validators/common.schemas";

export const getProductSchema = z.object({
  id: z.string().min(1),
});

// 列表查询：以 listSchema 为基座 .extend，保证 page / pageSize / sort 全链路一致
export const productListSchema = listSchema.extend({
  isPublished: z.boolean().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
});

export const updateProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  isPublished: z.boolean(),
  sortOrder: z.number().int().optional(),
});

// 单字段更新：直接复用公共 schema，禁止为列表内联编辑再写一份
export const updateProductSortSchema = updateSortOrderSchema;
export const publishProductSchema = togglePublishedSchema;
```

**注意**：
- `create` schema 用 `.default()`，`update` schema 通常要求必填（所有值由表单提交）
- 列表 schema 命名固定为 `<模块>ListSchema`，业务筛选字段只在此处 `.extend`，不在 SFn 里另起 `z.object`

## Step 6：创建 SFn 包装器

> 详细规范参考 [server-function](../server-function/SKILL.md)

创建 `src/routes/admin/_admin/<module-name>/-mods/<module-name>.functions.ts`：

```ts
/**
 * <实体中文名>路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  createProductSchema,
  getProductSchema,
  productListSchema,
  publishProductSchema,
  updateProductSchema,
  updateProductSortSchema,
} from "#/services/product/product.schemas";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProductList,
  setProductPublished,
  updateProduct,
  updateProductSortOrder,
} from "#/services/product/product.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取产品列表（分页 / 筛选 / 排序） */
export const getProductListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_VIEW)])
  .validator(productListSchema)
  .handler(async ({ data }) => {
    // pageSize 原样透传，服务层不得硬编码，否则前端每页条数控件失效
    return getProductList(data);
  });

export const getProductByIdSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_VIEW)])
  .validator(getProductSchema)
  .handler(async ({ data: { id } }) => {
    return getProductById(id);
  });

export const createProductSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_CREATE)])
  .validator(createProductSchema)
  .handler(async ({ data, context }) => {
    const record = await createProduct({
      ...data,
      createdById: context.user.id,
    });
    // fire-and-forget 审计，自动装配操作人 + targetType 默认 module
    logCrud(context.user, "product", "create", { id: record.id, name: record.name });
    return record;
  });

export const updateProductSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_EDIT)])
  .validator(updateProductSchema)
  .handler(async ({ data, context }) => {
    const record = await updateProduct(data.id, { ...data });
    logCrud(context.user, "product", "update", { id: data.id, name: data.name });
    return record;
  });

/** 删除产品（软删除） */
export const deleteProductSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_DELETE)])
  .validator(getProductSchema)
  .handler(async ({ data: { id }, context }) => {
    const record = await getProductById(id);
    await deleteProduct(id);
    logCrud(context.user, "product", "delete", {
      id,
      name: record?.name ?? id,
    });
    return { success: true };
  });

/** 列表内联修改排序权重（仅更新一个字段） */
export const updateProductSortSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_EDIT)])
  .validator(updateProductSortSchema)
  .handler(async ({ data: { id, sortOrder }, context }) => {
    const updated = await updateProductSortOrder(id, sortOrder);
    if (!updated) throw new Error("产品不存在或已被删除");
    logCrud(context.user, "product", "update", { id }, {
      detail: { field: "sortOrder", to: sortOrder },
    });
    return { success: true };
  });

/** 变更上架状态（列表内联开关） */
export const setProductPublishedSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.PRODUCT_PUBLISH)])
  .validator(publishProductSchema)
  .handler(async ({ data: { id, isPublished }, context }) => {
    const record = await getProductById(id);
    await setProductPublished(id, isPublished);
    logCrud(context.user, "product", "set_published", {
      id,
      name: record?.name ?? id,
    });
    return { success: true };
  });
```

## Step 7：创建 Form 组件

创建 `src/routes/admin/_admin/<module-name>/-mods/<ModuleName>Form.tsx`。这是新建 / 编辑双模式 antd Form 组件，由列表页的 `AdminFormDrawer` 承载。

```tsx
/**
 * <实体中文名>管理路由自包含表单组件
 * 传入 id 即编辑（自动拉取数据），不传即新建；由 AdminFormDrawer 承载
 */
import { Button, Form, Input, InputNumber, Select, Spin, Switch } from "antd";
import { useEffect, useState } from "react";
import { callSfn } from "#/utils/sfn-error";
// Form 与 SFn 同在路由 -mods/，直接相对导入
import {
  createProductSFn,
  getProductByIdSFn,
  updateProductSFn,
} from "./product.functions";

export interface ProductFormValues {
  name: string;
  description?: string;
  status: "active" | "inactive";
  isPublished: boolean;
  sortOrder?: number;
}

interface ProductFormProps {
  /** 编辑时传入记录 id，不传为新建模式 */
  id?: string;
  /** <form id>：宿主（AdminFormDrawer）以底部按钮提交时传入 */
  formId?: string;
  /** 隐藏表单自带操作按钮（宿主已提供吸底按钮时使用） */
  hideActions?: boolean;
  /** 提交中状态回传（宿主据此控制底部按钮 loading） */
  onSubmittingChange?: (submitting: boolean) => void;
  /** 保存成功回调，传入记录 id */
  onSuccess?: (recordId: string) => void;
  /** 保存失败或记录不存在时回调 */
  onError?: (error: Error) => void;
  /** 取消回调 */
  onCancel?: () => void;
}

export function ProductForm({
  id,
  formId,
  hideActions,
  onSubmittingChange,
  onSuccess,
  onError,
  onCancel,
}: ProductFormProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(!!id);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!id;

  // 编辑模式：拉取数据回填表单
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const record = await callSfn(getProductByIdSFn({ data: { id } }));
        if (cancelled) return;
        if (record) {
          form.setFieldsValue({
            name: record.name,
            description: record.description,
            status: record.status as "active" | "inactive",
            isPublished: record.isPublished,
            sortOrder: record.sortOrder ?? 0,
          });
        } else {
          onError?.(new Error("记录不存在"));
        }
      } catch {
        // callSfn 已提示
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, form, onError]);

  const handleSubmit = async (values: ProductFormValues) => {
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      if (id) {
        await callSfn(updateProductSFn({ data: { id, ...values } }));
        onSuccess?.(id);
      } else {
        const record = await callSfn(createProductSFn({ data: values }));
        onSuccess?.(record.id);
      }
    } catch {
      // callSfn 已提示
    } finally {
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spin />
      </div>
    );
  }

  return (
    <Form
      id={formId}
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={!isEdit ? { status: "active", isPublished: false } : undefined}
    >
      <Form.Item
        name="name"
        label="名称"
        rules={[{ required: true, message: "请输入名称" }]}
      >
        <Input placeholder="产品名称" />
      </Form.Item>

      <Form.Item name="description" label="描述">
        <Input.TextArea rows={3} placeholder="产品描述（可选）" />
      </Form.Item>

      <div className="flex gap-8">
        <Form.Item name="status" label="状态">
          <Select
            style={{ width: 120 }}
            options={[
              { label: "启用", value: "active" },
              { label: "停用", value: "inactive" },
            ]}
          />
        </Form.Item>

        <Form.Item name="isPublished" label="上架" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item name="sortOrder" label="排序" extra="数字越大越靠前">
          <InputNumber min={0} style={{ width: 120 }} />
        </Form.Item>
      </div>

      {/* 宿主（AdminFormDrawer）提供吸底按钮时隐藏自带操作 */}
      {!hideActions && (
        <Form.Item>
          <div className="flex gap-2">
            <Button type="primary" htmlType="submit" loading={submitting}>
              保存
            </Button>
            {onCancel && <Button onClick={onCancel}>取消</Button>}
          </div>
        </Form.Item>
      )}
    </Form>
  );
}
```

**Form 组件规则**：
- 通过 `id` 判断 create / edit 模式
- `useEffect` 中使用 `cancelled` 标志防止组件卸载后的异步更新
- 日期类字段用 `dayjs` 在表单中，提交时转 ISO 字符串
- **不感知承载容器**：`formId` 标记 `<form id>`（供抽屉吸底按钮 `form={formId}` 提交）、`hideActions` 隐藏自带按钮、`onSubmittingChange` 回传提交态（三者均为可选 prop）
- SFn 调用一律经 `callSfn`（错误出口唯一，不在表单内再 `message.error`）
- `initialValues` 仅在 create 模式设置，edit 模式通过 `setFieldsValue` 填充

## Step 8：创建列表页（index.tsx）

列表页由四层拼装：`AdminListPage`（骨架）+ `useListQuery`（查询状态）+ `<module>Columns`（列工厂）+ `AdminFormDrawer`（新建 / 编辑）。页面只声明差异（列、筛选控件、行操作），不重复实现筛选、分页、排序、错误提示与高度控制。

### 列工厂（`-mods/<moduleName>Columns.tsx`）

创建 `src/routes/admin/_admin/<module-name>/-mods/<moduleName>Columns.tsx`。列定义独立成工厂：通用态（排序权重 / 上架状态）在单元格内联编辑，操作列用 `TableOperate`。

**列宽规则**（详见 [admin-design skill §3](../admin-design/SKILL.md)）：每列显式 `width` + **恰好一列 `elastic: true`**（默认操作列）+ `Σ列宽 ≤ 预算`（参考视口 1600：全宽 1359）。档位列引 `COLUMN_WIDTH.*`，操作列用 `actionsWidth(...)` 按文案实算，其余按「最长文案宽 + 32」并注释依据；`scroll.x` 由 ProTable 推导，**页面不写**。列工厂建好后登记进 `app/src/routes/admin/_admin/__tests__/column-budget.test.ts` 的 CASES，即纳入 CI 守门。

```tsx
/**
 * <实体中文名>管理表格列定义
 * 通用态（排序权重 / 上架状态）在单元格内联编辑；时间列走 ProTable valueType
 */
import {
  actionsWidth,
  COLUMN_WIDTH,
  PublishSwitchCell,
  SortOrderCell,
  StatusTag,
  type StatusTagOption,
  TableOperate,
} from "@ucode/hub-ui-spa/table";
import type { ProductRecord } from "#/services/product/product.server";

/** 产品状态：值 → 文案 + 语义色 */
const PRODUCT_STATUS_OPTIONS: Record<string, StatusTagOption> = {
  active: { label: "启用", tone: "success" },
  inactive: { label: "停用", tone: "neutral" },
};

interface ProductColumnsOptions {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => {
    sorter: true;
    sortOrder?: "ascend" | "descend";
  };
  /** 打开编辑抽屉 */
  onEdit: (record: ProductRecord) => void;
  /** 单元格内切换上架状态 */
  onTogglePublished: (record: ProductRecord, next: boolean) => Promise<void>;
  /** 单元格内修改排序权重 */
  onChangeSortOrder: (record: ProductRecord, next: number) => Promise<void>;
  /** 删除 */
  onDelete: (record: ProductRecord) => Promise<void>;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    edit: boolean;
    publish: boolean;
    delete: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑产品」权限";
const NO_PUBLISH_PERMISSION = "无「产品上下架」权限";
const NO_DELETE_PERMISSION = "无「删除产品」权限";

/** 产品表格列 */
export function productColumns(options: ProductColumnsOptions) {
  const { permissions } = options;
  return [
    { title: "名称", dataIndex: "name", key: "name", width: COLUMN_WIDTH.shortText },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      width: 260,
      ellipsis: true,
    },
    {
      title: "状态",
      key: "status",
      width: COLUMN_WIDTH.status,
      render: (_: unknown, record: ProductRecord) => (
        <StatusTag value={record.status} options={PRODUCT_STATUS_OPTIONS} />
      ),
    },
    {
      // 上架状态：单元格内开关直接切换（乐观更新 + 失败回滚）
      title: "上架",
      dataIndex: "isPublished",
      key: "isPublished",
      width: COLUMN_WIDTH.toggle,
      render: (_: unknown, record: ProductRecord) => (
        <PublishSwitchCell
          published={record.isPublished}
          labels={{ on: "已上架", off: "未上架" }}
          onToggle={(next) => options.onTogglePublished(record, next)}
          disabled={!permissions.publish}
          disabledReason={NO_PUBLISH_PERMISSION}
        />
      ),
    },
    {
      // 排序权重：单元格内失焦 / 回车提交；表头排序用于按该列排序
      title: "排序",
      dataIndex: "sortOrder",
      key: "sortOrder",
      width: COLUMN_WIDTH.sortOrder,
      ...options.sortProps("sortOrder"),
      render: (_: unknown, record: ProductRecord) => (
        <SortOrderCell
          value={record.sortOrder}
          onSubmit={(next) => options.onChangeSortOrder(record, next)}
          disabled={!permissions.edit}
          disabledReason={NO_EDIT_PERMISSION}
        />
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      ...options.sortProps("createdAt"),
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列（默认余宽去处）：宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("编辑", "删除"),
      elastic: true,
      render: (_: unknown, record: ProductRecord) => (
        <TableOperate>
          <TableOperate.Edit
            onClick={() => options.onEdit(record)}
            disabled={!permissions.edit}
            disabledReason={NO_EDIT_PERMISSION}
          />
          <TableOperate.Delete
            recordName="该产品"
            disabled={!permissions.delete}
            disabledReason={NO_DELETE_PERMISSION}
            onConfirm={() => options.onDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];
}
```

### 页面（index.tsx）

创建 `src/routes/admin/_admin/<module-name>/index.tsx`：

```tsx
/**
 * <实体中文名>列表页
 * 新建 / 编辑统一走抽屉，上架状态与排序权重在单元格内直接修改
 */
import { PlusOutlined } from "@ant-design/icons";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable, withDisabledReason } from "@ucode/hub-ui-spa/table";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "antd";
import { useCallback, useState } from "react";
import {
  AdminFilterItem,
  AdminFilters,
  AdminFormDrawer,
  AdminListPage,
  useAdminAuth,
} from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import type { ProductRecord } from "#/services/product/product.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import { ProductForm } from "./-mods/ProductForm";
import {
  deleteProductSFn,
  getProductListSFn,
  setProductPublishedSFn,
  updateProductSortSFn,
} from "./-mods/product.functions";
import { productColumns } from "./-mods/productColumns";

/** 表单 <form id>：抽屉底部按钮据此触发提交 */
const FORM_ID = "product-form";
const NO_CREATE_PERMISSION = "无「新建产品」权限";

/** 列表筛选条件：发布状态来自表格「状态」列的列头漏斗 */
interface ProductFilters {
  published: "" | "published" | "unpublished";
}

export const Route = createFileRoute("/admin/_admin/product/")({
  component: ProductListPage,
  loader: async () => getProductListSFn({ data: {} }),
});

function ProductListPage() {
  const initialData = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 查询状态全交给 useListQuery：首屏取 loader，翻页 / 排序 / 筛选显式触发
  const list = useListQuery<ProductRecord, ProductFilters>({
    initial: initialData,
    initialFilters: { published: "" },
    errorMessage: "加载列表失败",
    // 列头筛选 → 业务条件（值未变化时 hook 视为无筛选变更，不会重置页码）
    mapColumnFilters: (columnFilters) => ({
      published: (columnFilters.isPublished?.[0] as ProductFilters["published"]) ?? "",
    }),
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getProductListSFn({
          data: {
            isPublished:
              filters.published === ""
                ? undefined
                : filters.published === "published",
            sortField,
            sortOrder,
            page,
            pageSize,
          },
        }),
      [],
    ),
  });

  const permissions = {
    create: hasPermission(ADMIN_PERMISSIONS.PRODUCT_CREATE),
    edit: hasPermission(ADMIN_PERMISSIONS.PRODUCT_EDIT),
    publish: hasPermission(ADMIN_PERMISSIONS.PRODUCT_PUBLISH),
    delete: hasPermission(ADMIN_PERMISSIONS.PRODUCT_DELETE),
  };

  /** 单元格内切换上架状态（失败由 callSfn 统一提示） */
  const handleTogglePublished = async (record: ProductRecord, next: boolean) => {
    await callSfn(
      setProductPublishedSFn({ data: { id: record.id, isPublished: next } }),
    );
    message.success(next ? "已上架" : "已下架");
    await list.reload();
  };

  /** 单元格内修改排序权重 */
  const handleChangeSortOrder = async (record: ProductRecord, next: number) => {
    await callSfn(
      updateProductSortSFn({ data: { id: record.id, sortOrder: next } }),
    );
    message.success("排序已更新");
    await list.reload();
  };

  /** 删除（失败由统一出口提示，不在此处 message.error 捕获） */
  const handleDelete = async (record: ProductRecord) => {
    const [, err] = await sfnUnwrap(
      deleteProductSFn({ data: { id: record.id } }),
      { error: "删除失败" },
    );
    if (err) return;
    message.success("已删除");
    await list.reload();
  };

  const columns = productColumns({
    sortProps: list.sortProps,
    onEdit: (record) => {
      setEditingId(record.id);
      setDrawerOpen(true);
    },
    onTogglePublished: handleTogglePublished,
    onChangeSortOrder: handleChangeSortOrder,
    onDelete: handleDelete,
    permissions,
  });

  return (
    <AdminListPage
      title="产品管理"
      description="上架状态与排序可在列表内直接修改"
      // 页头三段式：筛选进 filters（本模块的状态筛选已收进「状态」列头漏斗，无需页头筛选）
      // 若还有关键词搜索等，写成：filters={<AdminFilters onReset={handleReset}><Input.Search ... /></AdminFilters>}
      extra={withDisabledReason(
        <Button type="primary" icon={<PlusOutlined />} disabled={!permissions.create} onClick={openCreate}>
          新建产品
        </Button>,
        !permissions.create,
        NO_CREATE_PERMISSION,
      )}
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无产品" }}
        scroll={{ x: 1110 }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />

      <AdminFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entityName="产品"
        id={editingId}
        formId={FORM_ID}
        submitting={submitting}
      >
        <ProductForm
          id={editingId ?? undefined}
          formId={FORM_ID}
          hideActions
          onSubmittingChange={setSubmitting}
          onSuccess={() => {
            message.success(editingId ? "产品已更新" : "产品已创建");
            setDrawerOpen(false);
            void list.reload();
          }}
          onCancel={() => setDrawerOpen(false)}
        />
      </AdminFormDrawer>
    </AdminListPage>
  );
}
```

**列表页关键模式**：
- 列表 SFn 不再内联在页面：list / delete / 单字段更新统一放 `-mods/<module>.functions.ts`，页面只 import
- 首屏数据由路由 `loader` 提供，交给 `useListQuery` 作初始值；**不写 `useEffect` 自动拉取**
- `ProTable` 只接 `loading` / `onChange={list.onTableChange}` / `pagination={list.pagination}`，**不接 `pagination.onChange`**（两处并存会双请求、翻页失效）
- 筛选变更走 `list.applyFilters(...)`（自动回第 1 页）；增删改 / 内联更新后走 `list.reload()`
- 主操作放 `AdminListPage` 的 `extra`，筛选控件放 `filters`（页头三段式，无独立筛选行），页面无手写 `AdminPageContent` 间距结构
- 操作列用 `TableOperate` 容器组件（`Edit` / `Delete` / `Link` / `Custom`），无权限传 `disabled` + `disabledReason`
- 列宽合计 ≤ 预算（1359）且 1600 视口下无横向滚动；长文本列宽 ≥ 340 且必须 `ellipsis`，余宽归弹性列

### 新建 / 编辑：列表页内抽屉

新建 / 编辑统一在列表页内用 `AdminFormDrawer` 承载表单，**不再创建 `create.tsx` / `$id/edit.tsx`**。若旧模块仍存在这两个路由文件，删除后重新生成 `routeTree.gen.ts`（`pnpm dev` / 构建会自动重新生成）。

抽屉与表单通过三个**可选 prop** 解耦，表单不感知自己是否在抽屉里：

```tsx
/** 表单侧：三个可选 prop 与宿主抽屉配对 */
interface ProductFormProps {
  id?: string;
  formId?: string;            // 标记 <form id>，供抽屉底部按钮 form={formId} 提交
  hideActions?: boolean;      // 隐藏表单自带按钮
  onSubmittingChange?: (submitting: boolean) => void; // 回传提交态，驱动抽屉主按钮 loading
  onSuccess?: (recordId: string) => void;
  onCancel?: () => void;
}

// 根 Form 带上 id；宿主提供吸底按钮时隐藏自带操作
<Form id={formId} form={form} onFinish={handleSubmit}>
  {/* ...表单字段... */}
  {!hideActions && (
    <Form.Item>
      <Button type="primary" htmlType="submit" loading={submitting}>保存</Button>
    </Form.Item>
  )}
</Form>;

// 提交前后把状态通知宿主
onSubmittingChange?.(true);
try { /* 提交 */ } finally { onSubmittingChange?.(false); }
```

```tsx
/** 列表页侧：抽屉装配 */
const [editingId, setEditingId] = useState<string | null>(null);
const [drawerOpen, setDrawerOpen] = useState(false);
const [submitting, setSubmitting] = useState(false);

<AdminFormDrawer
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  entityName="产品"
  id={editingId}
  formId={FORM_ID}
  submitting={submitting}
>
  <ProductForm
    id={editingId ?? undefined}
    formId={FORM_ID}
    hideActions
    onSubmittingChange={setSubmitting}
    onSuccess={() => {
      setDrawerOpen(false);
      void list.reload();
    }}
    onCancel={() => setDrawerOpen(false)}
  />
</AdminFormDrawer>;
```

**抽屉要点**：
- 抽屉固定 `destroyOnHidden`：隐藏即卸载，避免富文本等组件在 `display:none` 容器中挂载拿到 0 尺寸，也避免残留校验态
- 宽度档位 `FORM_DRAWER_WIDTH`：`base 640` / `wide 760` / `full "60%"`（强编辑场景按视口比例）
- **单字段快速修改（如文件标签）用 Modal 或单元格内联编辑**，不必为此开抽屉
- 只读列表（日志、埋点、操作日志）没有新建 / 编辑承载，只做骨架 + 查询状态 + 列规范

## 列表页统一规范

所有管理端列表页（`/admin/**` 带表格的页面）统一为一条固定流水线：骨架 → 查询状态 → 表格 → 通用态。页面只声明差异（列、筛选控件、行操作）。四层职责：

| 层 | 承载 | 职责 |
|----|------|------|
| 骨架 | `AdminListPage` | 标题栏 / 看板 / 工具条 / 表格区域的布局与表体高度注入 |
| 查询状态 | `useListQuery` | 筛选 / 页码 / 每页条数 / 排序、拉取、服务端回填、过期响应丢弃、列 `sortProps` |
| 表格 | `ProTable` | 列渲染增强、表体高度继承 |
| 通用态 | `SortOrderCell` / `PublishSwitchCell` / `StatusTag` | 单元格内联编辑（排序 / 状态）+ 失败回滚 + 状态语义色 |

**硬规则**（逐条对照 [admin-design 清单](../../checklists/admin-design.md)）：

1. 页面用 `AdminListPage`，主操作放 `extra`、筛选放 `filters`（页头三段式），不手写 `AdminPageContent` 结构
2. 列表 schema 以 `listSchema` 为基座 `.extend({...})` 命名 `<模块>ListSchema`；`pageSize` 必须透传到服务层，禁止硬编码
3. 分页与排序统一由 `Table.onChange`（`list.onTableChange`）驱动，**禁止再配 `pagination.onChange`**；不写 `useEffect` 自动拉取列表，首屏交给路由 `loader`
4. 操作列用 `TableOperate`（低频项进 `More`）且宽度取 `actionsWidth(...)`、标 `elastic: true`；每列定宽、合计 ≤ 预算、无横向滚动（开发期控制台无「列宽预算」告警）
5. 无权限的操作传 `disabled` + `disabledReason`，不隐藏按钮；服务端 `adminPermGuard` 仍是唯一权威
6. 错误出口唯一：SFn 调用交 `callSfn` / `sfnUnwrap`，操作列与表单内不自行 `message.error` 捕获
7. 通用态用 `SortOrderCell` / `PublishSwitchCell` / `StatusTag`（多值枚举可就地切换用 `Select variant="borderless"`），改进走**单字段 SFn** + `logCrud`；图片列用 `ImageCell` 放表格最前；时间列用 `valueType: "dateTimeMinute"`（或 `"dateTime"`），不手写 `dayjs().format`

> 完整 UI 规范见 [admin-design skill](../admin-design/SKILL.md)，机制与依据见 [docs/admin-design.md](../../../docs/admin-design.md)，验收逐项自查见 [.agents/checklists/admin-design.md](../../checklists/admin-design.md)。
>
> 可 `read` 参考的实现：`app/src/utils/use-list-query.ts`、`app/src/components/admin/{AdminListPage,AdminFilters,AdminFormModal,AdminFormDrawer}.tsx`。

## Step 9：可选 —— 添加实体翻译

> 详细规范参考 [i18n](../i18n/SKILL.md)

如果实体字段需要多语言支持，额外执行以下步骤：

1. 在列工厂（`-mods/<moduleName>Columns.tsx`）定义 `<ENTITY>_TRANSLATABLE_FIELDS` 数组
2. 在 `.server.ts` 添加 `translate<Entity>Record` / `translate<Entity>Records` 函数
3. 在服务层 / 列表 SFn 中按需返回翻译值
4. 在列工厂操作列的 `TableOperate.Custom` 内集成 `FieldTranslationDrawer`

## Step 10：编写测试

> 详细规范参考 [test-writing](../test-writing/SKILL.md)

### 服务层测试

创建 `src/services/<module-name>/__tests__/<module-name>.test.ts`，使用三段式 mock 模式。需覆盖：
- `getProductList`：正常返回、空列表、按状态筛选
- `createProduct`：成功创建、名称重复
- `updateProduct`：成功更新、记录不存在
- `deleteProduct`：成功删除、记录不存在

### Schema 测试

在路由目录 `__tests__/` 下为 `createProductSchema` 和 `updateProductSchema` 编写就近校验测试（合法通过、字段缺失、字段非法值）。schema 需在 `.functions.ts` / `.schemas.ts` 导出，测试直接 import 真实对象，禁止本地复制副本。

## 验证清单

完成所有步骤后，按序执行：

```
□ pnpm db:generate + pnpm db:migrate   # 生成并执行 Schema 迁移
□ 仓库根 pnpm check       # 类型检查 + Biome + 全部包测试
□ 对照 .agents/checklists/admin-design.md 逐项自查（页头 / 筛选落点 / 列宽预算 / 操作列 / 弹窗抽屉 / 表单）
□ 确认无残留 create.tsx / $id/edit.tsx，routeTree.gen.ts 已重新生成
□ 手动测试：列表页加载
□ 手动测试：分页 / 每页条数 / 排序
□ 手动测试：抽屉内创建新记录
□ 手动测试：抽屉内编辑已有记录
□ 手动测试：单元格内联修改排序 / 上架状态
□ 手动测试：删除记录
□ 手动测试：权限校验（用非管理员账号，操作置灰并提示原因）
□ 检查：操作日志是否记录（/admin/operation-logs）
```

## 参考实现

完整参考：`src/services/device/` + `src/routes/admin/_admin/devices/`

```
src/services/device/
├── device.schemas.ts      # Zod Schema（单一来源；deviceListSchema 以 listSchema 为基座）
├── device.server.ts       # 服务层（列表 / 改名 / 吊销 / 删除）
└── device.online.ts       # 在线态（进程内存）

src/routes/admin/_admin/devices/
├── index.tsx                  # 列表页（骨架 + 查询状态 + 筛选）
└── -mods/
    ├── devices.functions.ts   # SFn 包装器（getDeviceListSFn / renameDeviceSFn / revokeDeviceSFn / deleteDeviceSFn）
    └── deviceColumns.tsx      # 表格列工厂（含操作列）
```

> 设备域没有新建 / 编辑表单：设备由客户端登记产生，运营侧只做改名 / 吊销 / 删除。带新建 / 编辑的模块按同一骨架自建，表单由 `AdminFormDrawer` / `AdminFormModal` 承载。

## 相关 Skill 总览

```
admin-crud
├── db-schema          —— Step 1：创建 DB Schema
├── permission         —— Step 3：添加权限码
├── server-function    —— Step 6：SFn 包装器
├── test-writing       —— Step 10：单元测试
└── i18n               —— Step 9：实体翻译（可选）
```

在列工厂（`-mods/<moduleName>Columns.tsx`）的操作列中通过 `TableOperate.Custom` 包裹 `FieldTranslationDrawer`：

```tsx
import { FieldTranslationDrawer } from "#/components/admin";

// 在操作列的 render 中（与 TableOperate.Edit / Delete 并列）
<TableOperate>
  <TableOperate.Edit
    onClick={() => options.onEdit(record)}
    disabled={!permissions.edit}
    disabledReason={NO_EDIT_PERMISSION}
  />
  <TableOperate.Delete
    recordName="该产品"
    disabled={!permissions.delete}
    disabledReason={NO_DELETE_PERMISSION}
    onConfirm={() => options.onDelete(record)}
  />
  <TableOperate.Custom>
    <FieldTranslationDrawer
      entityType="product"
      entityId={record.id}
      fields={PRODUCT_TRANSLATABLE_FIELDS}
      originalValues={{
        name: record.name ?? "",
        description: record.description ?? "",
      }}
    />
  </TableOperate.Custom>
</TableOperate>
```

> 操作数上限 4：原 2 项 + 字段翻译 = 3 项，操作列 `width: actionsWidth("编辑", "删除", "翻译")`（240）；若该列已是弹性列则宽度不变、仍作滚动时的宽度。

`FieldTranslationDrawer` 固定使用图标触发模式（`TranslationOutlined`，蓝紫渐变，Tooltip "国际化"），无需传递 `trigger` 参数。
