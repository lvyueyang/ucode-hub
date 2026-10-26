/**
 * 字典表：字典类型定义
 */
import { pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, sortable, timestamps } from "./columns";

/** 字典类型 */
export const dict = pgTable("dict", {
  ...pk(),
  name: varchar({ length: 100 }).notNull(),
  slug: varchar({ length: 50 }).unique().notNull(),
  description: text(),
  ...timestamps(),
  ...softDelete(),
});

/** 字典条目 */
export const dictItem = pgTable(
  "dict_item",
  {
    ...pk(),
    dictSlug: varchar("dict_slug", { length: 50 })
      .references(() => dict.slug, { onUpdate: "cascade" })
      .notNull(),
    label: varchar({ length: 100 }).notNull(),
    value: varchar({ length: 100 }).notNull(),
    ...sortable(),
    status: varchar({ length: 20 }).default("active").notNull(),
    extraType: varchar("extra_type", { length: 20 }),
    extra: text("extra"),
    color: varchar({ length: 20 }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [uniqueIndex("uq_dict_item_dict_slug_value").on(table.dictSlug, table.value)],
);
