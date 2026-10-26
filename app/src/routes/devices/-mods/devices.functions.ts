/**
 * 前台「我的设备」路由共享 Server Function
 *
 * 自助操作只认当前登录用户：归属一律由上下文推导后传给服务层，请求体里不接受 owner，
 * 因此客户端权限码是否为空集合都不影响越权防护（服务层再按 owner 收窄一次）。
 */
import { createServerFn } from "@tanstack/react-start";
import { clientAuthGuard } from "#/middleware/client-auth";
import { deviceRenameSchema, deviceRevokeSchema } from "#/services/device/device.schemas";
import { listDevicesForOwner, renameDevice, revokeDevice } from "#/services/device/device.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 查询自己名下的全部设备 */
export const getMyDevicesSFn = createServerFn({ method: "GET" })
  .middleware([clientAuthGuard])
  .handler(async ({ context }) => listDevicesForOwner({ type: "client", id: context.userId }));

/** 给自己的设备改名 */
export const renameMyDeviceSFn = createServerFn({ method: "POST" })
  .middleware([clientAuthGuard])
  .validator(deviceRenameSchema)
  .handler(async ({ data, context }) => {
    const device = await renameDevice({
      id: data.id,
      name: data.name,
      owner: { type: "client", id: context.userId },
    });
    logCrud(
      { id: context.userId, username: context.username },
      "device",
      "rename",
      { id: device.id, name: device.name },
      { operatorType: "client" },
    );
    return device;
  });

/** 吊销自己的设备：令牌立即失效，设备当场断开 */
export const revokeMyDeviceSFn = createServerFn({ method: "POST" })
  .middleware([clientAuthGuard])
  .validator(deviceRevokeSchema)
  .handler(async ({ data, context }) => {
    const device = await revokeDevice({
      id: data.id,
      owner: { type: "client", id: context.userId },
    });
    logCrud(
      { id: context.userId, username: context.username },
      "device",
      "revoke",
      { id: device.id, name: device.name },
      { operatorType: "client" },
    );
    return device;
  });
