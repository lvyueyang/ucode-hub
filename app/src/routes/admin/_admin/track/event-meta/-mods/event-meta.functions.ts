/**
 * 元事件管理路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  eventMetaCreateSchema,
  eventMetaDeleteSchema,
  eventMetaUpdateSchema,
} from "#/services/track/event-meta.schemas";
import {
  createTrackEventMeta,
  deleteTrackEventMeta,
  updateTrackEventMeta,
} from "#/services/track/track.server";

/** 创建元事件 */
export const createEventMetaSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_MANAGE)])
  .validator(eventMetaCreateSchema)
  .handler(async ({ data }) => {
    const { name, ...input } = data;
    return createTrackEventMeta(name, input);
  });

/** 更新元事件 */
export const updateEventMetaSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_MANAGE)])
  .validator(eventMetaUpdateSchema)
  .handler(async ({ data }) => {
    const { name, ...input } = data;
    return updateTrackEventMeta(name, input);
  });

/** 删除元事件 */
export const deleteEventMetaSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_MANAGE)])
  .validator(eventMetaDeleteSchema)
  .handler(async ({ data }) => deleteTrackEventMeta(data.name));
