/**
 * Cookie Secure 标志决策：取值与判定规则在 #/env（生产环境默认启用，COOKIE_SECURE 显式覆盖）
 * 线上未启用 HTTPS（http:// 直连或反代）时须设 COOKIE_SECURE=false，
 * 否则浏览器不保存带 Secure 标志的 Cookie，登录成功后 token 立即丢失、反复跳回登录页
 */
import { env } from "#/env";

/** 计算认证 Cookie 是否携带 Secure 标志 */
export function isCookieSecure(): boolean {
  return env.cookieSecure;
}
