/**
 * 系统配置表：键值对存储
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk, softDelete, timestamps } from "./columns";

export const systemConfig = sqliteTable(
  "system_config",
  {
    ...pk(),
    key: text("key").unique().notNull(),
    value: text("value").notNull(),
    clientVisible: integer("client_visible", { mode: "boolean" }).default(false).notNull(),
    // 敏感配置：值以 AES-256-GCM 密文入库，读取时解密、管理端列表脱敏
    isSecret: integer("is_secret", { mode: "boolean" }).default(false).notNull(),
    valueType: text("value_type"),
    groupName: text("group_name"),
    description: text("description"),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [index("idx_system_config_group").on(table.groupName)],
);
