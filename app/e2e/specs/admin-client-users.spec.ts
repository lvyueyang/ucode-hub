/**
 * 后台客户端用户管理 e2e：列表、新建、编辑、重置密码与删除
 */

import { expect } from "@playwright/test";
import { goto, test, uniqueName } from "../fixtures";
import { CLIENT_USER } from "../helpers/db";

test.describe
  .serial("后台客户端用户管理", () => {
    let createdUsername = "";
    let createdEmail = "";

    test("列表加载预置客户端用户", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/clients");
      await expect(
        adminPage.locator(".ant-table-tbody tr", {
          hasText: CLIENT_USER.username,
        }),
      ).toHaveCount(1);
      await expect(adminPage.getByText(/共 \d+ 条/)).toBeVisible();
    });

    test("新建客户端用户并出现在列表", async ({ adminPage }) => {
      createdUsername = uniqueName("client_");
      createdEmail = `${uniqueName("client")}@hub.dev`;

      await goto(adminPage, "/admin/users/clients");
      await adminPage.getByRole("button", { name: "新建用户" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("用户名").fill(createdUsername);
      await modal.getByPlaceholder("user@example.com").fill(createdEmail);
      await modal.getByPlaceholder("至少 6 位").fill("Passw0rd!");
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("用户已创建")).toBeVisible();
      await expect(
        adminPage.locator(".ant-table-tbody tr", { hasText: createdUsername }),
      ).toHaveCount(1);
    });

    test("编辑客户端用户信息", async ({ adminPage }) => {
      createdEmail = `${uniqueName("client")}@hub.dev`;

      await goto(adminPage, "/admin/users/clients");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdUsername,
      });
      await row.getByRole("button", { name: "编辑" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("user@example.com").fill(createdEmail);
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("用户信息已更新")).toBeVisible();
      await expect(adminPage.locator(".ant-table-tbody tr", { hasText: createdEmail })).toHaveCount(
        1,
      );
    });

    test("重置客户端用户密码", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/clients");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdUsername,
      });
      await row.getByRole("button", { name: "重置密码" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("至少 6 位").fill("NewPassw0rd!");
      await modal.getByRole("button", { name: /保\s*存/ }).click();
      await expect(adminPage.getByText("密码已重置")).toBeVisible();
    });

    test("删除客户端用户", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/clients");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdUsername,
      });
      await row.getByRole("button", { name: "删除" }).click();
      await adminPage
        .locator(".ant-popconfirm-buttons")
        .getByRole("button", {
          name: /确\s*定/,
        })
        .click();

      await expect(adminPage.getByText("用户已删除")).toBeVisible();
      await expect(
        adminPage.locator(".ant-table-tbody tr", { hasText: createdUsername }),
      ).toHaveCount(0);
    });
  });
