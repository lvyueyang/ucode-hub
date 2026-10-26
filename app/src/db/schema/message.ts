/**
 * 通用消息表：管理端与客户端用户消息（站内信，通知模块主渠道）
 * 通过 userType + userId 定位用户（无外键，仿 operation_log 的 operatorId 模式）
 */
import { index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import type { UserType } from "#/types/user";
import { pk, softDelete, timestamps } from "./columns";

/** 消息状态 */
export type MessageStatus = "unread" | "read";

export const message = pgTable(
  "message",
  {
    ...pk(),
    userId: uuid("user_id").notNull(),
    userType: varchar("user_type", { length: 20 }).$type<UserType>().notNull(),
    title: varchar({ length: 200 }).notNull(),
    content: text(),
    type: varchar({ length: 50 }).default("system").notNull(),
    status: varchar({ length: 20 }).$type<MessageStatus>().default("unread").notNull(),
    relatedLink: varchar("related_link", { length: 500 }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [index("idx_message_user").on(table.userType, table.userId)],
);
