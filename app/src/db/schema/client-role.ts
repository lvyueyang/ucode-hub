/**
 * 客户端角色表
 */
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk, softDelete, timestamps } from "./columns";

export const clientRole = sqliteTable("client_role", {
  ...pk(),
  name: text("name").unique().notNull(),
  slug: text("slug").unique().notNull(),
  permissions: text("permissions", { mode: "json" }).$type<string[]>().default([]).notNull(),
  description: text("description"),
  ...timestamps(),
  ...softDelete(),
});
