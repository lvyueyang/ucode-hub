/**
 * 客户端用户表
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk, softDelete, timestamps } from "./columns";

export const clientUser = sqliteTable("client_user", {
  ...pk(),
  username: text("username").unique().notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  /** 会话令牌版本：改密 / 被重置 / 登出时自增，使已签发的令牌立即失效 */
  tokenVersion: integer("token_version").default(0).notNull(),
  avatar: text("avatar"),
  clientRoleIds: text("client_role_ids", { mode: "json" }).$type<string[]>().default([]).notNull(),
  status: text("status").default("active").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  ...timestamps(),
  ...softDelete(),
});
