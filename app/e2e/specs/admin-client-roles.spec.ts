/**
 * 后台客户端角色管理 e2e：列表、新建、编辑与删除
 * 客户端权限分组当前为空集合，新建不涉及权限勾选
 */

import { expect } from "@playwright/test";
import { goto, test, uniqueName } from "../fixtures";

test.describe
  .serial("后台客户端角色管理", () => {
    let createdName = "";
    let createdSlug = "";

    test("列表加载预置普通用户角色", async ({ adminPage }) => {
      await goto(adminPage, "/admin/client-roles");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: "普通用户",
      });
      await expect(row).toHaveCount(1);
      await expect(row.getByText("normal-user")).toBeVisible();
    });

    test("新建客户端角色并出现在列表", async ({ adminPage }) => {
      createdName = uniqueName("会员角色_");
      createdSlug = uniqueName("member_");

      await goto(adminPage, "/admin/client-roles");
      await adminPage.getByRole("button", { name: "新建角色" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("如：会员").fill(createdName);
      await modal.getByPlaceholder("如：vip").fill(createdSlug);
      await modal.getByPlaceholder("角色描述（可选）").fill("e2e 测试客户端角色");
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("角色已创建")).toBeVisible();
      const createdRow = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdName,
      });
      await expect(createdRow).toHaveCount(1);
      await expect(createdRow.getByText(createdSlug)).toBeVisible();
    });

    test("编辑客户端角色名称", async ({ adminPage }) => {
      await goto(adminPage, "/admin/client-roles");
      const row = adminPage.locator(".ant-table-tbody tr", {
        hasText: createdName,
      });
      await row.getByRole("button", { name: "编辑" }).click();
      const modal = adminPage.getByRole("dialog");
      await modal.getByPlaceholder("如：会员").fill(`${createdName}改`);
      await modal.getByRole("button", { name: /保\s*存/ }).click();

      await expect(adminPage.getByText("角色已更新")).toBeVisible();
      await expect(
        adminPage.locator(".ant-table-tbody tr", {
          hasText: `${createdName}改`,
        }),
      ).toHaveCount(1);
    });

    test("删除客户端角色", async ({ adminPage }) => {
      await goto(adminPage, "/admin/client-roles");
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
