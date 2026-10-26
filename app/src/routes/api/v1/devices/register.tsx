/** 外部客户端登记本机为设备：返回设备信息与一次性令牌 */
import { createFileRoute } from "@tanstack/react-router";
import type { ZodError } from "zod";
import { bearerAuthRouteGuard } from "#/middleware/bearer-auth";
import { deviceRegisterSchema } from "#/services/device/device.schemas";
import { registerDevice } from "#/services/device/device.server";
import { DEVICE_REGISTER_RATE_LIMIT, isRateLimited } from "#/services/rate-limit/rate-limit";
import { logger } from "#/shared-services/logger";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

const RATE_LIMITED_MESSAGE = "操作过于频繁，请稍后再试";

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

export const Route = createFileRoute("/api/v1/devices/register")({
  server: {
    middleware: [bearerAuthRouteGuard],
    handlers: {
      POST: async ({ request, context }) => {
        const body: unknown = await request.json().catch(() => undefined);
        const parsed = deviceRegisterSchema.safeParse(body);
        if (!parsed.success) return jsonError(invalidParamMessage(parsed.error), 400);

        const { user, username } = context;
        if (isRateLimited(`device:register:${user.id}`, DEVICE_REGISTER_RATE_LIMIT)) {
          return jsonError(RATE_LIMITED_MESSAGE, 429);
        }

        // 同一用户名下同名设备视为同一台，重复登记即轮换令牌（明文只在本响应里回一次）
        const registered = await registerDevice({ owner: user, ...parsed.data });

        logCrud(
          { id: user.id, username },
          "device",
          "register",
          { id: registered.device.id, name: registered.device.name },
          { operatorType: user.type, detail: { platform: registered.device.platform } },
        );
        logger.debug({ deviceId: registered.device.id, ownerId: user.id }, "外部客户端登记设备");

        return Response.json(registered);
      },
    },
  },
});
