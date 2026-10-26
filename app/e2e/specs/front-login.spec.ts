/**
 * 前台登录页 e2e：表单校验、错误凭据、成功登录与已登录重定向
 */

import { expect } from "@playwright/test";
import { goto, test } from "../fixtures";
import { CLIENT_USER } from "../helpers/db";

test.describe("前台登录", () => {
  test("字段失焦时显示校验错误", async ({ page }) => {
    await goto(page, "/login");
    const username = page.locator('input[name="username"]');
    await username.fill("x");
    await username.fill("");
    await username.blur();
    await expect(page.getByText("请输入用户名")).toBeVisible();

    const password = page.locator('input[name="password"]');
    await password.fill("x");
    await password.fill("");
    await password.blur();
    await expect(page.getByText("请输入密码")).toBeVisible();
  });

  test("错误凭据提示登录失败", async ({ page }) => {
    await goto(page, "/login");
    await page.locator('input[name="username"]').fill(CLIENT_USER.username);
    await page.locator('input[name="password"]').fill("wrong-password");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("用户名或密码错误")).toBeVisible();
  });

  test("正确凭据登录成功并跳转首页", async ({ page }) => {
    await goto(page, "/login");
    await page.locator('input[name="username"]').fill(CLIENT_USER.username);
    await page.locator('input[name="password"]').fill(CLIENT_USER.password);
    await page.locator("form button[type='submit']").click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("site-header")).toContainText(CLIENT_USER.username);
  });

  test("已登录访问登录页重定向首页", async ({ clientPage }) => {
    await goto(clientPage, "/login");
    await clientPage.waitForURL((url) => url.pathname === "/");
  });

  test("提供注册与忘记密码入口", async ({ page }) => {
    await goto(page, "/login");
    await expect(page.getByRole("link", { name: "忘记密码？" })).toBeVisible();
    await expect(page.getByRole("link", { name: "立即注册" })).toBeVisible();
  });
});
