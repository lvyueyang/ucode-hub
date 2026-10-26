/**
 * 仪表盘 Server Function：按当前管理员权限编排各域概览数据
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "#/permissions/admin-permissions";
import { getDashboardErrorSummary } from "#/services/dashboard/dashboard.logs.server";
import { getDashboardOverview } from "#/services/dashboard/dashboard.overview.server";
import { getSystemOverview } from "#/services/system-metric/system-metric.server";
import { dashboardErrorSummarySchema, dashboardOverviewSchema } from "./dashboard.schemas";

/** 获取仪表盘概览：各域按权限分块，未授权区块返回 null */
export const getDashboardOverviewSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DASHBOARD_VIEW)])
  .validator(dashboardOverviewSchema)
  .handler(async ({ data, context }) =>
    getDashboardOverview({
      range: data.range,
      canViewTraffic: hasAdminPermission(context.rolePermissions, ADMIN_PERMISSIONS.TRACK_QUERY),
      canViewSystem: hasAdminPermission(
        context.rolePermissions,
        ADMIN_PERMISSIONS.SYSTEM_MONITOR_VIEW,
      ),
      canViewLogs: hasAdminPermission(context.rolePermissions, ADMIN_PERMISSIONS.LOG_VIEW),
    }),
  );

/** 系统实时快照：仪表盘轮询专用，仅取进程实时指标，避免重复触发重量级聚合 */
export const getDashboardSystemSnapshotSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.SYSTEM_MONITOR_VIEW)])
  .handler(async () => getSystemOverview());

/** 运行日志错误摘要：按需加载，受日志查看权限门控；force 供手动刷新绕过缓存 */
export const getDashboardErrorSummarySFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .validator(dashboardErrorSummarySchema)
  .handler(async ({ data }) => getDashboardErrorSummary(data.range, data.force));
