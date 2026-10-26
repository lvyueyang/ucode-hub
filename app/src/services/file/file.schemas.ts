/**
 * 文件模块 Zod Schema（单一来源）：列表查询参数 + 标签归一化规则
 */
import { z } from "zod";
import { listSchema } from "#/validators/common.schemas";

/** 单个标签最大长度 */
export const FILE_TAG_MAX_LENGTH = 100;

/** 单文件标签数量上限 */
export const FILE_TAG_MAX_COUNT = 20;

/** 文件 ID 校验（删除 / 单项操作复用） */
export const fileIdSchema = z.object({ id: z.string().min(1) });

/**
 * 标签归一化：去首尾空白 → 丢弃空项 → 去重（保留首次出现顺序）→ 单标签超长截断
 * 原始输入可能来自手工输入或粘贴（逗号 / 分号分隔由前端负责拆分）
 */
export function normalizeFileTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const tag = item.trim().slice(0, FILE_TAG_MAX_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

/**
 * 标签数组校验：先归一化再校验数量上限
 * 归一化在前，避免「因重复项触顶」这类无效报错
 */
export const fileTagsSchema = z
  .array(z.string())
  .transform(normalizeFileTags)
  .refine((tags) => tags.length <= FILE_TAG_MAX_COUNT, `最多 ${FILE_TAG_MAX_COUNT} 个标签`);

/**
 * 文件列表查询参数：以通用列表参数为基座，追加文件域筛选
 * tag 为独立标签搜索（按标签元素做包含匹配），与 keyword（文件名 / 文件 ID）互不影响
 */
export const fileListSchema = listSchema.extend({
  status: z.enum(["temp", "permanent"]).optional(),
  /** 标签关键词：按标签元素做包含匹配 */
  tag: z.string().optional(),
  mimePrefix: z.string().optional(),
  /** 需要排除的 mime 前缀（如附件媒体库排除 image/ video/ audio/） */
  excludeMimePrefixes: z.array(z.string()).optional(),
});

/** 覆盖文件标签（空数组即清空） */
export const updateFileTagsSchema = z.object({
  id: z.string().min(1),
  tags: fileTagsSchema,
});
