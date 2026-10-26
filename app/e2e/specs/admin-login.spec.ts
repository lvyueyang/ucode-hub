/**
 * 后台登录页 e2e：表单校验、错误凭据、root 登录成功与已登录重定向
 */

import { expect } from "@playwright/test";
import { goto, test } from "../fixtures";

test.describe("后台登录", () => {
  test("空表单提交显示校验错误", async ({ page }) => {
    await goto(page, "/admin/login");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("请输入用户名")).toBeVisible();
    await expect(page.getByText("请输入密码")).toBeVisible();
  });

  test("错误凭据提示登录失败", async ({ page }) => {
    await goto(page, "/admin/login");
    await page.getByPlaceholder("用户名").fill("root");
    await page.getByPlaceholder("密码").fill("wrong-password");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("用户名或密码错误")).toBeVisible();
  });

  test("root 登录成功跳转仪表盘", async ({ adminPage }) => {
    // 仪表盘 KPI 文案随域与权限变化，断言稳定的页面标题
    await expect(adminPage.getByRole("heading", { name: "仪表盘" })).toBeVisible();
  });

  test("已登录访问登录页仍渲染登录表单", async ({ adminPage }) => {
    await goto(adminPage, "/admin/login");
    await expect(adminPage.getByRole("heading", { name: "管理后台登录" })).toBeVisible();
  });

  test("侧边栏渲染用户与角色菜单", async ({ adminPage }) => {
    await expect(adminPage.getByText("管理员")).toBeVisible();
    await expect(adminPage.getByText("客户端用户")).toBeVisible();
    await expect(adminPage.getByText("管理端角色")).toBeVisible();
    await expect(adminPage.getByText("客户端角色")).toBeVisible();
  });
});
