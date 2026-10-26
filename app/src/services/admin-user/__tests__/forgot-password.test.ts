/**
 * 管理员自助重置密码（忘记密码流程）核心逻辑测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockRows,
  mockUpdateRows,
  mockBcrypt,
  mockVerifyCaptcha,
  mockClearAdminUserCache,
  mockLogger,
  mockLogOperation,
} = vi.hoisted(() => {
  const rows = vi.fn().mockResolvedValue([]);
  const updateRows = vi.fn().mockResolvedValue([{ id: "a-1" }]);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
  };
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: (value: unknown) => unknown) => rows().then(onFulfilled),
  });
  return {
    mockDb: {
      select: vi.fn(() => chain),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(() => updateRows()) })),
        })),
      })),
    },
    mockRows: rows,
    mockUpdateRows: updateRows,
    mockBcrypt: { hash: vi.fn() },
    mockVerifyCaptcha: vi.fn(),
    mockClearAdminUserCache: vi.fn(),
    mockLogger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    mockLogOperation: vi.fn(),
  };
});

vi.mock("#/db/index", () => ({ db: mockDb }));
vi.mock("bcryptjs", () => ({ default: mockBcrypt }));
vi.mock("#/services/captcha/captcha.server", () => ({
  verifyCaptcha: mockVerifyCaptcha,
}));
vi.mock("#/services/admin-auth/admin-auth.server", () => ({
  clearAdminUserCache: mockClearAdminUserCache,
}));
vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));
vi.mock("#/shared-services/operation-log/operation-log.server", () => ({
  logOperation: mockLogOperation,
}));

import { resetAdminPasswordByEmail } from "../admin-user.server";

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateRows.mockResolvedValue([{ id: "a-1" }]);
});

describe("resetAdminPasswordByEmail", () => {
  it("验证码错误返回失败", async () => {
    mockVerifyCaptcha.mockResolvedValue(false);

    const result = await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(result.success).toBe(false);
    expect(result.message).toBe("验证码错误或已过期");
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("管理员不存在返回失败", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([]);

    const result = await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(result.success).toBe(false);
    expect(result.message).toBe("该邮箱未注册管理员账号");
  });

  it("管理员已删除返回失败", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([
      {
        id: "a-1",
        email: "admin@t.com",
        status: "active",
        deletedAt: new Date(),
      },
    ]);

    const result = await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(result.success).toBe(false);
    expect(result.message).toBe("该邮箱未注册管理员账号");
  });

  it("管理员已禁用返回失败", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([
      {
        id: "a-1",
        email: "admin@t.com",
        status: "disabled",
      },
    ]);

    const result = await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(result.success).toBe(false);
    expect(result.message).toBe("该账号已被禁用，请联系超级管理员");
  });

  it("正常重置密码成功", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([
      {
        id: "a-1",
        email: "admin@t.com",
        status: "active",
      },
    ]);
    mockBcrypt.hash.mockResolvedValue("hashed_pwd");

    const result = await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(result.success).toBe(true);
    expect(result.message).toBe("密码重置成功，请使用新密码登录");
    expect(mockDb.update).toHaveBeenCalled();
    // 密码重置补审计
    expect(mockLogOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reset_password",
        module: "admin-auth",
        targetId: "a-1",
      }),
    );
  });

  it("bcrypt.hash 使用正确 rounds=12", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([
      {
        id: "a-1",
        email: "admin@t.com",
        status: "active",
      },
    ]);
    mockBcrypt.hash.mockResolvedValue("hashed_pwd");

    await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(mockBcrypt.hash).toHaveBeenCalledWith("newpass", 12);
  });

  it("update 无记录（用户被删除）返回失败", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([
      {
        id: "a-1",
        email: "admin@t.com",
        status: "active",
      },
    ]);
    mockBcrypt.hash.mockResolvedValue("hashed_pwd");
    mockUpdateRows.mockResolvedValue([]);

    const result = await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(result.success).toBe(false);
    expect(result.message).toBe("该邮箱未注册管理员账号");
    expect(mockClearAdminUserCache).not.toHaveBeenCalled();
  });

  it("成功时清除管理员缓存", async () => {
    mockVerifyCaptcha.mockResolvedValue(true);
    mockRows.mockResolvedValue([
      {
        id: "a-1",
        email: "admin@t.com",
        status: "active",
      },
    ]);
    mockBcrypt.hash.mockResolvedValue("hashed_pwd");

    await resetAdminPasswordByEmail("admin@t.com", "123456", "newpass");

    expect(mockClearAdminUserCache).toHaveBeenCalledWith("a-1");
  });
});
