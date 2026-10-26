/**
 * 前台注册页 e2e：表单校验、成功注册、重复账号与验证码错误
 * 通过直插 captcha_code 绕开图片验证码弹窗与 SMTP 邮件链路
 */

import { expect } from "@playwright/test";
import { goto, test, uniqueName } from "../fixtures";
import { seedCaptcha } from "../helpers/db";

test.describe("前台注册", () => {
  test("字段校验错误正确提示", async ({ page }) => {
    await goto(page, "/register");
    // 邮箱格式错误
    const email = page.locator('input[name="email"]');
    await email.fill("invalid");
    await email.blur();
    await expect(page.getByText("邮箱格式不正确")).toBeVisible();
    // 密码长度不足
    const password = page.locator('input[name="password"]');
    await password.fill("123");
    await password.blur();
    await expect(page.getByText("密码至少 6 位")).toBeVisible();
    // 验证码位数错误
    const captcha = page.getByLabel("邮箱验证码");
    await captcha.fill("123");
    await captcha.blur();
    await expect(page.getByText("验证码为 6 位")).toBeVisible();
  });

  test("验证码错误时提示过期", async ({ page }) => {
    await goto(page, "/register");
    await page.locator('input[name="username"]').fill(uniqueName("reg_"));
    await page.locator('input[name="email"]').fill(`${uniqueName("reg")}@hub.dev`);
    await page.locator('input[name="password"]').fill("Passw0rd!");
    await page.getByLabel("邮箱验证码").fill("000000");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("验证码错误或已过期")).toBeVisible();
  });

  test("使用已存在用户名时提示已存在", async ({ page }) => {
    const email = `${uniqueName("dup")}@hub.dev`;
    await seedCaptcha(email);
    await goto(page, "/register");
    await page.locator('input[name="username"]').fill("client01");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("Passw0rd!");
    await page.getByLabel("邮箱验证码").fill("123456");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("用户名或邮箱已存在")).toBeVisible();
  });

  test("成功注册后跳转登录页且新账号可登录", async ({ page }) => {
    const username = uniqueName("newuser_");
    const email = `${uniqueName("newuser")}@hub.dev`;
    const password = "Passw0rd!";
    await seedCaptcha(email);

    await goto(page, "/register");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByLabel("邮箱验证码").fill("123456");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("注册成功")).toBeVisible();
    await page.waitForURL((url) => url.pathname === "/login");

    // 用新账号登录
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator("form button[type='submit']").click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("site-header")).toContainText(username);
  });

  test("已登录访问注册页重定向首页", async ({ clientPage }) => {
    await goto(clientPage, "/register");
    await clientPage.waitForURL((url) => url.pathname === "/");
  });
});
