/**
 * 系统配置表：键值对存储
 */
import { boolean, index, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./columns";

export const systemConfig = pgTable(
  "system_config",
  {
    ...pk(),
    key: varchar({ length: 100 }).unique().notNull(),
    value: text().notNull(),
    clientVisible: boolean("client_visible").default(false).notNull(),
    // 敏感配置：值以 AES-256-GCM 密文入库，读取时解密、管理端列表脱敏
    isSecret: boolean("is_secret").default(false).notNull(),
    valueType: varchar("value_type", { length: 20 }),
    groupName: varchar("group_name", { length: 50 }),
    description: text(),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [index("idx_system_config_group").on(table.groupName)],
);
