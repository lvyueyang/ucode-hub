/**
 * 表结构通用列片段：主键、创建/更新时间、软删除、排序、发布状态
 *
 * 一律用工厂函数返回全新列构造器，禁止导出共享的常量对象——Drizzle 的列构造器带状态
 * （setName/build 会写入其 config），跨表复用同一实例会导致多表共享 config。
 * 工厂内显式传数据库列名，避免依赖 JS 属性名推断。
 */
import { integer, text } from "drizzle-orm/sqlite-core";

/** uuid 主键：SQLite 无 uuid 类型，用 text 存；默认值由 drizzle 写入时生成，原始 SQL 插入需显式填 */
export const pk = () => ({
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
});

/** 创建时间：unix 毫秒，带 DB 级默认值（绕过 drizzle 的原始 SQL 插入也能取到） */
export const createdAt = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
});

/** 更新时间（更新时业务侧仍需手动写入） */
export const updatedAt = () => ({
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
});

/** 创建 + 更新时间（两者组合的常用形态） */
export const timestamps = () => ({
  ...createdAt(),
  ...updatedAt(),
});

/** 软删除标记（有恢复需求、需过滤未删除的表启用） */
export const softDelete = () => ({
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

/** 手动排序（需拖拽 / 指定排序的表启用） */
export const sortable = () => ({
  sortOrder: integer("sort_order").default(0).notNull(),
});

/** 发布状态（上架 / 下架）：通用语义，与具体发布时间字段无关 */
export const publishable = () => ({
  isPublished: integer("is_published", { mode: "boolean" }).default(false).notNull(),
});
