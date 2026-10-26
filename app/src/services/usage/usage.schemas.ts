/**
 * 用量域的 zod Schema 单一来源：管理端列表 / 汇总筛选，以及上游 usage 的收窄。
 *
 * 列表与汇总共用同一组筛选字段（账号、设备、模型、状态、日期范围），
 * 保证「页头汇总」与「下方列表」永远是同一口径
 * （两处各写一套必然漂移：汇总按全部数据、列表按筛后数据是常见事故）。
 */
import { DATE_ONLY_REGEX, isValidDateStr } from "@ucode/hub-lib/date-format";
import { z } from "zod";

import { listSchema } from "#/validators/common.schemas";

/** 用量筛选字段（列表与汇总共用） */
export const usageFilterSchema = z.object({
  accountType: z.enum(["admin", "client"]).optional(),
  accountId: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  status: z.enum(["ok", "error"]).optional(),
  startDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr).optional(),
  endDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr).optional(),
});

/** 用量列表查询：通用分页 / 排序参数 + 用量筛选 */
export const usageListSchema = listSchema.extend(usageFilterSchema.shape);

/** 用量汇总查询：只有筛选，不分页 */
export const usageTotalsSchema = usageFilterSchema;

/** 上游 OpenAI 兼容 usage 块：字段名固定，值可能缺失或非数字 */
export const openAiUsageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
});
