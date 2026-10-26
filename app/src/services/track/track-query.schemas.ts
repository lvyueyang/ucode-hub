/**
 * 埋点事件查询模块 Zod Schema：管理端事件列表查询参数的单一来源
 */
import { DATE_ONLY_REGEX, isValidDateStr } from "@ucode/hub-lib/date-format";
import { z } from "zod";
import { listSchema } from "#/validators/common.schemas";

/** 埋点事件列表查询：通用分页 / 关键词 / 排序参数 + 事件定位与日期范围筛选 */
export const trackEventListSchema = listSchema.extend({
  name: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  startDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr).optional(),
  endDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr).optional(),
});
