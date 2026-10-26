/**
 * 权限匹配逻辑测试
 * 覆盖 matchPermission / hasAdminPermission / hasAnyAdminPermission / hasAllAdminPermissions
 * 及 ** 超级通配符、group:* 分组通配符、精确匹配三种模式
 */

import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
  hasAllAdminPermissions,
  hasAnyAdminPermission,
} from "#/permissions/admin-permissions";

/** 根据权限码从 ADMIN_PERMISSIONS 常量中查找对应的 AdminPermissionDef */
function findDef(code: string) {
  for (const def of Object.values(ADMIN_PERMISSIONS)) {
    if (def.code === code) return def;
  }
  throw new Error(`未找到权限定义: ${code}`);
}

describe("hasAdminPermission", () => {
  it("** 通配符命中", () => {
    expect(hasAdminPermission(["**"], findDef("client:view"))).toBe(true);
    expect(hasAdminPermission(["**"], findDef("admin:delete"))).toBe(true);
  });

  it("group:* 通配符命中", () => {
    expect(hasAdminPermission(["client:*"], findDef("client:view"))).toBe(true);
    expect(hasAdminPermission(["client:*"], findDef("client:edit"))).toBe(true);
  });

  it("精确匹配命中", () => {
    expect(hasAdminPermission(["client:view", "dict:edit"], findDef("client:view"))).toBe(true);
  });

  it("无权限", () => {
    expect(hasAdminPermission(["client:view"], findDef("admin:create"))).toBe(false);
  });

  it("空权限数组", () => {
    expect(hasAdminPermission([], findDef("client:view"))).toBe(false);
  });

  it("含 ** 时忽略其他通配符", () => {
    expect(hasAdminPermission(["**"], ADMIN_PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
  });
});

describe("hasAnyAdminPermission", () => {
  const clientDefs = [findDef("client:view"), findDef("client:create"), findDef("client:delete")];

  it("** 命中任一", () => {
    expect(hasAnyAdminPermission(["**"], clientDefs)).toBe(true);
  });

  it("group:* 覆盖其中至少一项", () => {
    expect(hasAnyAdminPermission(["client:*"], clientDefs)).toBe(true);
  });

  it("至少一项精确命中", () => {
    expect(hasAnyAdminPermission(["client:view", "dict:edit"], clientDefs)).toBe(true);
  });

  it("全部不命中", () => {
    expect(hasAnyAdminPermission(["admin:view", "dict:edit"], clientDefs)).toBe(false);
  });

  it("空权限数组返回 false", () => {
    expect(hasAnyAdminPermission([], clientDefs)).toBe(false);
  });

  it("多个通配符同时存在", () => {
    const crossDefs = [findDef("client:view"), findDef("admin:create")];
    expect(hasAnyAdminPermission(["client:*"], crossDefs)).toBe(true);
    expect(hasAnyAdminPermission(["admin:*"], crossDefs)).toBe(true);
    expect(hasAnyAdminPermission(["dict:*"], crossDefs)).toBe(false);
  });
});

describe("hasAllAdminPermissions", () => {
  const clientDefs = [findDef("client:view"), findDef("client:create")];
  const crossDefs = [findDef("client:view"), findDef("admin:create")];

  it("** 命中全部", () => {
    expect(hasAllAdminPermissions(["**"], clientDefs)).toBe(true);
    expect(hasAllAdminPermissions(["**"], crossDefs)).toBe(true);
  });

  it("group:* 覆盖全部同组权限", () => {
    expect(hasAllAdminPermissions(["client:*"], clientDefs)).toBe(true);
  });

  it("group:* 覆盖不完整（跨组要求）", () => {
    expect(hasAllAdminPermissions(["client:*"], crossDefs)).toBe(false);
  });

  it("全部精确命中", () => {
    expect(hasAllAdminPermissions(["client:view", "client:create", "dict:edit"], clientDefs)).toBe(
      true,
    );
  });

  it("缺一项", () => {
    expect(hasAllAdminPermissions(["client:view"], clientDefs)).toBe(false);
  });

  it("多个分组通配符覆盖跨组全部", () => {
    expect(hasAllAdminPermissions(["client:*", "admin:*"], crossDefs)).toBe(true);
  });

  it("空 required 数组始终为 true", () => {
    expect(hasAllAdminPermissions([], [])).toBe(true);
    expect(hasAllAdminPermissions(["**"], [])).toBe(true);
  });
});
