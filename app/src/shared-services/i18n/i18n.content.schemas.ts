/**
 * 实体翻译（content_translation）zod schema：单一来源
 */

import { z } from "zod";
import { EDITOR_TYPES } from "#/constants/editor-types";
import { listSchema } from "#/validators/common.schemas";
import { localeSchema } from "./i18n.types";

export const formSchema = z.object({
  id: z.string().optional(),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  fieldName: z.string().min(1),
  locale: localeSchema,
  value: z.string().min(1),
  valueType: z.enum(EDITOR_TYPES).optional(),
});

/**
 * 实体翻译列表查询：通用分页 / 每页条数 / 关键词 / 排序参数 + 实体类型与语言筛选
 * pageSize 必须随查询透传到服务层，前端每页条数控件才不是无效控件
 */
export const contentTranslationListSchema = listSchema.extend({
  entityType: z.string().optional(),
  locale: localeSchema.optional(),
});

export const deleteSchema = z.object({ id: z.string().min(1) });

/** 查询某实体某字段的全部语言翻译（抽屉用） */
export const fieldTranslationQuerySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  fieldName: z.string().min(1),
});
