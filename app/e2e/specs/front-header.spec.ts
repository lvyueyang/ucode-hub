/**
 * 前台 Header 登录态 e2e：登录后用户信息与退出登录
 */

import { expect, test } from "../fixtures";

test.describe("前台 Header 登录态", () => {
  test("登录后显示用户名、消息入口与退出按钮", async ({ clientPage }) => {
    const header = clientPage.getByTestId("site-header");
    await expect(header).toContainText("client01");
    await expect(header.getByLabel("消息中心")).toBeVisible();
    await expect(header.getByLabel("退出登录")).toBeVisible();
    await expect(header.getByRole("link", { name: "登录" })).toHaveCount(0);
  });

  test("退出登录后回到未登录态", async ({ clientPage }) => {
    const header = clientPage.getByTestId("site-header");
    await header.getByLabel("退出登录").click();
    await expect(header.getByRole("link", { name: "登录" })).toBeVisible();
    await expect(header.getByLabel("退出登录")).toHaveCount(0);
    await expect(header).not.toContainText("client01");
  });
});
