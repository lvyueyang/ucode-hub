---
name: db-schema
description: >
  数据库 Schema 开发指南。当需要新增/修改数据库表、调整 Drizzle Schema、
  添加列或外键、或执行 db:push 时触发。
---

# 数据库 Schema 开发

## 快速索引

| 需求 | 跳转 |
|------|------|
| 新增一张表 | → [完整表定义模板](#完整表定义模板) |
| 新增普通列 | → [列命名决策表](#列命名决策表) |
| 新增外键列 | → [外键列命名规则](#外键列命名规则) |
| 修改已有列 | → [Schema 修改流程](#schema-修改流程) |
| 不确定列名 | → [列命名决策表](#列命名决策表) |

## 通用列模板

主键、创建/更新时间、软删除、排序、发布状态统一由 `src/db/schema/columns.ts` 的工厂函数提供，**禁止在各表重复手写**（也禁止把工厂返回值提取成共享常量对象——Drizzle 列构造器带状态，跨表复用同一实例会共享 config）：

```ts
import {
  createdAt,
  pk,
  publishable,
  softDelete,
  sortable,
  timestamps,
  updatedAt,
} from "./columns";

// 主键 —— 所有表统一
...pk(),

// 创建时间 / 更新时间 —— 可单独展开，也可用 timestamps() 组合（更新时业务侧仍需手动写入 updatedAt）
...createdAt(),
...updatedAt(),
...timestamps(), // 等价于 createdAt() + updatedAt()

// 软删除 —— 需要可恢复删除的表
...softDelete(),

// 排序 —— 需要手动拖拽排序的表
...sortable(),

// 发布状态（上架 / 下架）—— 通用语义，仅提供 isPublished，与具体发布时间字段无关
...publishable(),
```

> `publishable()` 只提供 `isPublished`；发布时间（如 `publishedAt`）是业务字段，按需在该表内联声明，首次发布时由业务侧写入。

> **主键例外**：埋点元数据表 `track_event_meta`（`name`）与 `track_property_meta`（`key`）以业务标识符为 varchar 主键，只套用 `timestamps()`，不用 `pk()`。

**仍需按表手写的通用列**（形态 / 语义随业务变化，不纳入工厂）：

```ts
// 描述 —— 任何描述性文本，统一用 description，禁用 summary
description: text("description"),

// 状态 —— 状态机字段，默认值与取值随领域变化，通常配合 DictSelect
status: varchar({ length: 20 }).default("active").notNull(),

// 创建者 / 更新者 —— 审计追踪
createdById: uuid("created_by_id").references(() => adminUser.id),
updatedById: uuid("updated_by_id").references(() => adminUser.id),
```

> 只有 `createdAt`（无 `updatedAt`）的表（如 `captcha_code`、`track_event`）用 `...createdAt()`；`operation_log` 因列为 camelCase 例外且无 `updatedAt`/`deletedAt`，仍内联手写。

## 列命名决策表

| 业务概念 | 列名 | JS 属性名 | Drizzle 类型 | 说明 |
|----------|------|-----------|-------------|------|
| 主键 | `id` | `id` | `uuid().defaultRandom().primaryKey()` | 所有表统一 |
| 创建时间 | `created_at` | `createdAt` | `timestamp(..., { withTimezone: true })` | `defaultNow().notNull()` |
| 更新时间 | `updated_at` | `updatedAt` | `timestamp(..., { withTimezone: true })` | `defaultNow().notNull()` |
| 软删除 | `deleted_at` | `deletedAt` | `timestamp(..., { withTimezone: true })` | 可恢复的数据用 |
| 描述/摘要/简介 | `description` | `description` | `text(...)` | **统一用此**，禁用 `summary` |
| 排序 | `sort_order` | `sortOrder` | `integer(...)` | **统一用此**，禁用 `sort` |
| 状态 | `status` | `status` | `varchar({ length: 20 })` | 状态机字段 |
| 发布标识 | `is_published` / `is_pinned` | `isPublished` / `isPinned` | `boolean(...)` | 布尔开关用 `is_` 前缀 |
| 标题 | `title` | `title` | `varchar({ length: N })` | 需要长度限制 |
| 名称 | `name` | `name` | `varchar({ length: N })` | 需要长度限制 |
| 邮箱 | `email` | `email` | `varchar({ length: N })` | |
| 密码哈希 | `password_hash` | `passwordHash` | `varchar({ length: 255 })` | |
| Slug / URL 标识 | `slug` | `slug` | `varchar({ length: 500 })` | 通常加 `.unique()` |
| 封面图引用 | `cover_image_id` | `coverImageId` | `uuid(...).references(...)` | FK 引用 `file` 表 |
| 创建者引用 | `created_by_id` | `createdById` | `uuid(...).references(...)` | FK 引用 `admin_user` |
| 多态引用类型 | `xxx_type` | `xxxType` | `varchar({ length: N })` | 如 `created_by_type`，配合 `xxx_id` 使用 |
| 更新者引用 | `updated_by_id` | `updatedById` | `uuid(...).references(...)` | FK 引用 `admin_user` |
| 角色关联 | `admin_role_ids` / `client_role_ids` | `adminRoleIds` / `clientRoleIds` | `jsonb(...).$type<string[]>().default([]).notNull()` | 多角色 id 数组（无外键），参考 `admin_user` / `client_user` 表 |

## 外键列命名规则

1. 数据库列名：`<概念>_id`，如 `created_by_id`、`role_id`
2. JS 属性名：`<概念>Id`，如 `createdById`、`roleId`
3. **禁止**省略 `Id` 后缀，例如 `createdBy` → `created_by` 是错误的

```ts
// ✅ 正确
createdById: uuid("created_by_id").references(() => adminUser.id),
roleId: uuid("role_id").references(() => role.id).notNull(),

// ❌ 错误
createdBy: uuid("created_by").references(() => adminUser.id),  // JS 属性缺少 Id
updatedBy: uuid("updated_by").references(() => adminUser.id),  // JS 属性缺少 Id
```

## Drizzle 列定义规范

1. **显式指定数据库列名**：所有列的第一个参数必须是字符串列名，不依赖 Drizzle 自动推断
2. **timestamp 必须加 `{ withTimezone: true }`**：无例外
3. **链式调用过长时让 Biome 自动换行**：不要手动折行

```ts
// ✅ 正确
createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
title: varchar({ length: 500 }).notNull(),
description: text("description"),

// ❌ 错误
createdAt: timestamp().defaultNow().notNull(),          // 缺少列名 + withTimezone
title: varchar().notNull(),                              // 未指定列名 + 长度
description: text(),                                    // 未指定列名
```

## jsonb 列类型约定

所有 `jsonb()` 列**必须**通过 `.$type<>()` 显式指定 TS 类型，禁止无类型 `jsonb()`：

```ts
// ✅ 正确
permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
properties: jsonb("properties").$type<Record<string, unknown>>().default({}).notNull(),

// ❌ 错误
properties: jsonb().default({}).notNull(),
detail: jsonb(),
```

`$type<>()` 仅影响 TS 类型推断，不影响数据库列定义（数据库侧始终为 `jsonb`）；读取时 Drizzle 按 `$type` 返回强类型值。

## 完整表定义模板

以下模板可直接复制，替换占位符即可。示例以"产品"为例：

```ts
/**
 * 产品表
 */
import { index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { adminUser } from "./admin-user";
import { file } from "./file";
import { pk, softDelete, sortable, timestamps } from "./columns";

export const product = pgTable(
  "product",  // 表名：单数
  {
    // ═══ 通用列（工厂展开，位置与列顺序保持一致） ═══
    ...pk(),

    // ═══ 业务列 ═══
    name: varchar({ length: 200 }).notNull(),
    description: text("description"),
    status: varchar({ length: 20 }).default("active").notNull(),
    ...sortable(),
    coverImageId: uuid("cover_image_id").references(() => file.id),

    // ═══ 审计列 ═══
    createdById: uuid("created_by_id").references(() => adminUser.id),
    updatedById: uuid("updated_by_id").references(() => adminUser.id),
    ...timestamps(),

    // ═══ 软删除（按需） ═══
    ...softDelete(),
  },
  (table) => [
    // 按需添加索引
    index("idx_product_created_at").on(table.createdAt),
  ],
);
```

> 若不需要排序 / 软删除 / 发布，去掉对应片段即可。列顺序（业务列 → 审计 → 软删除）应与既有表保持一致，避免无谓的迁移 diff。

## 占位符替换说明

| 占位符 | 说明 | 示例 |
|--------|------|------|
| `product` | 表名，单数，snake_case（全小写下划线） | `customer_feedback` |
| `Product` | 实体名 | `CustomerFeedback` |
| `name` / `description` / `status` | 按 [列命名决策表](#列命名决策表) 选择正确的列名 | |

## 新增表流程

1. **创建 Schema 文件**：`src/db/schema/<table-name>.ts`（使用上面的完整模板）
2. **注册导出**：在 `src/db/schema/index.ts` 追加一行 `export { product } from "./product";`
3. **生成迁移**：`pnpm db:generate`，审查生成的 SQL（确认无破坏性操作）
4. **执行迁移**：`pnpm db:migrate`（或 `pnpm dev`，bootstrap 启动时自动执行）
5. **验证**：本仓库 `pnpm check`（含全部包 typecheck 与测试）

> ⚠️ **禁止使用 `db:push`**：直接改库不生成迁移文件、不更新 snapshot，与启动时自动迁移机制状态脱节，混用必炸。

## Schema 修改流程

### 重命名已有列

> ⚠️ `pnpm db:generate` 检测到重命名时会弹出交互提示，**必须选择 rename column**，否则 Drizzle 会删除旧列 + 创建新列，导致数据丢失。

1. 修改 Drizzle Schema 中的列名
2. `pnpm db:generate`，在交互提示中选择 **rename column**（输入 `r` 或对应的选项）
3. **审查生成的 SQL** 确认是 `ALTER TABLE ... RENAME COLUMN` 而非 drop + add
4. `pnpm db:migrate`
5. 本仓库 `pnpm check`（含测试）

### 新增列

1. 在 Schema 文件中追加列定义
2. `pnpm db:generate`（新增列不弹交互提示，直接生成 `ALTER TABLE ADD COLUMN`）
3. **审查生成的 SQL**（若新列为 NOT NULL 且无默认值，需评估存量数据）
4. `pnpm db:migrate`
5. 本仓库 `pnpm check`（含测试）

## 常见陷阱

| 错误 | 正确 | 后果 |
|------|------|------|
| 用 `sort` 代替 `sort_order` | `sortOrder → sort_order` | 列名不一致，需要 rename column |
| 用 `summary` 代替 `description` | `description` | 同上 |
| JS 属性忘加 `Id` 后缀 | `createdById → created_by_id` | 同上 |
| FK 属性和列名不一致 | `createdBy → created_by` | Drizzle 推断列名错误 |
| timestamp 忘加 `withTimezone` | `timestamp("created_at", { withTimezone: true })` | 时区问题 |
| Drizzle 列第一个参数写错 | `varchar("name")` 不是 `varchar({ length: 100 })` | 列名推断错误 |

## 相关 Skill

- 创建完整 CRUD 模块 → [admin-crud](../admin-crud/SKILL.md)
- 为新模块添加权限 → [permission](../permission/SKILL.md)
- 编写 SFn → [server-function](../server-function/SKILL.md)
- 编写测试 → [test-writing](../test-writing/SKILL.md)
- 衍生项目切换数据库：SQLite → [db-sqlite](../db-sqlite/SKILL.md)、MySQL → [db-mysql](../db-mysql/SKILL.md)
