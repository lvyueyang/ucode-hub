/** 外部客户端查询自己名下的设备 */
import { createFileRoute } from "@tanstack/react-router";
import { bearerAuthRouteGuard } from "#/middleware/bearer-auth";
import { listDevicesForOwner } from "#/services/device/device.server";
import { logger } from "#/shared-services/logger";

export const Route = createFileRoute("/api/v1/devices/list")({
  server: {
    middleware: [bearerAuthRouteGuard],
    handlers: {
      GET: async ({ context }) => {
        const devices = await listDevicesForOwner(context.user);
        logger.debug({ ownerId: context.user.id, count: devices.length }, "查询名下设备");

        return Response.json({ devices });
      },
    },
  },
});
