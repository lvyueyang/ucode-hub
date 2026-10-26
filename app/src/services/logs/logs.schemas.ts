/**
 * 日志查询模块 Zod Schema：管理端日志列表查询参数的单一来源
 */
import { z } from "zod";
import { listSchema } from "#/validators/common.schemas";

/** 日志列表查询：通用分页 / 关键词 / 排序参数 + 级别与日期范围筛选 */
export const logsListSchema = listSchema.extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  level: z.string().optional(),
});
