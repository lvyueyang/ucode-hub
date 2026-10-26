/**
 * JWT 模块测试：签发、校验、密钥缺失 fail-fast
 */
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

  it("被篡改的 token 校验返回 null", async () => {
    const jwt = createJwt({ secret, logger: mockLogger });
    const token = await jwt.signToken(payload);

    const tampered = `${token.slice(0, -3)}abc`;
    expect(await jwt.verifyToken(tampered)).toBeNull();
  });
});
