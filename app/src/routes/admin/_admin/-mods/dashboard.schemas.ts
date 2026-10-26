/**
 * 仪表盘 Server Function 入参校验
 */
import { z } from "zod";
import { DASHBOARD_RANGES } from "#/services/dashboard/dashboard.types";

/** 仪表盘概览查询参数 */
export const dashboardOverviewSchema = z.object({
  range: z.enum(DASHBOARD_RANGES),
});

/** 仪表盘日志摘要查询参数（时间范围同概览，force 绕过缓存重扫） */
export const dashboardErrorSummarySchema = dashboardOverviewSchema.extend({
  force: z.boolean().optional(),
});
