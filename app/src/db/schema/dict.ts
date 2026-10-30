/**
 * 字典表：字典类型定义
 */
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { pk, softDelete, sortable, timestamps } from "./columns";

/** 字典类型 */
export const dict = sqliteTable("dict", {
  ...pk(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  ...timestamps(),
  ...softDelete(),
});

/** 字典条目 */
export const dictItem = sqliteTable(
  "dict_item",
  {
    ...pk(),
    dictSlug: text("dict_slug")
      .references(() => dict.slug, { onUpdate: "cascade" })
      .notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    ...sortable(),
    status: text("status").default("active").notNull(),
    extraType: text("extra_type"),
    extra: text("extra"),
    color: text("color"),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [uniqueIndex("uq_dict_item_dict_slug_value").on(table.dictSlug, table.value)],
);
