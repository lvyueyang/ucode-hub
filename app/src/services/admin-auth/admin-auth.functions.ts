/**
 * 管理端认证模块 Server Function 包装器
 * getCurrentAdminSFn / logoutSFn 被 _admin 布局、AdminAuthProvider、AdminLayout、forgot-password 多组件共享
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { jwt } from "#/shared-services/jwt";
import { logger } from "#/shared-services/logger";
import { bumpAdminTokenVersion, getCurrentAdmin } from "./admin-auth.server";

/** 获取当前登录管理员信息（从请求 Cookie 解析 JWT） */
export const getCurrentAdminSFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(COOKIE_NAMES.ADMIN_TOKEN);
  return getCurrentAdmin(token);
});

/**
 * 退出登录：清除管理端认证 Cookie，并自增令牌版本
 * 副作用即本次改造的目的：登出不再只作废当前浏览器，该账号在其它浏览器 / 设备上的会话一并失效
 */
export const logoutSFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(COOKIE_NAMES.ADMIN_TOKEN);
  // 令牌缺失或解析失败只删 Cookie：登出不能因脏 Cookie 抛错，把用户卡在登录态里
  const payload = token ? await jwt.verifyToken(token) : null;
  if (payload?.userType === "admin") {
    try {
      await bumpAdminTokenVersion(payload.userId);
    } catch (error) {
      // 作废旧令牌失败不该把人卡在登录态：Cookie 照删，旧令牌最迟 24 小时内自然过期
      logger.warn({ error: (error as Error).message }, "登出时自增令牌版本失败");
    }
  }
  deleteCookie(COOKIE_NAMES.ADMIN_TOKEN, { path: "/" });
  return { success: true };
});
