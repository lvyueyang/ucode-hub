/**
 * 外部客户端设备接口测试：参数校验、按用户限流、审计落库与响应映射
 * 鉴权本身由 `middleware/__tests__/bearer-auth.test.ts` 覆盖，这里直接给 handler 已认证上下文
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRegisterDevice, mockListDevicesForOwner, mockRevokeDevice, mockLogCrud } = vi.hoisted(
  () => ({
    mockRegisterDevice: vi.fn(),
    mockListDevicesForOwner: vi.fn(),
    mockRevokeDevice: vi.fn(),
    mockLogCrud: vi.fn(),
  }),
);

vi.mock("#/middleware/bearer-auth", () => ({ bearerAuthRouteGuard: {} }));
vi.mock("#/services/device/device.server", () => ({
  registerDevice: mockRegisterDevice,
  listDevicesForOwner: mockListDevicesForOwner,
  revokeDevice: mockRevokeDevice,
}));
vi.mock("#/shared-services/operation-log/operation-log.server", () => ({ logCrud: mockLogCrud }));
vi.mock("#/shared-services/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Route as ListRoute } from "#/routes/api/v1/devices/list";
import { Route as RegisterRoute } from "#/routes/api/v1/devices/register";
import { Route as RevokeRoute } from "#/routes/api/v1/devices/revoke";
import type { DeviceListItem } from "#/services/device/device.server";
import {
  DEVICE_REGISTER_RATE_LIMIT,
  isRateLimited,
  resetRateLimit,
} from "#/services/rate-limit/rate-limit";
import type { UserRef } from "#/types/user";

type Handler = (ctx: {
  request?: Request;
  context?: { user: UserRef; username: string; email: string | null };
}) => Promise<Response>;

const handlersOf = (route: unknown): Record<string, Handler> =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers;

const CONTEXT = {
  user: { type: "client", id: "client-1" } as UserRef,
  username: "bob",
  email: "bob@example.com",
};

const DEVICE: DeviceListItem = {
  id: "device-1",
  name: "办公室 Mac",
  platform: "darwin",
  clientVersion: "0.1.0",
  status: "active",
  online: false,
  lastSeenAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  ownerType: "client",
  ownerId: "client-1",
  ownerName: "bob",
};

const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });

describe("POST /api/v1/devices/register", () => {
  const register = handlersOf(RegisterRoute).POST;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimit();
    mockRegisterDevice.mockResolvedValue({ device: DEVICE, token: "plain-device-token" });
  });

  it("入参不合法回 400", async () => {
    const response = await register({
      request: post("/api/v1/devices/register", { name: "" }),
      context: CONTEXT,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "参数 name 不合法" });
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it("登记成功：返回设备与一次性令牌，并按登录身份写审计", async () => {
    const response = await register({
      request: post("/api/v1/devices/register", {
        name: "办公室 Mac",
        platform: "darwin",
        clientVersion: "0.1.0",
      }),
      context: CONTEXT,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ device: DEVICE, token: "plain-device-token" });
    expect(mockRegisterDevice).toHaveBeenCalledWith({
      owner: CONTEXT.user,
      name: "办公室 Mac",
      platform: "darwin",
      clientVersion: "0.1.0",
    });
    expect(mockLogCrud).toHaveBeenCalledWith(
      { id: "client-1", username: "bob" },
      "device",
      "register",
      { id: "device-1", name: "办公室 Mac" },
      { operatorType: "client", detail: { platform: "darwin" } },
    );
  });

  it("同一用户额度用尽回 429，不再登记", async () => {
    for (let i = 0; i < DEVICE_REGISTER_RATE_LIMIT.max; i += 1) {
      isRateLimited("device:register:client-1", DEVICE_REGISTER_RATE_LIMIT);
    }

    const response = await register({
      request: post("/api/v1/devices/register", { name: "办公室 Mac" }),
      context: CONTEXT,
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "操作过于频繁，请稍后再试" });
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/devices/list", () => {
  const list = handlersOf(ListRoute).GET;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListDevicesForOwner.mockResolvedValue([DEVICE]);
  });

  it("只查当前令牌名下的设备", async () => {
    const response = await list({ context: CONTEXT });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ devices: [DEVICE] });
    expect(mockListDevicesForOwner).toHaveBeenCalledWith(CONTEXT.user);
  });
});

describe("POST /api/v1/devices/revoke", () => {
  const revoke = handlersOf(RevokeRoute).POST;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRevokeDevice.mockResolvedValue({
      ...DEVICE,
      status: "revoked",
      revokedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("入参不合法回 400", async () => {
    const response = await revoke({
      request: post("/api/v1/devices/revoke", {}),
      context: CONTEXT,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "参数 id 不合法" });
    expect(mockRevokeDevice).not.toHaveBeenCalled();
  });

  it("吊销成功：带 owner 限定，返回设备并写审计", async () => {
    const response = await revoke({
      request: post("/api/v1/devices/revoke", { id: "device-1" }),
      context: CONTEXT,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ device: { id: "device-1", status: "revoked" } });
    expect(mockRevokeDevice).toHaveBeenCalledWith({ id: "device-1", owner: CONTEXT.user });
    expect(mockLogCrud).toHaveBeenCalledWith(
      { id: "client-1", username: "bob" },
      "device",
      "revoke",
      { id: "device-1", name: "办公室 Mac" },
      { operatorType: "client" },
    );
  });

  it("设备不存在或不属于自己回 404（同一句文案）", async () => {
    mockRevokeDevice.mockRejectedValue(new Error("设备不存在或已被删除"));

    const response = await revoke({
      request: post("/api/v1/devices/revoke", { id: "other-device" }),
      context: CONTEXT,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "设备不存在或已被删除" });
    expect(mockLogCrud).not.toHaveBeenCalled();
  });

  it("其他异常照抛，不伪装成 404", async () => {
    mockRevokeDevice.mockRejectedValue(new Error("设备吊销失败"));

    await expect(
      revoke({ request: post("/api/v1/devices/revoke", { id: "device-1" }), context: CONTEXT }),
    ).rejects.toThrow("设备吊销失败");
  });
});
