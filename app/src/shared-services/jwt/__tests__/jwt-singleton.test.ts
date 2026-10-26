/**
 * JWT 签发与校验测试：验证应用级 jwt 单例与 COOKIE_NAMES 约定
 */

import { describe, expect, it, vi } from "vitest";
import { COOKIE_NAMES } from "#/constants/cookie-names";

// hoisted 在 import 前设置 env，保证 jwt 单例创建时密钥就绪
vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-at-least-32-characters-long!!";
  process.env.DATABASE_URL = "postgres://localhost/test";
});

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { jwt } from "#/shared-services/jwt";

describe("jwt.signToken / jwt.verifyToken", () => {
  it("签发后可用 verifyToken 校验并获取 payload", async () => {
    const payload = {
      userId: "user-1",
      username: "test-admin",
      userType: "admin" as const,
    };
    const token = await jwt.signToken(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT 三段式

    const verified = await jwt.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe(payload.userId);
    expect(verified!.username).toBe(payload.username);
    expect(verified!.userType).toBe(payload.userType);
  });

  it("签发的 token 包含 client 类型用户", async () => {
    const payload = {
      userId: "user-2",
      username: "test-client",
      userType: "client" as const,
    };
    const token = await jwt.signToken(payload);
    const verified = await jwt.verifyToken(token);
    expect(verified!.userType).toBe("client");
  });

  it("verifyToken 校验无效 token 返回 null", async () => {
    const result = await jwt.verifyToken("invalid-token-string");
    expect(result).toBeNull();
  });

  it("verifyToken 校验空字符串返回 null", async () => {
    const result = await jwt.verifyToken("");
    expect(result).toBeNull();
  });

  it("verifyToken 校验被篡改的 token 返回 null", async () => {
    const token = await jwt.signToken({
      userId: "user-1",
      username: "test",
      userType: "admin" as const,
    });
    const parts = token.split(".");
    parts[1] = "tamperedPayload";
    const tampered = parts.join(".");
    const result = await jwt.verifyToken(tampered);
    expect(result).toBeNull();
  });
});

describe("COOKIE_NAMES", () => {
  it("用中继自己的名字（交付换域名时集中改这一处）", () => {
    expect(COOKIE_NAMES.ADMIN_TOKEN).toBe("hub_admin_token");
    expect(COOKIE_NAMES.CLIENT_TOKEN).toBe("hub_client_token");
  });
});
