/**
 * 内置资产清单的 Zod Schema：磁盘清单是运营侧手改文件的唯一入口，读入必须按结构校验
 * （坏清单只记 warn 并按空清单处理，不让一个字段写错把接口打崩）。
 *
 * 结构定义见 ./builtin-assets.types；id / 版本的字符集与下发侧的路径校验同一套口径。
 */
import { z } from "zod";

/** 资产 id 与版本号的字符集：同时用作存储目录名与 URL 段，故不接受 `/`、`.` 开头的取值 */
export const builtinAssetSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const builtinAssetFileEntrySchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 必须是 64 位十六进制小写"),
  size: z.number().int().nonnegative(),
});

export const builtinManifestAssetSchema = z.object({
  id: z.string().regex(builtinAssetSegmentPattern, "资产 id 含非法字符"),
  kind: z.string().min(1),
  version: z.string().regex(builtinAssetSegmentPattern, "版本号含非法字符"),
  executable: z.boolean(),
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  files: z.array(builtinAssetFileEntrySchema).min(1),
});

export const builtinManifestSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  assets: z.array(builtinManifestAssetSchema),
});
