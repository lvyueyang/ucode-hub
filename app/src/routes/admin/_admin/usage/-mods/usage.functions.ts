/**
 * 用量页路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { usageListSchema, usageTotalsSchema } from "#/services/usage/usage.schemas";
import { listUsageForAdmin, usageTotalsForAdmin } from "#/services/usage/usage.server";

/** 获取用量列表（分页、账号 / 设备 / 模型 / 时间段筛选、排序） */
export const getUsageListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.USAGE_VIEW)])
  .validator(usageListSchema)
  .handler(async ({ data }) => listUsageForAdmin(data));

/** 获取用量汇总（与列表同一套筛选，页头卡片与下方列表必须同口径） */
export const getUsageTotalsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.USAGE_VIEW)])
  .validator(usageTotalsSchema)
  .handler(async ({ data }) => usageTotalsForAdmin(data));
