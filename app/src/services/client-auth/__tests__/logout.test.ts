/**
 * clientLogoutSFn 测试：登出时按令牌解出用户并自增令牌版本，解析失败只清 Cookie
 *
 * createServerFn 在测试里被替换为「原样返回 handler」，因此导入的 clientLogoutSFn 就是处理器本身
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCookie, mockDeleteCookie, mockVerifyToken, mockBumpClientTokenVersion } = vi.hoisted(
  () => ({
    mockGetCookie: vi.fn(),
    mockDeleteCookie: vi.fn(),
    mockVerifyToken: vi.fn(),
    mockBumpClientTokenVersion: vi.fn(),
  }),
);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: mockGetCookie,
  deleteCookie: mockDeleteCookie,
}));

vi.mock("#/shared-services/jwt", () => ({
  jwt: { verifyToken: mockVerifyToken },
}));

vi.mock("#/services/client-auth/client-auth.server", () => ({
  getCurrentClient: vi.fn(),
  bumpClientTokenVersion: mockBumpClientTokenVersion,
}));

import { COOKIE_NAMES } from "#/constants/cookie-names";
import { clientLogoutSFn } from "#/services/client-auth/client-auth.functions";

/** createServerFn 被 mock 后 clientLogoutSFn 就是处理器本身，类型上仍带 SFn 外形，测试里按无参调用 */
const logout = clientLogoutSFn as unknown as () => Promise<{ success: boolean }>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clientLogoutSFn", () => {
  it("有效客户端令牌：自增令牌版本并清除 Cookie", async () => {
    mockGetCookie.mockReturnValue("valid-token");
    mockVerifyToken.mockResolvedValue({
      userId: "client-1",
      username: "client",
      userType: "client",
      v: 0,
    });

    await expect(logout()).resolves.toEqual({ success: true });
    expect(mockBumpClientTokenVersion).toHaveBeenCalledWith("client-1");
    expect(mockDeleteCookie).toHaveBeenCalledWith(COOKIE_NAMES.CLIENT_TOKEN, { path: "/" });
  });

  it("令牌校验失败：不触碰令牌版本，仍清除 Cookie", async () => {
    mockGetCookie.mockReturnValue("broken-token");
    mockVerifyToken.mockResolvedValue(null);

    await expect(logout()).resolves.toEqual({ success: true });
    expect(mockBumpClientTokenVersion).not.toHaveBeenCalled();
    expect(mockDeleteCookie).toHaveBeenCalledWith(COOKIE_NAMES.CLIENT_TOKEN, { path: "/" });
  });

  it("没有 Cookie：不校验令牌，仍清除 Cookie", async () => {
    mockGetCookie.mockReturnValue(undefined);

    await expect(logout()).resolves.toEqual({ success: true });
    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockBumpClientTokenVersion).not.toHaveBeenCalled();
    expect(mockDeleteCookie).toHaveBeenCalledWith(COOKIE_NAMES.CLIENT_TOKEN, { path: "/" });
  });

  it("Cookie 里是管理端令牌：按身份不匹配处理，不自增客户端令牌版本", async () => {
    mockGetCookie.mockReturnValue("admin-token");
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
      v: 0,
    });

    await expect(logout()).resolves.toEqual({ success: true });
    expect(mockBumpClientTokenVersion).not.toHaveBeenCalled();
    expect(mockDeleteCookie).toHaveBeenCalledWith(COOKIE_NAMES.CLIENT_TOKEN, { path: "/" });
  });
});
