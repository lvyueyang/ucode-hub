/**
 * 管理员用户表
 */

import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./columns";

export const adminUser = pgTable(
  "admin_user",
  {
    ...pk(),
    username: varchar({ length: 50 }).unique().notNull(),
    email: varchar({ length: 255 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    avatar: varchar({ length: 500 }),
    adminRoleIds: jsonb("admin_role_ids").$type<string[]>().default([]).notNull(),
    isRoot: boolean("is_root").default(false).notNull(),
    status: varchar({ length: 20 }).default("active").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    // 数据库层面保证只有一个 root 用户
    uniqueIndex("idx_admin_user_single_root").on(table.isRoot).where(sql`${table.isRoot} = true`),
  ],
);
