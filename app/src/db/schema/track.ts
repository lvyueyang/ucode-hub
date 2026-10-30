/**
 * 埋点模块 schema：事件实例表 + 元事件/元属性定义表
 * 数据模型参考神策分析简化版：trackEvent 存采集的事件实例，trackEventMeta/trackPropertyMeta 存事件与属性的元数据
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, pk, timestamps } from "./columns";

/** 埋点事件表：存储客户端上报的原始事件数据 */
export const trackEvent = sqliteTable(
  "track_event",
  {
    ...pk(),
    time: integer("time", { mode: "timestamp_ms" }).notNull(),
    userId: text("user_id"),
    sessionId: text("session_id").notNull(),
    name: text("name").notNull(),
    properties: text("properties", { mode: "json" })
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    // 事件仅需创建时间，不套用 timestamps()
    ...createdAt(),
  },
  (table) => [
    // SQLite 索引不支持按列降序声明（查询侧 orderBy 不受影响）
    index("idx_track_event_time").on(table.time),
    index("idx_track_event_name_time").on(table.name, table.time),
    index("idx_track_event_user_id").on(table.userId),
    index("idx_track_event_session_id").on(table.sessionId),
    index("idx_track_event_created_at").on(table.createdAt),
  ],
);

/** 元事件表：管理端可配置的事件类型，isPreset 标记系统预置 */
export const trackEventMeta = sqliteTable("track_event_meta", {
  name: text("name").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  isPreset: integer("is_preset", { mode: "boolean" }).default(false).notNull(),
  ...timestamps(),
});

/** 元属性表：管理端可配置的事件属性字段，isPreset 标记系统预置 */
export const trackPropertyMeta = sqliteTable("track_property_meta", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  dataType: text("data_type").default("string").notNull(),
  description: text("description"),
  isPreset: integer("is_preset", { mode: "boolean" }).default(false).notNull(),
  ...timestamps(),
});
