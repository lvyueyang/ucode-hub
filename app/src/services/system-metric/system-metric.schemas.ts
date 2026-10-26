/**
 * 系统监控 Schema：Server Function 入参校验（客户端与服务端共用类型来源）
 */
import { z } from "zod";
import { SYSTEM_METRIC_RANGES } from "./system-metric.types";

/** 历史趋势查询参数 */
export const systemMetricHistorySchema = z.object({
  range: z.enum(SYSTEM_METRIC_RANGES),
});

/** 按需巡检查询参数（force 强制重算，绕过缓存） */
export const forceQuerySchema = z.object({
  force: z.boolean().optional(),
});
