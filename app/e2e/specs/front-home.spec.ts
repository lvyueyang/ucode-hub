/**
 * 前台首页 e2e：SSR 输出、Hero 区与 Header 布局
 */

import { expect, goto, test } from "../fixtures";

test.describe("前台首页", () => {
  test("SSR 首屏输出包含站点主标题", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("UCode 中继服务");
  });

  test("Hero 区标题与副标题可见", async ({ page }) => {
    await goto(page, "/");
    await expect(page.getByRole("heading", { name: "UCode 中继服务" })).toBeVisible();
    await expect(page.getByText("登录后可远程访问本机 UCode")).toBeVisible();
  });

  test("Header 渲染站点名、导航与语言切换", async ({ page }) => {
    await goto(page, "/");
    const header = page.getByTestId("site-header");
    await expect(header.getByText("HUB")).toBeVisible();
    const nav = header.locator("nav");
    await expect(nav).toContainText("首页");
    await expect(nav).toContainText("我的设备");
    await expect(nav).toContainText("关于");
    await expect(header.getByRole("button", { name: "EN" })).toBeVisible();
  });

  test("未登录状态 Header 显示登录入口", async ({ page }) => {
    await goto(page, "/");
    await expect(page.getByTestId("site-header").getByRole("link", { name: "登录" })).toBeVisible();
  });
});
