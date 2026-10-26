/**
 * 表结构通用列片段：主键、创建/更新时间、软删除、排序、发布状态
 *
 * 一律用工厂函数返回全新列构造器，禁止导出共享的常量对象——Drizzle 的列构造器带状态
 * （setName/build 会写入其 config），跨表复用同一实例会导致多表共享 config。
 * 工厂内显式传数据库列名，避免依赖 JS 属性名推断。
 */
import { boolean, integer, timestamp, uuid } from "drizzle-orm/pg-core";

/** uuid 主键 */
export const pk = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
});

export const createdAt = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 更新时间（更新时业务侧仍需手动写入） */
export const updatedAt = () => ({
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 创建 + 更新时间（两者组合的常用形态） */
export const timestamps = () => ({
  ...createdAt(),
  ...updatedAt(),
});

/** 软删除标记（有恢复需求、需过滤未删除的表启用） */
export const softDelete = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** 手动排序（需拖拽 / 指定排序的表启用） */
export const sortable = () => ({
  sortOrder: integer("sort_order").default(0).notNull(),
});

/** 发布状态（上架 / 下架）：通用语义，与具体发布时间字段无关 */
export const publishable = () => ({
  isPublished: boolean("is_published").default(false).notNull(),
});
