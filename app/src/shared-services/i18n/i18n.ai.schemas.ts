/**
 * 国际化 AI 翻译 zod schema：单一来源
 * 供单字段翻译 SFn（aiTranslateFieldSFn）与批量翻译 SFn（aiBatchTranslateSFn）校验复用
 */

import { z } from "zod";
import { EDITOR_TYPES } from "#/constants/editor-types";
import { localeSchema } from "./i18n.types";

/** 单字段 AI 翻译入参（抽屉内单个字段的「AI 翻译」按钮） */
export const aiTranslateFieldSchema = z.object({
  sourceText: z.string().min(1, "源文本不能为空"),
  sourceLocale: localeSchema,
  targetLocale: localeSchema,
});

/** 批量翻译模式：fill = 仅补齐无翻译的字段；correct = 对已有翻译重新生成并校正 */
export const aiBatchTranslateModeSchema = z.enum(["fill", "correct"]);

export type AiBatchTranslateMode = z.infer<typeof aiBatchTranslateModeSchema>;

/** 批量翻译入参（单实体/全量共用）：客户端把要翻译的记录（id + 源字段值）与字段声明传给 SFn */
export const aiBatchTranslateSchema = z.object({
  entityType: z.string().min(1),
  mode: aiBatchTranslateModeSchema,
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        valueType: z.enum(EDITOR_TYPES).optional(),
      }),
    )
    .min(1),
  /** 要翻译的记录：单实体为一条，全量为其全部实体 */
  records: z
    .array(
      z.object({
        id: z.string().uuid(),
        /** 源值：字段名 → 主表源文本（默认语言） */
        values: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
  /** 目标语言，缺省为全部非默认语言 */
  targetLocales: z.array(localeSchema).min(1).optional(),
  /** 每批打包的实体数（默认 10） */
  batchSize: z.number().int().positive().max(100).optional(),
  /** 是否落库：全量=true；单实体=false（仅回填编辑器供用户确认） */
  writeBack: z.boolean(),
});

export type AiBatchTranslateReq = z.infer<typeof aiBatchTranslateSchema>;
