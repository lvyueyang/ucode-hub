/**
 * 客户端认证 Server Function 包装器：获取当前用户、退出登录
 */

import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { jwt } from "#/shared-services/jwt";
import { logger } from "#/shared-services/logger";
import { bumpClientTokenVersion, getCurrentClient } from "./client-auth.server";

/**
 * 获取当前客户端登录用户信息
 * 从请求 Cookie 中读取 CLIENT_TOKEN，解析 JWT 后查数据库（带内存缓存）返回用户信息
 * 返回 null 表示未登录或 token 无效
 */
export const getCurrentClientSFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(COOKIE_NAMES.CLIENT_TOKEN);
  return getCurrentClient(token);
});

/**
 * 客户端退出登录：清除 CLIENT_TOKEN Cookie，并自增令牌版本
 * 副作用即本次改造的目的：登出不再只作废当前浏览器，该账号在其它浏览器 / 设备上的会话一并失效
 */
export const clientLogoutSFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(COOKIE_NAMES.CLIENT_TOKEN);
  // 令牌缺失或解析失败只删 Cookie：登出不能因脏 Cookie 抛错，把用户卡在登录态里
  const payload = token ? await jwt.verifyToken(token) : null;
  if (payload?.userType === "client") {
    try {
      await bumpClientTokenVersion(payload.userId);
    } catch (error) {
      // 作废旧令牌失败不该把人卡在登录态：Cookie 照删，旧令牌最迟 24 小时内自然过期
      logger.warn({ error: (error as Error).message }, "登出时自增令牌版本失败");
    }
  }
  deleteCookie(COOKIE_NAMES.CLIENT_TOKEN, { path: "/" });
  return { success: true };
});
