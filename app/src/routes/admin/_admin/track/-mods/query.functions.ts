/**
 * 埋点事件查询 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { getTrackEventNames, searchTrackEvents } from "#/services/track/track.server";
import { trackEventListSchema } from "#/services/track/track-query.schemas";

/** 分页查询埋点事件（事件名 / 关键词 / 日期范围；分页与每页条数原样透传到服务层） */
export const searchTrackEventsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_QUERY)])
  .validator(trackEventListSchema)
  .handler(async ({ data }) => searchTrackEvents(data));

/** 获取已有的事件名称列表 */
export const getTrackEventNamesSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_QUERY)])
  .handler(async () => getTrackEventNames());
