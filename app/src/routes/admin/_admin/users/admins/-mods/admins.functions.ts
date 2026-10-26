/**
 * 管理员路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { getAllAdminRoles } from "#/services/admin-role/admin-role.server";
import {
  adminUserCreateSchema,
  adminUserListSchema,
  adminUserUpdateSchema,
  idSchema,
  resetPwdSchema,
} from "#/services/admin-user/admin-user.schemas";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUser,
  getAdminUserList,
  resetAdminPassword,
  updateAdminUser,
} from "#/services/admin-user/admin-user.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取角色下拉列表（不分页） */
export const getAdminRolesForSelectSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_VIEW)])
  .handler(async () => getAllAdminRoles());

/** 获取管理员列表（分页、筛选、排序） */
export const getListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_VIEW)])
  .validator(adminUserListSchema)
  .handler(async ({ data }) => getAdminUserList(data));

/** 新建管理员 */
export const createSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_CREATE)])
  .validator(adminUserCreateSchema)
  .handler(async ({ data, context }) => {
    const record = await createAdminUser(data);
    logCrud(
      context.user,
      "admin",
      "create",
      { id: record.id, name: record.username },
      { targetType: "admin_user" },
    );
    return record;
  });

/** 更新管理员 */
export const updateSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_EDIT)])
  .validator(adminUserUpdateSchema)
  .handler(async ({ data, context }) => {
    const result = await updateAdminUser(data.id, data);
    logCrud(
      context.user,
      "admin",
      "update",
      { id: data.id, name: result?.username || data.id },
      { targetType: "admin_user" },
    );
    return result;
  });

/** 删除管理员（软删除） */
export const deleteSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_DELETE)])
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    const existing = await getAdminUser(data.id);
    const result = await deleteAdminUser(data.id, context.user.id);
    logCrud(
      context.user,
      "admin",
      "delete",
      { id: data.id, name: existing?.username || data.id },
      { targetType: "admin_user" },
    );
    return result;
  });

/** 重置管理员密码 */
export const resetPwdSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_EDIT)])
  .validator(resetPwdSchema)
  .handler(async ({ data, context }) => {
    const existing = await getAdminUser(data.id);
    const result = await resetAdminPassword(data.id, data.password);
    logCrud(
      context.user,
      "admin",
      "reset_pwd",
      { id: data.id, name: existing?.username || data.id },
      { targetType: "admin_user" },
    );
    return result;
  });
