/**
 * 埋点模块 schema：事件实例表 + 元事件/元属性定义表
 * 数据模型参考神策分析简化版：trackEvent 存采集的事件实例，trackEventMeta/trackPropertyMeta 存事件与属性的元数据
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, pk, timestamps } from "./columns";

/** 埋点事件表：存储客户端上报的原始事件数据 */
export const trackEvent = pgTable(
  "track_event",
  {
    ...pk(),
    time: timestamp({ withTimezone: true }).notNull(),
    userId: uuid("user_id"),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    properties: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    // 事件仅需创建时间，不套用 timestamps()
    ...createdAt(),
  },
  (table) => [
    index("idx_track_event_time").on(table.time.desc()),
    index("idx_track_event_name_time").on(table.name, table.time.desc()),
    index("idx_track_event_user_id").on(table.userId),
    index("idx_track_event_session_id").on(table.sessionId),
    index("idx_track_event_created_at").on(table.createdAt),
  ],
);

/** 元事件表：管理端可配置的事件类型，isPreset 标记系统预置 */
export const trackEventMeta = pgTable("track_event_meta", {
  name: varchar({ length: 100 }).primaryKey(),
  label: varchar({ length: 100 }).notNull(),
  category: varchar({ length: 50 }).notNull(),
  description: text("description"),
  isPreset: boolean("is_preset").default(false).notNull(),
  ...timestamps(),
});

/** 元属性表：管理端可配置的事件属性字段，isPreset 标记系统预置 */
export const trackPropertyMeta = pgTable("track_property_meta", {
  key: varchar({ length: 100 }).primaryKey(),
  label: varchar({ length: 100 }).notNull(),
  dataType: varchar("data_type", { length: 20 }).default("string").notNull(),
  description: text("description"),
  isPreset: boolean("is_preset").default(false).notNull(),
  ...timestamps(),
});
