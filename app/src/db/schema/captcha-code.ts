/**
 * 验证码表
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, pk } from "./columns";

export const captchaCode = sqliteTable(
  "captcha_code",
  {
    ...pk(),
    type: text("type").notNull(), // email | sms
    target: text("target").notNull(), // 邮箱或手机号
    code: text("code").notNull(),
    used: integer("used", { mode: "boolean" }).default(false).notNull(),
    /** 该码的校验失败次数：达到阈值即作废，避免短码被无限次尝试 */
    attempts: integer("attempts").default(0).notNull(),
    expiredAt: integer("expired_at", { mode: "timestamp_ms" }).notNull(),
    // 验证码仅需创建时间，不套用 timestamps()
    ...createdAt(),
  },
  (table) => [index("idx_captcha_target_type").on(table.target, table.type)],
);
