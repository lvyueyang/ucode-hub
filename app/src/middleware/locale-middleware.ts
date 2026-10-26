/**
 * 语言检测中间件：在每次请求时从 Cookie 解析 locale，
 * 注入 context.locale 供下游 SFn / 路由 serverContext 使用
 */

import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  SUPPORTED_LOCALES,
} from "#/shared-services/i18n/i18n.types";

/**
 * 全局语言中间件：解析 locale 并注入 context（locale 默认值的唯一权威来源）
 * 注册在 start.ts requestMiddleware 中，在每个请求的最早阶段执行
 * 非法 Cookie 值回退到 DEFAULT_LOCALE，避免把无效语言传入下游
 */
export const localeMiddleware = createMiddleware().server(async ({ next }) => {
  const cookieLocale = getCookie(LOCALE_COOKIE);
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : DEFAULT_LOCALE;
  return next({ context: { locale } });
});
