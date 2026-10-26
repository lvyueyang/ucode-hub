/**
 * 运行日志分析 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { DATE_ONLY_REGEX, isValidDateStr } from "@ucode/hub-lib/date-format";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { getLogAnalytics } from "#/services/logs/log-analytics.server";

/** 单次分析允许的最大时间跨度（天），防止大范围文件扫描 */
const MAX_RANGE_DAYS = 31;

export const logAnalyticsSchema = z
  .object({
    startDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr),
    endDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr),
    granularity: z.enum(["hour", "day"]).optional(),
    level: z.string().optional(),
    keyword: z.string().optional(),
  })
  .refine(
    (data) => {
      const start = new Date(`${data.startDate}T00:00:00Z`).getTime();
      const end = new Date(`${data.endDate}T00:00:00Z`).getTime();
      return end >= start && end - start <= MAX_RANGE_DAYS * 86_400_000;
    },
    { message: `分析时间范围需在 ${MAX_RANGE_DAYS} 天内` },
  );

/** 运行日志分析查询参数（由 schema 派生，客户端与 SFn 共用） */
export type LogAnalyticsParams = z.infer<typeof logAnalyticsSchema>;

/** 获取运行日志分析数据 */
export const getLogAnalyticsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .validator(logAnalyticsSchema)
  .handler(async ({ data }) => getLogAnalytics(data));
