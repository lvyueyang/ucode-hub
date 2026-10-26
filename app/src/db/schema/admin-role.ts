/**
 * 管理端角色表
 */
import { jsonb, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./columns";

export const adminRole = pgTable("admin_role", {
  ...pk(),
  name: varchar({ length: 50 }).unique().notNull(),
  slug: varchar({ length: 50 }).unique().notNull(),
  permissions: jsonb().$type<string[]>().default([]).notNull(),
  description: text(),
  ...timestamps(),
  ...softDelete(),
});
