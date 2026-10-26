/**
 * 模型端点鉴权测试：令牌形态分流、设备状态判定、账号存活校验
 * 依赖以替身注入，不连 DB 也不签真 JWT。
 */
import { describe, expect, it, vi } from "vitest";

import {
  type CallerAccount,
  type CallerDevice,
  isJwtShaped,
  type ModelEndpointAuthDeps,
  resolveModelEndpointCaller,
} from "../auth";

/** 构造鉴权依赖替身：默认「设备查不到、JWT 无效、账号不存在」 */
function createDeps(overrides: Partial<ModelEndpointAuthDeps> = {}): ModelEndpointAuthDeps {
  return {
    findDeviceByToken: vi.fn(async () => null),
    verifyJwt: vi.fn(async () => null),
    getAdminUserForAuth: vi.fn(async () => ({ success: false, reason: "not_found" }) as const),
    getClientUserForAuth: vi.fn(async () => ({ success: false, reason: "not_found" }) as const),
    ...overrides,
  };
}

const activeDevice: CallerDevice = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerType: "client",
  ownerId: "22222222-2222-2222-2222-222222222222",
  status: "active",
};

/** 有效 JWT（三段形态即可，签名由依赖替身决定） */
const jwtToken = "header.payload.signature";

describe("isJwtShaped", () => {
  it("恰有三段的令牌视为 JWT", () => {
    expect(isJwtShaped(jwtToken)).toBe(true);
  });

  it("设备令牌（base64url，无点）不是 JWT", () => {
    expect(isJwtShaped("AbCd-_1234")).toBe(false);
  });

  it("两段或四段都不按 JWT 处理", () => {
    expect(isJwtShaped("a.b")).toBe(false);
    expect(isJwtShaped("a.b.c.d")).toBe(false);
  });
});

describe("resolveModelEndpointCaller", () => {
  it("缺少 Authorization 时返回 null 且不查任何身份", async () => {
    const deps = createDeps();
    expect(await resolveModelEndpointCaller(null, deps)).toBeNull();
    expect(deps.findDeviceByToken).not.toHaveBeenCalled();
    expect(deps.verifyJwt).not.toHaveBeenCalled();
  });

  it("非 Bearer 方案不认", async () => {
    const deps = createDeps();
    expect(await resolveModelEndpointCaller("Basic abc", deps)).toBeNull();
    expect(deps.findDeviceByToken).not.toHaveBeenCalled();
  });

  it("设备令牌记设备属主，并带上设备 id", async () => {
    const deps = createDeps({ findDeviceByToken: vi.fn(async () => activeDevice) });
    const caller = await resolveModelEndpointCaller("Bearer device-token", deps);

    expect(caller).toEqual({
      accountType: "client",
      accountId: activeDevice.ownerId,
      deviceId: activeDevice.id,
      kind: "device",
    });
    expect(deps.verifyJwt).not.toHaveBeenCalled();
  });

  it("设备令牌不存在或已吊销都返回 null（不区分原因）", async () => {
    const missing = createDeps();
    expect(await resolveModelEndpointCaller("Bearer nope", missing)).toBeNull();

    const revoked = createDeps({
      findDeviceByToken: vi.fn(async () => ({ ...activeDevice, status: "revoked" })),
    });
    expect(await resolveModelEndpointCaller("Bearer revoked", revoked)).toBeNull();
  });

  it("JWT 形态的令牌不走设备查询，按用户身份解析", async () => {
    const found: CallerAccount = { success: true, id: "33333333-3333-3333-3333-333333333333" };
    const deps = createDeps({
      verifyJwt: vi.fn(async () => ({ userId: "self-claimed", userType: "admin" as const })),
      getAdminUserForAuth: vi.fn(async () => found),
    });

    const caller = await resolveModelEndpointCaller(`Bearer ${jwtToken}`, deps);

    // accountId 取服务层返回的权威 id，而不是令牌自述的 userId
    expect(caller).toEqual({
      accountType: "admin",
      accountId: found.id,
      deviceId: null,
      kind: "user",
    });
    expect(deps.findDeviceByToken).not.toHaveBeenCalled();
  });

  it("客户端用户解析走客户端用户表校验", async () => {
    const deps = createDeps({
      verifyJwt: vi.fn(async () => ({ userId: "u1", userType: "client" as const })),
      getClientUserForAuth: vi.fn(async () => ({ success: true, id: "u1" }) as const),
    });

    const caller = await resolveModelEndpointCaller(`Bearer ${jwtToken}`, deps);
    expect(caller?.accountType).toBe("client");
    expect(deps.getAdminUserForAuth).not.toHaveBeenCalled();
  });

  it("JWT 无效或账号已停用都返回 null", async () => {
    const invalid = createDeps();
    expect(await resolveModelEndpointCaller(`Bearer ${jwtToken}`, invalid)).toBeNull();

    const disabled = createDeps({
      verifyJwt: vi.fn(async () => ({ userId: "u1", userType: "admin" as const })),
      getAdminUserForAuth: vi.fn(async () => ({ success: false, reason: "disabled" }) as const),
    });
    expect(await resolveModelEndpointCaller(`Bearer ${jwtToken}`, disabled)).toBeNull();
  });
});
