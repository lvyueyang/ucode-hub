/**
 * 通用消息表：管理端与客户端用户消息（站内信，通知模块主渠道）
 * 通过 userType + userId 定位用户（无外键，仿 operation_log 的 operatorId 模式）
 */
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { UserType } from "#/types/user";
import { pk, softDelete, timestamps } from "./columns";

/** 消息状态 */
export type MessageStatus = "unread" | "read";

export const message = sqliteTable(
  "message",
  {
    ...pk(),
    userId: text("user_id").notNull(),
    userType: text("user_type").$type<UserType>().notNull(),
    title: text("title").notNull(),
    content: text("content"),
    type: text("type").default("system").notNull(),
    status: text("status").$type<MessageStatus>().default("unread").notNull(),
    relatedLink: text("related_link"),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [index("idx_message_user").on(table.userType, table.userId)],
);
