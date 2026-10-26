/**
 * 操作日志分析 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { DATE_ONLY_REGEX, isValidDateStr } from "@ucode/hub-lib/date-format";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { getOperationLogAnalytics } from "#/shared-services/operation-log/operation-log.analytics";

/** 单次分析允许的最大时间跨度（天），防止大范围全表聚合 */
const MAX_RANGE_DAYS = 92;

export const operationLogAnalyticsSchema = z
  .object({
    startDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr),
    endDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr),
    granularity: z.enum(["hour", "day", "week"]).optional(),
    breakdown: z.enum(["action", "module"]).optional(),
    module: z.string().optional(),
    action: z.string().optional(),
    operatorName: z.string().optional(),
    compare: z.enum(["none", "previous"]).optional(),
  })
  .refine(
    (data) => {
      const start = new Date(`${data.startDate}T00:00:00Z`).getTime();
      const end = new Date(`${data.endDate}T00:00:00Z`).getTime();
      return end >= start && end - start <= MAX_RANGE_DAYS * 86_400_000;
    },
    { message: `分析时间范围需在 ${MAX_RANGE_DAYS} 天内` },
  );

/** 操作日志分析查询参数（由 schema 派生，客户端与 SFn 共用） */
export type OperationLogAnalyticsParams = z.infer<typeof operationLogAnalyticsSchema>;

/** 获取操作日志分析数据 */
export const getOperationLogAnalyticsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .validator(operationLogAnalyticsSchema)
  .handler(async ({ data }) => getOperationLogAnalytics(data));
