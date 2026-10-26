/**
 * 管理端认证模块 Server Function 包装器
 * getCurrentAdminSFn / logoutSFn 被 _admin 布局、AdminAuthProvider、AdminLayout、forgot-password 多组件共享
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { getCurrentAdmin } from "./admin-auth.server";

/** 获取当前登录管理员信息（从请求 Cookie 解析 JWT） */
export const getCurrentAdminSFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(COOKIE_NAMES.ADMIN_TOKEN);
  return getCurrentAdmin(token);
});

/** 退出登录：清除管理端认证 Cookie */
export const logoutSFn = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(COOKIE_NAMES.ADMIN_TOKEN, { path: "/" });
  return { success: true };
});
