/**
 * 后台管理端角色管理 e2e：列表、新建（含权限选择）、编辑与删除
 */

import { expect } from "@playwright/test";
import { goto, test, uniqueName } from "../fixtures";

test.describe
  .serial("后台管理端角色管理", () => {
    let createdName = "";
    let createdSlug = "";

    test("列表加载预置超级管理员角色", async ({ adminPage }) => {
      await goto(adminPage, "/admin/admin-roles");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: "超级管理员",
      });
      await expect(row).toHaveCount(1);
      await expect(row.getByText("super-admin")).toBeVisible();
    });

    test("新建角色并勾选客户端用户分组权限", async ({ adminPage }) => {
      createdName = uniqueName("编辑角色_");
      createdSlug = uniqueName("editor_");

      await goto(adminPage, "/admin/admin-roles");
      await adminPage.getByRole("button", { name: "新建角色" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("如：编辑人员").fill(createdName);
      await modal.getByPlaceholder("如：editor").fill(createdSlug);
      await modal.getByPlaceholder("角色描述（可选）").fill("e2e 测试角色");
      // 勾选 client 分组通配符
      await modal.getByRole("checkbox", { name: "client", exact: true }).check();
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("角色已创建")).toBeVisible();
      const createdRow = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdName,
      });
      await expect(createdRow).toHaveCount(1);
      await expect(createdRow.getByText(createdSlug)).toBeVisible();
    });

    test("编辑角色名称与描述", async ({ adminPage }) => {
      await goto(adminPage, "/admin/admin-roles");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdName,
      });
      await row.getByRole("button", { name: "编辑" }).click();
      const modal = adminPage.getByRole("dialog");
      // 编辑态角色标识禁用
      await expect(modal.getByPlaceholder("如：editor").isDisabled()).resolves.toBe(true);
      await modal.getByPlaceholder("如：编辑人员").fill(`${createdName}改`);
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("角色已更新")).toBeVisible();
      await expect(
        adminPage.locator(".ant-table-tbody tr", {
          hasText: `${createdName}改`,
        }),
      ).toHaveCount(1);
    });

    test("删除角色", async ({ adminPage }) => {
      await goto(adminPage, "/admin/admin-roles");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: `${createdName}改`,
      });
      await row.getByRole("button", { name: "删除" }).click();
      await adminPage
        .locator(".ant-popconfirm-buttons")
        .getByRole("button", {
          name: /确\s*定/,
        })
        .click();

      await expect(adminPage.getByText("角色已删除")).toBeVisible();
      await expect(
        adminPage.locator(".ant-table-tbody tr", {
          hasText: `${createdName}改`,
        }),
      ).toHaveCount(0);
    });
  });
