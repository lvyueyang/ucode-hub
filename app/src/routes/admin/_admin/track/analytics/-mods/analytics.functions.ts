/**
 * 事件分析 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { DATE_ONLY_REGEX, isValidDateStr } from "@ucode/hub-lib/date-format";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { getTrackAnalytics } from "#/services/track/track.server";

export const analyticsQuerySchema = z.object({
  startDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr),
  endDate: z.string().regex(DATE_ONLY_REGEX).refine(isValidDateStr),
  granularity: z.enum(["hour", "day", "week"]).optional(),
  eventNames: z.array(z.string()).optional(),
  metric: z.enum(["count", "users"]).optional(),
  breakdown: z.string().optional(),
  compare: z.enum(["none", "previous", "year"]).optional(),
});

/** 事件分析查询参数（由 schema 派生，客户端与 SFn 共用） */
export type AnalyticsQueryParams = z.infer<typeof analyticsQuerySchema>;

/** 获取事件分析数据 */
export const getTrackAnalyticsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_QUERY)])
  .validator(analyticsQuerySchema)
  .handler(async ({ data }) => getTrackAnalytics(data));
