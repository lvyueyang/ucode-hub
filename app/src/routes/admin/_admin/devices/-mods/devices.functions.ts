/**
 * 设备管理路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  deviceDeleteSchema,
  deviceListSchema,
  deviceRenameSchema,
  deviceRevokeSchema,
} from "#/services/device/device.schemas";
import {
  deleteDevice,
  listDevicesForAdmin,
  renameDevice,
  revokeDevice,
} from "#/services/device/device.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取设备列表（分页、关键词 / 状态 / 归属端筛选、排序） */
export const getDeviceListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DEVICE_VIEW)])
  .validator(deviceListSchema)
  .handler(async ({ data }) => listDevicesForAdmin(data));

/** 设备改名 */
export const renameDeviceSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DEVICE_UPDATE)])
  .validator(deviceRenameSchema)
  .handler(async ({ data, context }) => {
    const device = await renameDevice({ id: data.id, name: data.name });
    logCrud(context.user, "device", "rename", { id: device.id, name: device.name });
    return device;
  });

/** 吊销设备：令牌立即失效，设备当场断开 */
export const revokeDeviceSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DEVICE_REVOKE)])
  .validator(deviceRevokeSchema)
  .handler(async ({ data, context }) => {
    const device = await revokeDevice({ id: data.id });
    logCrud(context.user, "device", "revoke", { id: device.id, name: device.name });
    return device;
  });

/** 删除设备（软删除） */
export const deleteDeviceSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DEVICE_DELETE)])
  .validator(deviceDeleteSchema)
  .handler(async ({ data, context }) => {
    // 服务层未导出按 ID 取单条的入口，审计只留 ID：设备名在删除前已随列表下发
    await deleteDevice({ id: data.id });
    logCrud(context.user, "device", "delete", { id: data.id });
    return { success: true };
  });
