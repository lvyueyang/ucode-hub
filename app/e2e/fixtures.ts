/**
 * e2e 自定义 fixtures：前台/后台登录态页面与唯一命名工具
 */

import { test as base, expect, type Page } from "@playwright/test";
import { CLIENT_USER, ROOT_ADMIN } from "./helpers/db";

export { expect };

/**
 * 隐藏 dev 期 TanStack Devtools 的悬浮徽标。
 * 徽标 `position: fixed` 固定在右下角、z-index 99999，会盖住 Drawer 底部的主按钮
 * （如「保存」）导致点击被 Playwright 判为 pointer events 被拦截；其类名由 CSS Module
 * 生成（形如 `go350417626`）不稳定，故按内部图标的结构特征定位。
 */
const HIDE_DEVTOOLS_CSS = `button:has(img[alt="TanStack Devtools"]) { display: none !important; }`;

/** 生成带时间戳后缀的唯一标识，避免并行/重复运行数据冲突 */
export function uniqueName(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** 跳转页面并等待客户端水合完成（SSR 页需等 React 挂载后再交互） */
export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** 前台客户端用户登录（/login） */
export async function clientLogin(page: Page): Promise<void> {
  await goto(page, "/login");
  await page.locator('input[name="username"]').fill(CLIENT_USER.username);
  await page.locator('input[name="password"]').fill(CLIENT_USER.password);
  await page.locator("form button[type='submit']").click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** 后台 root 管理员登录（/admin/login） */
export async function adminLogin(page: Page): Promise<void> {
  await goto(page, "/admin/login");
  await page.getByPlaceholder("用户名").fill(ROOT_ADMIN.username);
  await page.getByPlaceholder("密码").fill(ROOT_ADMIN.password);
  await page.locator("form button[type='submit']").click();
  await page.waitForURL(/\/admin$/);
}

/**
 * 扩展 test 对象：
 * - adminPage：已用 root 登录的后台页面
 * - clientPage：已用客户端账号登录的前台页面
 * - hideDevtools（auto）：每个用例自动隐藏 devtools 悬浮徽标，避免遮挡页面右下角控件
 */
export const test = base.extend<{
  adminPage: Page;
  clientPage: Page;
  hideDevtools: undefined;
}>({
  hideDevtools: [
    async ({ page }, use) => {
      // 注入到 head：SPA 内部跳转不会重置，整条用例期间持续生效
      await page.addInitScript((css: string) => {
        const apply = () => {
          const style = document.createElement("style");
          style.textContent = css;
          document.head.append(style);
        };
        if (document.head) apply();
        else document.addEventListener("DOMContentLoaded", apply);
      }, HIDE_DEVTOOLS_CSS);
      await use(undefined);
    },
    { auto: true },
  ],
  adminPage: async ({ page }, use) => {
    await adminLogin(page);
    await use(page);
  },
  clientPage: async ({ page }, use) => {
    await clientLogin(page);
    await use(page);
  },
});
