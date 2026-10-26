/**
 * 验证码表
 */
import { boolean, index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createdAt, pk } from "./columns";

export const captchaCode = pgTable(
  "captcha_code",
  {
    ...pk(),
    type: varchar({ length: 20 }).notNull(), // email | sms
    target: varchar({ length: 255 }).notNull(), // 邮箱或手机号
    code: varchar({ length: 10 }).notNull(),
    used: boolean().default(false).notNull(),
    expiredAt: timestamp("expired_at", { withTimezone: true }).notNull(),
    // 验证码仅需创建时间，不套用 timestamps()
    ...createdAt(),
  },
  (table) => [index("idx_captcha_target_type").on(table.target, table.type)],
);
