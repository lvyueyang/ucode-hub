/**
 * 操作日志模块 Zod Schema：管理端操作日志列表查询参数的单一来源
 */
import { DATE_ONLY_REGEX, isValidDateStr } from "@ucode/hub-lib/date-format";
import { z } from "zod";
import { listSchema } from "#/validators/common.schemas";

/** 操作日志列表查询：通用分页 / 关键词 / 排序参数 + 模块 / 动作 / 日期范围筛选 */
export const operationLogListSchema = listSchema.extend({
  module: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr).optional(),
  endDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr).optional(),
});
