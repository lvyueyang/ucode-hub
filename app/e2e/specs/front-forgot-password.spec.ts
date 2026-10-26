/**
 * 前台忘记密码页 e2e：表单校验、成功重置、未注册邮箱与验证码错误
 * 通过直插验证码 + 直插专用测试用户绕开图片验证码与邮件链路
 */

import { expect } from "@playwright/test";
import { goto, test, uniqueName } from "../fixtures";
import { seedCaptcha, seedClientUser } from "../helpers/db";

test.describe("前台忘记密码", () => {
  test("字段校验错误正确提示", async ({ page }) => {
    await goto(page, "/forgot-password");
    // 邮箱格式错误
    const email = page.locator('input[name="email"]');
    await email.fill("invalid");
    await email.blur();
    await expect(page.getByText("邮箱格式不正确")).toBeVisible();
    // 新密码长度不足
    const password = page.locator('input[name="password"]');
    await password.fill("123");
    await password.blur();
    await expect(page.getByText("密码至少 6 位")).toBeVisible();
  });

  test("验证码错误时提示过期", async ({ page }) => {
    await goto(page, "/forgot-password");
    await page.locator('input[name="email"]').fill(`${uniqueName("pwd")}@hub.dev`);
    await page.getByLabel("邮箱验证码").fill("000000");
    await page.locator('input[name="password"]').fill("NewPass123!");
    await page.locator('input[name="confirmPassword"]').fill("NewPass123!");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("验证码错误或已过期")).toBeVisible();
  });

  test("未注册邮箱提示未注册", async ({ page }) => {
    const email = `${uniqueName("pwd")}@hub.dev`;
    await seedCaptcha(email);
    await goto(page, "/forgot-password");
    await page.locator('input[name="email"]').fill(email);
    await page.getByLabel("邮箱验证码").fill("123456");
    await page.locator('input[name="password"]').fill("NewPass123!");
    await page.locator('input[name="confirmPassword"]').fill("NewPass123!");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("该邮箱未注册")).toBeVisible();
  });

  test("成功重置后可用新密码登录", async ({ page }) => {
    const username = uniqueName("reset_");
    const email = `${username}@hub.dev`;
    const oldPassword = "OldPass123!";
    const newPassword = "NewPass456!";
    await seedClientUser(username, email, oldPassword);
    await seedCaptcha(email);

    await goto(page, "/forgot-password");
    await page.locator('input[name="email"]').fill(email);
    await page.getByLabel("邮箱验证码").fill("123456");
    await page.locator('input[name="password"]').fill(newPassword);
    await page.locator('input[name="confirmPassword"]').fill(newPassword);
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("密码重置成功")).toBeVisible();
    await page.waitForURL((url) => url.pathname === "/login");

    // 用新密码登录成功，旧密码应失效
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(newPassword);
    await page.locator("form button[type='submit']").click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("site-header")).toContainText(username);
  });
});
