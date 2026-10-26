/**
 * 系统配置管理路由共享 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { toJson } from "@ucode/hub-lib/export";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  configImportSchema,
  createConfigSchema,
  deleteConfigSchema,
  updateConfigSchema,
} from "#/shared-services/config/config.schemas";
import {
  createConfig,
  deleteConfig,
  getConfigList,
  importConfigs,
  updateConfig,
} from "#/shared-services/config/config.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取配置列表 */
export const getConfigListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CONFIG_VIEW)])
  .handler(async () => {
    return getConfigList();
  });

/** 创建配置 */
export const createConfigSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CONFIG_CREATE)])
  .validator(createConfigSchema)
  .handler(async ({ data, context }) => {
    const result = await createConfig(data);
    logCrud(context.user, "config", "create", {
      id: result.id,
      name: result.key,
    });
    return { success: true };
  });

/** 更新配置 */
export const updateConfigSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CONFIG_EDIT)])
  .validator(updateConfigSchema)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    await updateConfig(id, rest);
    logCrud(context.user, "config", "update", { id: data.id });
    return { success: true };
  });

/** 删除配置 */
export const deleteConfigSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CONFIG_DELETE)])
  .validator(deleteConfigSchema)
  .handler(async ({ data, context }) => {
    await deleteConfig(data.id);
    logCrud(context.user, "config", "delete", { id: data.id });
    return { success: true };
  });

/** 导出配置数据（JSON）：敏感配置不携带原文，仅标记是否已配置 */
export const exportConfigsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CONFIG_EXPORT)])
  .handler(async () => {
    const configs = (await getConfigList()).map((config) =>
      config.isSecret ? { ...config, value: "", secretConfigured: Boolean(config.value) } : config,
    );
    return toJson({ configs });
  });

/** 导入配置数据（JSON） */
export const importConfigsSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CONFIG_IMPORT)])
  .validator(configImportSchema)
  .handler(async ({ data, context }) => {
    const result = await importConfigs(data);
    logCrud(context.user, "config", "import", undefined, {
      detail: {
        created: result.created,
        updated: result.updated,
      },
    });
    return result;
  });
