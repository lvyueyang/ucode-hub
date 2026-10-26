/**
 * 客户端用户表
 */
import { boolean, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./columns";

export const clientUser = pgTable("client_user", {
  ...pk(),
  username: varchar({ length: 50 }).unique().notNull(),
  email: varchar({ length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  avatar: varchar({ length: 500 }),
  clientRoleIds: jsonb("client_role_ids").$type<string[]>().default([]).notNull(),
  status: varchar({ length: 20 }).default("active").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps(),
  ...softDelete(),
});
