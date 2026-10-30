/**
 * JWT 模块测试：签发、校验、密钥缺失 fail-fast
 */
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../logger";
import { createJwt } from "../index";

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
} as unknown as Logger;

describe("createJwt", () => {
  const secret = "test-secret-at-least-32-chars-for-hs256!!";
  const payload = {
    userId: "u-1",
    username: "admin",
    userType: "admin",
    // 令牌版本：与用户表的 token_version 比对，改密 / 登出后自增即作废旧令牌
    v: 0,
  } as const;

  beforeEach(() => vi.clearAllMocks());

  it("签发并校验 token 往返一致", async () => {
    const jwt = createJwt({ secret, logger: mockLogger });

    const token = await jwt.signToken(payload);
    const verified = await jwt.verifyToken(token);

    expect(verified).toMatchObject(payload);
  });

  it("secret 为空时签发抛错（fail-fast）", async () => {
    const jwt = createJwt({ secret: "", logger: mockLogger });

    await expect(jwt.signToken(payload)).rejects.toThrow("JWT_SECRET 未配置");
  });

  it("无效 token 校验返回 null 并记录日志", async () => {
    const jwt = createJwt({ secret, logger: mockLogger });

    const result = await jwt.verifyToken("invalid-token");

    expect(result).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it("载荷缺 v 时校验返回 null（令牌版本为必填）", async () => {
    const jwt = createJwt({ secret, logger: mockLogger });
    // 手工签发一份签名有效、但不带令牌版本的 token，模拟旧格式 / 伪造载荷
    const token = await new SignJWT({ userId: "u-1", username: "admin", userType: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(secret));

    expect(await jwt.verifyToken(token)).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it("被篡改的 token 校验返回 null", async () => {
    const jwt = createJwt({ secret, logger: mockLogger });
    const token = await jwt.signToken(payload);

    const tampered = `${token.slice(0, -3)}abc`;
    expect(await jwt.verifyToken(tampered)).toBeNull();
  });
});
