/**
 * 后台管理员用户管理 e2e：列表、搜索、新建、编辑、重置密码与删除
 */

import { expect } from "@playwright/test";
import { goto, test, uniqueName } from "../fixtures";
import { ROOT_ADMIN } from "../helpers/db";

test.describe
  .serial("后台管理员用户管理", () => {
    let createdUsername = "";
    let createdEmail = "";

    test("列表加载 root 管理员并显示超级管理员标识", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/admins");
      const rootRow = adminPage.locator(".ant-table-tbody tr", {
        hasText: ROOT_ADMIN.username,
      });
      await expect(rootRow).toHaveCount(1);
      await expect(rootRow.getByText("超级管理员")).toBeVisible();
      await expect(adminPage.getByText(/共 \d+ 条/)).toBeVisible();
    });

    test("新建管理员并出现在列表", async ({ adminPage }) => {
      createdUsername = uniqueName("admin_");
      createdEmail = `${uniqueName("admin")}@hub.dev`;

      await goto(adminPage, "/admin/users/admins");
      await adminPage.getByRole("button", { name: "新建管理员" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("用户名").fill(createdUsername);
      await modal.getByPlaceholder("admin@example.com").fill(createdEmail);
      await modal.getByPlaceholder("至少 6 位").fill("Passw0rd!");
      await modal.getByRole("combobox").click();
      await adminPage.locator(".ant-select-item-option", { hasText: "超级管理员" }).click();
      // 多选下拉选中后保持展开，按 Esc 关闭避免遮挡弹窗确定按钮
      await adminPage.keyboard.press("Escape");
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("管理员已创建")).toBeVisible();
      const createdRow = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdUsername,
      });
      await expect(createdRow).toHaveCount(1);
      await expect(createdRow.getByText("超级管理员")).toBeVisible();
    });

    test("搜索关键字过滤列表", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/admins");
      const keywordInput = adminPage.getByPlaceholder("搜索用户名或邮箱...");
      await keywordInput.fill(createdUsername);
      // 搜索框已统一为 Input.Search（内嵌查询图标，回车即查），不再有独立的「搜索」按钮
      await keywordInput.press("Enter");
      await expect(
        adminPage.locator(".ant-table-tbody tr", { hasText: createdUsername }),
      ).toHaveCount(1);
      await expect(
        adminPage.locator(".ant-table-tbody tr", {
          hasText: ROOT_ADMIN.username,
        }),
      ).toHaveCount(0);
    });

    test("编辑管理员信息", async ({ adminPage }) => {
      createdEmail = `${uniqueName("admin")}@hub.dev`;

      await goto(adminPage, "/admin/users/admins");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdUsername,
      });
      await row.getByRole("button", { name: "编辑" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("admin@example.com").fill(createdEmail);
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("管理员信息已更新")).toBeVisible();
      await expect(adminPage.locator(".ant-table-tbody tr", { hasText: createdEmail })).toHaveCount(
        1,
      );
    });

    test("重置管理员密码", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/admins");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdUsername,
      });
      await row.getByRole("button", { name: "重置密码" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("至少 6 位").fill("NewPassw0rd!");
      await modal.getByRole("button", { name: /保\s*存/ }).click();
      await expect(adminPage.getByText("密码已重置")).toBeVisible();
    });

    test("删除管理员", async ({ adminPage }) => {
      await goto(adminPage, "/admin/users/admins");
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

      await expect(adminPage.getByText("管理员已删除")).toBeVisible();
      await expect(
        adminPage.locator(".ant-table-tbody tr", { hasText: createdUsername }),
      ).toHaveCount(0);
    });
  });
