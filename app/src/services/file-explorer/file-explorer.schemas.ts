/**
 * 资源管理器共享 Zod Schema
 */
import { z } from "zod";

/** 相对子路径（默认根目录） */
export const subPathSchema = z.object({
  subPath: z.string().default(""),
});

/** 子路径 + 名称（创建目录） */
export const subPathAndNameSchema = z.object({
  subPath: z.string().default(""),
  name: z.string().min(1, "名称不能为空"),
});

/** 重命名 */
export const renameSchema = z.object({
  subPath: z.string(),
  newName: z.string().min(1, "新名称不能为空"),
});
