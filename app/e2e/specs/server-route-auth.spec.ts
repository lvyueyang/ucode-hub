/**
 * Server Route 鉴权守卫 e2e：未登录访问受保护路由应返回 401 JSON，而非框架默认 500
 * 覆盖 adminPermRouteGuard「鉴权与 try/catch 同层」的行为——若退回组合中间件写法，状态码会退化为 500
 */

import { expect, test } from "../fixtures";

/** 受管理端权限守卫保护的 Server Route（POST 项以空体请求，鉴权在解析请求体之前执行） */
const guardedRoutes: { path: string; method: "get" | "post" }[] = [
  { path: "/admin/logs/download/test-log-id", method: "get" },
  { path: "/admin/file-explorer/download/any.txt", method: "get" },
];

test.describe("Server Route 鉴权失败返回状态码", () => {
  for (const { path, method } of guardedRoutes) {
    test(`未登录 ${method.toUpperCase()} ${path} 返回 401 JSON`, async ({ request }) => {
      const res = await request[method](path, { failOnStatusCode: false });

      expect(res.status()).toBe(401);
      expect(res.headers()["content-type"]).toContain("application/json");
      const body = (await res.json()) as { error?: unknown };
      expect(typeof body.error).toBe("string");
    });
  }
});
