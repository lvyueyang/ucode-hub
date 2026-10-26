/**
 * 外部客户端登录接口测试：参数校验、按 IP / 用户名限流、管理端与客户端账号的识别顺序
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdminLogin, mockClientLogin, mockGetRequestIP } = vi.hoisted(() => ({
  mockAdminLogin: vi.fn(),
  mockClientLogin: vi.fn(),
  mockGetRequestIP: vi.fn(),
}));

vi.mock("#/services/admin-auth/admin-auth.server", () => ({ adminLogin: mockAdminLogin }));
vi.mock("#/services/client-auth/client-auth.server", () => ({ clientLogin: mockClientLogin }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestIP: mockGetRequestIP }));
vi.mock("#/shared-services/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Route } from "#/routes/api/v1/auth/login";
import { isRateLimited, LOGIN_RATE_LIMIT, resetRateLimit } from "#/services/rate-limit/rate-limit";

/** 路由对象在测试里直接调用 handler：reason 需要的上下文由测试提供 */
type LoginHandler = (ctx: { request: Request }) => Promise<Response>;

const loginHandler = (
  Route as unknown as { options: { server: { handlers: Record<string, LoginHandler> } } }
).options.server.handlers.POST;

/** 构造带 exp 的令牌（路由只解出 exp 算过期时间，不校验签名） */
const fakeToken = (exp: number): string =>
  `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;

const post = (body: unknown): Request =>
  new Request("http://localhost/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });

/** 把某个 key 的额度用尽（走真实限流模块，不预置内部状态） */
const exhaust = (key: string): void => {
  for (let i = 0; i < LOGIN_RATE_LIMIT.max; i += 1) isRateLimited(key, LOGIN_RATE_LIMIT);
};

describe("POST /api/v1/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimit();
    mockGetRequestIP.mockReturnValue("203.0.113.7");
    mockAdminLogin.mockResolvedValue({ success: false, message: "用户名或密码错误" });
    mockClientLogin.mockResolvedValue({ success: false, message: "用户名或密码错误" });
  });

  it("入参不合法回 400，不进行密码校验", async () => {
    const response = await loginHandler({ request: post({ username: "", password: "" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "参数 username 不合法" });
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });

  it("请求体不是 JSON 时回 400", async () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: "not-json",
    });
    const response = await loginHandler({ request });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求参数不合法" });
  });

  it("两个账号表都认不出回 401", async () => {
    const response = await loginHandler({ request: post({ username: "nobody", password: "x" }) });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "未认证或凭证无效" });
    expect(mockClientLogin).toHaveBeenCalledWith("nobody", "x");
  });

  it("管理端账号登录成功：先查管理端，返回管理端身份", async () => {
    mockAdminLogin.mockResolvedValue({
      success: true,
      message: undefined,
      user: { id: "admin-1", username: "alice", email: "alice@example.com" },
      token: fakeToken(4_102_444_800),
    });

    const response = await loginHandler({
      request: post({ username: "alice", password: "secret" }),
    });
    const body = (await response.json()) as {
      token: string;
      expiresAt: string;
      user: { id: string; username: string; type: string };
    };

    expect(response.status).toBe(200);
    expect(body.token).toBe(fakeToken(4_102_444_800));
    expect(body.expiresAt).toBe(new Date(4_102_444_800 * 1000).toISOString());
    expect(body.user).toEqual({ id: "admin-1", username: "alice", type: "admin" });
    expect(mockClientLogin).not.toHaveBeenCalled();
  });

  it("客户端账号登录成功：管理端落空后查客户端", async () => {
    mockClientLogin.mockResolvedValue({
      success: true,
      message: undefined,
      user: { id: "client-9", username: "bob", email: "bob@example.com" },
      token: fakeToken(4_102_444_800),
    });

    const response = await loginHandler({ request: post({ username: "bob", password: "secret" }) });
    const body = (await response.json()) as { user: { id: string; type: string } };

    expect(response.status).toBe(200);
    expect(body.user).toEqual({ id: "client-9", username: "bob", type: "client" });
    expect(mockAdminLogin.mock.invocationCallOrder[0]).toBeLessThan(
      mockClientLogin.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("同一 IP 额度用尽回 429，不再做密码校验", async () => {
    exhaust("login:ip:203.0.113.7");

    const response = await loginHandler({ request: post({ username: "alice", password: "x" }) });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "操作过于频繁，请稍后再试" });
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });

  it("同一用户名额度用尽回 429（换 IP 也拦）", async () => {
    exhaust("login:user:alice");
    mockGetRequestIP.mockReturnValue("198.51.100.9");

    const response = await loginHandler({ request: post({ username: "alice", password: "x" }) });

    expect(response.status).toBe(429);
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });

  it("取不到 IP 时按 unknown 归并计数", async () => {
    mockGetRequestIP.mockReturnValue(undefined);
    exhaust("login:ip:unknown");

    const response = await loginHandler({ request: post({ username: "alice", password: "x" }) });

    expect(response.status).toBe(429);
  });
});
