/** 外部客户端吊销自己名下的设备 */
import { createFileRoute } from "@tanstack/react-router";
import type { ZodError } from "zod";
import { bearerAuthRouteGuard } from "#/middleware/bearer-auth";
import { deviceRevokeSchema } from "#/services/device/device.schemas";
import { revokeDevice } from "#/services/device/device.server";
import { logger } from "#/shared-services/logger";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 服务层对「不存在」与「不属于自己」回同一句文案（见 `device.server`），这里按文案转 404 */
const DEVICE_NOT_FOUND_MESSAGE = "设备不存在或已被删除";

const jsonError = (error: string, status: number): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** 校验失败回 400：zod 默认文案是英文，只挑出出错字段，不往外吐英文 */
const invalidParamMessage = (error: ZodError): string => {
  const field = error.issues[0]?.path.join(".");
  return field ? `参数 ${field} 不合法` : "请求参数不合法";
};

export const Route = createFileRoute("/api/v1/devices/revoke")({
  server: {
    middleware: [bearerAuthRouteGuard],
    handlers: {
      POST: async ({ request, context }) => {
        const body: unknown = await request.json().catch(() => undefined);
        const parsed = deviceRevokeSchema.safeParse(body);
        if (!parsed.success) return jsonError(invalidParamMessage(parsed.error), 400);

        const { user, username } = context;
        try {
          const device = await revokeDevice({ id: parsed.data.id, owner: user });

          logCrud(
            { id: user.id, username },
            "device",
            "revoke",
            { id: device.id, name: device.name },
            { operatorType: user.type },
          );
          logger.debug({ deviceId: device.id, ownerId: user.id }, "外部客户端吊销设备");

          return Response.json({ device });
        } catch (err) {
          if (err instanceof Error && err.message === DEVICE_NOT_FOUND_MESSAGE) {
            return jsonError(DEVICE_NOT_FOUND_MESSAGE, 404);
          }
          throw err;
        }
      },
    },
  },
});
