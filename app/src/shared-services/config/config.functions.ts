/**
 * 系统配置 Server Functions：客户端可见配置（跨端共享，无单一页面归属）
 */

import { createServerFn } from "@tanstack/react-start";
import { getConfigTranslations, getVisibleConfigRows } from "./config.server";

/** 获取客户端可见的系统配置（按当前 locale 解析值，无权限守卫） */
export const getVisibleConfigsSFn = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const locale = context.locale;
    const rows = await getVisibleConfigRows();
    const translations = await getConfigTranslations(locale);
    const config: Record<string, string> = {};
    for (const c of rows) config[c.key] = translations[c.id] ?? c.value;
    return config;
  },
);
