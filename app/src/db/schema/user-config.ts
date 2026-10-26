/**
 * 通用用户配置表：以 jsonb config 存放用户自己的配置，天然可扩展
 * 通知渠道在 config.notify_channels 段；未来可增加其它用户配置键
 */
import { jsonb, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { UserType } from "#/types/user";
import { pk, softDelete, timestamps } from "./columns";

/** 单渠道配置：启用与否 + 目标（value）+ 可选签名（secret）。enabled 缺省视为停用 */
export interface NotifyChannelConfig {
  enabled?: boolean;
  value?: string;
  secret?: string;
}

/** 通知渠道配置段：每个外发渠道独立开关 + 目标 */
export interface UserNotifyChannels {
  email?: NotifyChannelConfig;
  feishu?: NotifyChannelConfig;
  wecom?: NotifyChannelConfig;
  dingtalk?: NotifyChannelConfig;
  webhook?: NotifyChannelConfig;
  /** 短信渠道预留（本轮未实现投递） */
  sms?: NotifyChannelConfig;
}

/** 通用用户配置结构（jsonb） */
export interface UserConfig {
  notify_channels?: UserNotifyChannels;
  // 未来其它配置键在此扩展
}

export const userConfig = pgTable(
  "user_config",
  {
    ...pk(),
    userId: uuid("user_id").notNull(),
    userType: varchar("user_type", { length: 20 }).$type<UserType>().notNull(),
    config: jsonb("config").$type<UserConfig>().notNull().default({}),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [uniqueIndex("idx_user_config_user").on(table.userType, table.userId)],
);
