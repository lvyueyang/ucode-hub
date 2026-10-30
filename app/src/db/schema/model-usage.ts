/**
 * 模型用量表：中继模型端点（`/v1/chat/completions`）每次调用的落库记录，成功与失败各记一行。
 *
 * 归属沿用 device / message 的多态写法（`accountType` + `accountId`，不建外键）：设备令牌调用记设备属主，
 * 网页会话调用记本人，`deviceId` 只在设备身份时有值。token 数取自上游返回的 `usage`；
 * 上游不回 usage、或流式中途断开时留空——「没拿到」与「是 0」是两回事，故三列均可空。
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { UserType } from "#/types/user";

import { createdAt, pk } from "./columns";

/** 调用结果：`ok` 上游正常返回；`error` 上游报错、连接失败或流中断 */
export type ModelUsageStatus = "ok" | "error";

export const modelUsage = sqliteTable(
  "model_usage",
  {
    ...pk(),
    accountType: text("account_type").$type<UserType>().notNull(),
    accountId: text("account_id").notNull(),
    /** 设备令牌调用记其设备 id；网页会话调用为 null */
    deviceId: text("device_id"),
    model: text("model").notNull(),
    /** 命中厂商 id（`ai_providers` 的对象键） */
    providerId: text("provider_id").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    /** 上游调用耗时（毫秒）：非流式为整段响应耗时，流式为整段流时长 */
    latencyMs: integer("latency_ms").notNull(),
    status: text("status").$type<ModelUsageStatus>().notNull(),
    /** 失败摘要（上游状态码与原错误体节选），成功为 null */
    errorMessage: text("error_message"),
    ...createdAt(),
  },
  (table) => [
    index("idx_model_usage_created_at").on(table.createdAt),
    index("idx_model_usage_account").on(table.accountId),
  ],
);
