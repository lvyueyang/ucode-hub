/**
 * UI 翻译（ui_translation）zod schema：单一来源
 */

import { z } from "zod";
import { EDITOR_TYPES } from "#/constants/editor-types";
import { listSchema } from "#/validators/common.schemas";
import { localeSchema } from "./i18n.types";

export const formSchema = z.object({
  id: z.string().optional(),
  locale: localeSchema,
  key: z.string().min(1).max(300),
  value: z.string().min(1),
  valueType: z.enum(EDITOR_TYPES).optional(),
});

/**
 * UI 翻译列表查询：通用分页 / 每页条数 / 关键词 / 排序参数 + 语言筛选
 * pageSize 必须随查询透传到服务层，前端每页条数控件才不是无效控件
 */
export const uiTranslationListSchema = listSchema.extend({
  locale: localeSchema.optional(),
});

export const deleteSchema = z.object({ id: z.string().min(1) });
