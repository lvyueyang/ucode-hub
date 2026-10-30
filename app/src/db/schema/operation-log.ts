/**
 * 操作日志表：记录用户的数据变更操作与外部系统调用审计
 * 采用内存缓冲批量写入，避免高频 DB 调用
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk } from "./columns";

/**
 * 操作者类型：admin / client / system / device（领域唯一来源，供请求上下文与审计共用）
 * device 供隧道侧以设备身份（而非登录用户）记账
 */
export type OperatorType = "admin" | "client" | "system" | "device";

export const operationLog = sqliteTable(
  "operation_log",
  {
    ...pk(),
    /** 请求关联 ID（requestId），贯穿日志与审计表，实现全链路追踪 */
    requestId: text("request_id"),
    /** 操作者 ID（system 类型时为 null；客户端用户 ID 不属于 admin_user 表，故无外键） */
    operatorId: text("operatorId"),
    operatorName: text("operatorName").notNull(),
    /** 操作者类型，默认 admin 兼容历史数据 */
    operatorType: text("operatorType").$type<OperatorType>().notNull().default("admin"),
    module: text("module").notNull(),
    action: text("action").notNull(),
    targetType: text("targetType").notNull(),
    targetId: text("targetId"),
    targetName: text("targetName"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown> | null>(),
    // 历史表例外：列名为 camelCase，且无 updatedAt / deletedAt，故不套用通用片段
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_operation_log_module").on(table.module),
    index("idx_operation_log_operator").on(table.operatorId),
    index("idx_operation_log_created_at").on(table.createdAt),
  ],
);
