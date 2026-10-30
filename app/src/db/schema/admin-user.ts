/**
 * 管理员用户表
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { pk, softDelete, timestamps } from "./columns";

export const adminUser = sqliteTable(
  "admin_user",
  {
    ...pk(),
    username: text("username").unique().notNull(),
    email: text("email").unique().notNull(),
    /** 邮箱是否已确认：超管的「忘记密码」走绑定邮箱，未确认的邮箱不可用于恢复 */
    emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
    passwordHash: text("password_hash").notNull(),
    /** 会话令牌版本：改密 / 被重置 / 登出时自增，使已签发的令牌立即失效 */
    tokenVersion: integer("token_version").default(0).notNull(),
    avatar: text("avatar"),
    adminRoleIds: text("admin_role_ids", { mode: "json" }).$type<string[]>().default([]).notNull(),
    isRoot: integer("is_root", { mode: "boolean" }).default(false).notNull(),
    status: text("status").default("active").notNull(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    // 数据库层面保证只有一个 root 用户
    uniqueIndex("idx_admin_user_single_root").on(table.isRoot).where(sql`${table.isRoot} = true`),
  ],
);
