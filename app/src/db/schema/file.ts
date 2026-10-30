/**
 * 文件表：记录上传文件元数据，支持秒传和临时/永久状态
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk, softDelete, timestamps } from "./columns";

export const file = sqliteTable(
  "file",
  {
    ...pk(),
    sha256: text("sha256").notNull(),
    originalName: text("original_name").notNull(),
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size", { mode: "number" }).notNull(),
    path: text("path").notNull(),
    /** 图片宽度（非图片或未解析时为 null） */
    width: integer("width"),
    /** 图片高度（非图片或未解析时为 null） */
    height: integer("height"),
    /**
     * 文件标签（字符串数组，JSON 文本存储）
     * 多标签便于在文件库中归类与按标签筛选；写入前经服务层归一化（去空白 / 去重 / 限长限量）
     */
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    status: text("status").default("temp").notNull(),
    expiredAt: integer("expired_at", { mode: "timestamp_ms" }),
    createdByType: text("created_by_type"),
    createdById: text("created_by_id"),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [index("idx_file_sha256").on(table.sha256)],
);
