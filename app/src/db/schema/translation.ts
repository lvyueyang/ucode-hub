/**
 * 国际化翻译表：UI 固定文案翻译 + 实体字段翻译
 *
 * - ui_translation：前台页面 UI 固定文案（key 直接使用中文原文，如 "首页"）
 * - content_translation：数据库实体字段翻译（entity_type + entity_id + field_name 定位）
 * - 默认语言（zh）内容存在主表原字段，其他语言翻译写入 content_translation
 * - value_type 复用 EditorType 枚举，控制管理端编辑器和渲染方式
 */
import { index, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./columns";

/** UI 固定文案翻译表：key 直接使用中文原文（如 "首页"），en 语言用于映射目标语言值 */
export const uiTranslation = pgTable(
  "ui_translation",
  {
    ...pk(),
    locale: varchar({ length: 10 }).notNull(),
    key: varchar({ length: 300 }).notNull(),
    value: text().notNull(),
    /** 复用 EditorType: input | text | number | json | rich | code */
    valueType: varchar("value_type", { length: 20 }).default("input").notNull(),
    ...timestamps(),
  },
  (table) => [unique("uq_ui_trans_locale_key").on(table.locale, table.key)],
);

/** 实体字段翻译表：entity_type + entity_id + field_name + locale 唯一确定一条翻译 */
export const contentTranslation = pgTable(
  "content_translation",
  {
    ...pk(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    fieldName: varchar("field_name", { length: 100 }).notNull(),
    locale: varchar({ length: 10 }).notNull(),
    value: text().notNull(),
    /** 复用 EditorType: input | text | rich 等 */
    valueType: varchar("value_type", { length: 20 }).default("text").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("uq_ct_entity_field_locale").on(
      table.entityType,
      table.entityId,
      table.fieldName,
      table.locale,
    ),
    index("idx_ct_entity_locale").on(table.entityType, table.entityId, table.locale),
  ],
);
