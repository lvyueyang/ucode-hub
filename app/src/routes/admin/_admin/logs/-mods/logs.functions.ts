/**
 * 日志查询 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { logsListSchema } from "#/services/logs/logs.schemas";
import {
  getLogDates as getLogDatesService,
  searchLogs as searchLogsService,
} from "#/services/logs/logs.server";

/** 分页查询日志（关键词 / 级别 / 日期范围；分页与每页条数原样透传到服务层） */
export const searchLogsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .validator(logsListSchema)
  .handler(async ({ data }) => {
    return searchLogsService(data);
  });

/** 获取可用日志日期列表 */
export const getDatesSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .handler(async () => {
    return getLogDatesService();
  });
