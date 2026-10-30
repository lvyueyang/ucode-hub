/**
 * 国际化翻译表：UI 固定文案翻译 + 实体字段翻译
 *
 * - ui_translation：前台页面 UI 固定文案（key 直接使用中文原文，如 "首页"）
 * - content_translation：数据库实体字段翻译（entity_type + entity_id + field_name 定位）
 * - 默认语言（zh）内容存在主表原字段，其他语言翻译写入 content_translation
 * - value_type 复用 EditorType 枚举，控制管理端编辑器和渲染方式
 */
import { index, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { pk, timestamps } from "./columns";

/** UI 固定文案翻译表：key 直接使用中文原文（如 "首页"），en 语言用于映射目标语言值 */
export const uiTranslation = sqliteTable(
  "ui_translation",
  {
    ...pk(),
    locale: text("locale").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    /** 复用 EditorType: input | text | number | json | rich | code */
    valueType: text("value_type").default("input").notNull(),
    ...timestamps(),
  },
  (table) => [unique("uq_ui_trans_locale_key").on(table.locale, table.key)],
);

/** 实体字段翻译表：entity_type + entity_id + field_name + locale 唯一确定一条翻译 */
export const contentTranslation = sqliteTable(
  "content_translation",
  {
    ...pk(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    fieldName: text("field_name").notNull(),
    locale: text("locale").notNull(),
    value: text("value").notNull(),
    /** 复用 EditorType: input | text | rich 等 */
    valueType: text("value_type").default("text").notNull(),
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
