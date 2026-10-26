/**
 * 客户端认证 Server Function 包装器：获取当前用户、退出登录
 */

import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { getCurrentClient } from "./client-auth.server";

/**
 * 获取当前客户端登录用户信息
 * 从请求 Cookie 中读取 CLIENT_TOKEN，解析 JWT 后查数据库（带内存缓存）返回用户信息
 * 返回 null 表示未登录或 token 无效
 */
export const getCurrentClientSFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(COOKIE_NAMES.CLIENT_TOKEN);
  return getCurrentClient(token);
});

/** 客户端退出登录：清除 CLIENT_TOKEN Cookie */
export const clientLogoutSFn = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(COOKIE_NAMES.CLIENT_TOKEN, { path: "/" });
  return { success: true };
});
