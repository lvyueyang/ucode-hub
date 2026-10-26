/**
 * 系统监控 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  forceQuerySchema,
  systemMetricHistorySchema,
} from "#/services/system-metric/system-metric.schemas";
import {
  getDatabaseSizes,
  getStorageUsage,
  getSystemMetricHistory,
  getSystemOverview,
} from "#/services/system-metric/system-metric.server";

/** 获取实时运行快照 */
export const getSystemOverviewSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.SYSTEM_MONITOR_VIEW)])
  .handler(async () => getSystemOverview());

/** 获取历史资源趋势 */
export const getSystemMetricHistorySFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.SYSTEM_MONITOR_VIEW)])
  .validator(systemMetricHistorySchema)
  .handler(async ({ data }) => getSystemMetricHistory(data.range));

/** 查询 STORAGE_DIR 占用（force 强制重算） */
export const getStorageUsageSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.SYSTEM_MONITOR_VIEW)])
  .validator(forceQuerySchema)
  .handler(async ({ data }) => getStorageUsage(data.force));

/** 查询数据库各表占用（force 强制重算） */
export const getDatabaseSizesSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.SYSTEM_MONITOR_VIEW)])
  .validator(forceQuerySchema)
  .handler(async ({ data }) => getDatabaseSizes(data.force));
