/**
 * 文件管理：服务端辅助函数（上传逻辑、存储、清理、列表、删除）
 */
import { createHash, randomUUID } from "node:crypto";
import dayjs from "dayjs";
import { and, eq, like, lt, not, or, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { file } from "#/db/schema";
import { logger } from "#/shared-services/logger";
import {
  buildSortClause,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import { storage } from "#/shared-services/storage";
import type { PaginatedResult, PaginatedSortParams } from "#/types/query";

export type FileRecord = typeof file.$inferSelect;

export const TEMP_EXPIRE_HOURS = 168;

/** 计算 SHA256 哈希（供上传秒传检测使用） */
export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** 生成存储名与落盘路径（{YYYY-MM-DD}/{uuid}{ext}） */
function buildStoredPath(extension: string): {
  storedName: string;
  path: string;
} {
  const date = dayjs().format("YYYY-MM-DD");
  const storedName = `${randomUUID()}${extension}`;
  return { storedName, path: `${date}/${storedName}` };
}

/**
 * 读取文件内容（供下载路由使用）
 * 物理文件缺失（存储目录被清理等造成的孤儿记录）按未找到处理：
 * 避免把带绝对路径的 ENOENT 当 500 抛出并泄漏给客户端
 */
export async function readFileContent(id: string) {
  const [record] = await db
    .select()
    .from(file)
    .where(and(eq(file.id, id), notDeleted(file.deletedAt)))
    .limit(1);
  if (!record) return null;

  try {
    const buffer = await storage.read(record.path);
    return { buffer, record };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn({ id, path: record.path }, "文件记录存在但物理文件缺失");
      return null;
    }
    throw error;
  }
}

/** 清理过期临时文件 */
export async function cleanExpiredFiles(): Promise<number> {
  const expiredFiles = await db
    .select()
    .from(file)
    .where(
      and(eq(file.status, "temp"), lt(file.expiredAt, new Date()), notDeleted(file.deletedAt)),
    );

  if (expiredFiles.length === 0) return 0;

  await db
    .update(file)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(file.status, "temp"), lt(file.expiredAt, new Date()), notDeleted(file.deletedAt)),
    );

  for (const f of expiredFiles) {
    storage.delete(f.path).catch((err) => {
      logger.error({ path: f.path, error: (err as Error).message }, "清理物理文件失败");
    });
  }

  logger.info({ count: expiredFiles.length }, "过期临时文件已清理");
  return expiredFiles.length;
}

/** 获取文件列表（支持分页、筛选、关键词 / 标签搜索、排序） */
export async function getFileList(
  params?: PaginatedSortParams & {
    status?: string;
    keyword?: string;
    /** 标签关键词：按标签元素做包含匹配（与关键词搜索一致的模糊语义） */
    tag?: string;
    mimePrefix?: string;
    excludeMimePrefixes?: string[];
  },
): Promise<PaginatedResult<FileRecord>> {
  const {
    status,
    keyword,
    tag,
    mimePrefix,
    excludeMimePrefixes,
    sortField,
    sortOrder = "descend",
    page = 1,
    pageSize = 20,
  } = params ?? {};
  const cappedPageSize = Math.min(pageSize, 100);
  const conditions = [notDeleted(file.deletedAt)];
  if (status) conditions.push(eq(file.status, status));
  // 关键词同时匹配原始文件名与文件 ID（ID 为 UUID，支持整串或片段）
  if (keyword) {
    const pattern = `%${keyword}%`;
    // uuid 列与文本比较需显式转型，否则 PG 不会做隐式转换
    const keywordCondition = or(like(file.originalName, pattern), like(file.id, pattern));
    if (keywordCondition) conditions.push(keywordCondition);
  }
  // 标签搜索：tags 以 JSON 数组文本存储，用 json_each 展开元素后做包含匹配（未打标签的文件自然不命中）
  if (tag) {
    const pattern = `%${tag}%`;
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${file.tags}) AS tag WHERE tag.value LIKE ${pattern})`,
    );
  }

  if (mimePrefix) conditions.push(like(file.mimeType, `${mimePrefix}%`));
  // 排除指定 mime 前缀（如附件媒体库排除图片/视频/音频）
  for (const prefix of excludeMimePrefixes ?? []) {
    conditions.push(not(like(file.mimeType, `${prefix}%`)));
  }

  const sortOrderClause = buildSortClause(
    { size: file.size, createdAt: file.createdAt },
    sortField,
    sortOrder,
    "createdAt",
  );

  const offset = paginationOffset(page, cappedPageSize);

  return executePaginatedQuery(
    db
      .select()
      .from(file)
      .where(and(...conditions))
      .orderBy(sortOrderClause)
      .limit(cappedPageSize)
      .offset(offset),
    db.$count(
      db
        .select()
        .from(file)
        .where(and(...conditions)),
    ),
    page,
    cappedPageSize,
  );
}

/** 删除文件（软删除） */
export async function deleteFile(id: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(file)
    .where(and(eq(file.id, id), notDeleted(file.deletedAt)))
    .limit(1);
  if (!existing) return false;

  await db.update(file).set({ deletedAt: new Date() }).where(eq(file.id, id));

  return true;
}

/**
 * 物理删除文件记录与磁盘文件（内部补偿回滚专用，不走软删除）
 *
 * 仅用于回滚内部刚创建、尚未被引用的文件（如备份成功但后续覆盖失败）；
 * 用户侧删除一律走 deleteFile 的软删除。
 */
export async function removeFile(id: string): Promise<void> {
  const [record] = await db.select().from(file).where(eq(file.id, id)).limit(1);
  if (!record) return;

  await db.delete(file).where(eq(file.id, id));

  // 物理文件删除失败仅告警：记录已删，残留文件由运维清理
  await storage.delete(record.path).catch((error) => {
    logger.warn({ id, path: record.path, error: (error as Error).message }, "回滚删除物理文件失败");
  });
}

/** 将临时文件转为永久存储 */
export async function makePermanent(id: string): Promise<boolean> {
  await db
    .update(file)
    .set({ status: "permanent", expiredAt: null, updatedAt: new Date() })
    .where(eq(file.id, id));

  return true;
}

/**
 * 覆盖文件标签（字符串数组，空数组即清空标签）
 * 标签的归一化（去空白 / 去重 / 限长限量）由调用方 schema 负责，服务层只做落库
 * 文件不存在或已删除时返回 false，由调用方决定提示
 */
export async function updateFileTags(id: string, tags: string[]): Promise<boolean> {
  const [existing] = await db
    .select({ id: file.id })
    .from(file)
    .where(and(eq(file.id, id), notDeleted(file.deletedAt)))
    .limit(1);
  if (!existing) return false;

  await db.update(file).set({ tags, updatedAt: new Date() }).where(eq(file.id, id));

  return true;
}

/**
 * 上传文件：SHA256 秒传检测 + 存储落盘 + 入库
 * 返回记录及是否命中秒传
 * imageMeta 由调用方嗅探后传入，非图片文件传 null
 */
export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  permanent: boolean,
  imageMeta?: { width: number; height: number } | null,
): Promise<{ record: FileRecord; isDuplicated: boolean }> {
  const hash = sha256(buffer);

  const [existing] = await db
    .select()
    .from(file)
    .where(and(eq(file.sha256, hash), eq(file.status, "permanent"), notDeleted(file.deletedAt)))
    .limit(1);

  if (existing) {
    return { record: existing, isDuplicated: true };
  }

  const ext = originalName.includes(".") ? originalName.slice(originalName.lastIndexOf(".")) : "";
  const { storedName, path } = buildStoredPath(ext);

  await storage.save(path, buffer);

  const status = permanent ? ("permanent" as const) : ("temp" as const);
  const expiredAt = permanent ? null : new Date(Date.now() + TEMP_EXPIRE_HOURS * 3600 * 1000);
  const [record] = await db
    .insert(file)
    .values({
      sha256: hash,
      originalName,
      storedName,
      mimeType,
      size: buffer.length,
      path,
      width: imageMeta?.width ?? null,
      height: imageMeta?.height ?? null,
      status,
      expiredAt,
    })
    .returning();

  logger.info({ id: record.id, name: originalName }, "文件上传成功");
  return { record, isDuplicated: false };
}

/** 替换文件名的扩展名（无扩展名时直接追加） */
function replaceExtension(fileName: string, extension: string): string {
  return `${fileName.replace(/\.[^./\\]+$/, "")}${extension}`;
}

/**
 * 替换文件内容（原图覆盖）
 *
 * 用于管理端图片处理：写入新物理文件 → 更新记录 → 删除旧物理文件。
 * 覆盖后 id 不变，故引用该文件的外键不会断，但图片内容会变。
 * 扩展名由调用方按嗅探出的新格式传入（格式可能变化，不能沿用原文件名后缀）。
 */
export async function replaceFileContent(
  id: string,
  input: {
    buffer: Buffer;
    mimeType: string;
    extension: string;
    width?: number | null;
    height?: number | null;
  },
): Promise<{ sizeBefore: number; sizeAfter: number } | null> {
  const [existing] = await db
    .select()
    .from(file)
    .where(and(eq(file.id, id), notDeleted(file.deletedAt)))
    .limit(1);
  if (!existing) return null;

  // 换新存储名：格式变化时扩展名必须随之更新
  const { storedName, path } = buildStoredPath(input.extension);
  await storage.save(path, input.buffer);

  // 格式变化时同步原始文件名后缀，否则列表与下载文件名会与实际内容不符
  const formatChanged = existing.mimeType !== input.mimeType;

  await db
    .update(file)
    .set({
      sha256: sha256(input.buffer),
      storedName,
      path,
      mimeType: input.mimeType,
      size: input.buffer.length,
      originalName: formatChanged
        ? replaceExtension(existing.originalName, input.extension)
        : existing.originalName,
      width: input.width ?? null,
      height: input.height ?? null,
      updatedAt: new Date(),
    })
    .where(eq(file.id, id));

  // 旧物理文件必须显式删除：deleteFile 只做软删除，不会清理磁盘
  // 失败不回滚（新文件已落盘、记录已更新，回滚代价大于收益），仅告警
  await storage.delete(existing.path).catch((error) => {
    logger.warn(
      { path: existing.path, error: (error as Error).message },
      "覆盖文件后清理旧物理文件失败",
    );
  });

  logger.info({ id, sizeBefore: existing.size, sizeAfter: input.buffer.length }, "文件内容已覆盖");

  return { sizeBefore: existing.size, sizeAfter: input.buffer.length };
}

/** 查询文件原始文件名（供预览组件使用），不存在返回 null */
export async function getFileInfo(id: string): Promise<string | null> {
  const [result] = await db
    .select({ originalName: file.originalName })
    .from(file)
    .where(and(eq(file.id, id), notDeleted(file.deletedAt)))
    .limit(1);
  return result?.originalName ?? null;
}

/**
 * 复制文件为新的永久文件（图片覆盖前的原图备份）
 *
 * 复用原物理文件字节写入新存储名并新建记录，新记录置为 permanent 避免被临时清理；
 * 记录存在但物理文件缺失（孤儿记录）时返回 null，由调用方决定是否中断覆盖。
 * 文件名在主干后追加 `-backup`（如 照片.png → 照片-backup.png）。
 */
export async function duplicateFile(id: string): Promise<FileRecord | null> {
  const source = await readFileContent(id);
  if (!source) return null;
  const { record, buffer } = source;

  const ext = record.originalName.includes(".")
    ? record.originalName.slice(record.originalName.lastIndexOf("."))
    : "";
  const base = record.originalName.slice(0, record.originalName.length - ext.length);
  // original_name 列为 varchar(500)：先按可用长度裁剪主干；扩展名本身过长时上面的裁剪兜不住，
  // 再对整体做一次上限截断，保证写入长度恒 ≤ 500
  const suffix = "-backup";
  const maxBaseLength = Math.max(0, 500 - suffix.length - ext.length);
  const safeBase = base.slice(0, maxBaseLength);
  const originalName = `${safeBase}${suffix}${ext}`.slice(0, 500);

  const { storedName, path } = buildStoredPath(ext);
  await storage.save(path, buffer);

  const [copy] = await db
    .insert(file)
    .values({
      sha256: record.sha256,
      originalName,
      storedName,
      mimeType: record.mimeType,
      size: record.size,
      path,
      width: record.width,
      height: record.height,
      status: "permanent",
      expiredAt: null,
    })
    .returning();

  logger.info({ id, copyId: copy.id }, "文件已备份");
  return copy;
}
