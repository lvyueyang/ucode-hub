/**
 * 字典管理路由共享 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { toJson } from "@ucode/hub-lib/export";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  createDictSchema,
  createItemSchema,
  dictImportSchema,
  dictItemStatusSchema,
  dictListSchema,
  idSchema,
  updateDictItemSortSchema,
  updateDictSchema,
  updateItemSchema,
} from "#/shared-services/dict/dict.schemas";
import {
  createDict,
  createDictItemData,
  deleteDict,
  deleteDictItemRecord,
  exportAllDicts,
  getDictItems,
  getDictList,
  importDicts,
  setDictItemStatus,
  updateDictItemRecord,
  updateDictItemSortOrder,
  updateDictRecord,
} from "#/shared-services/dict/dict.server";
import type { DictImportData } from "#/shared-services/dict/dict.types";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取字典列表 */
export const getDictListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_VIEW)])
  .handler(async () => {
    return getDictList();
  });

/** 获取字典条目列表（分页） */
export const getDictItemsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_VIEW)])
  .validator(dictListSchema)
  .handler(async ({ data }) => {
    return getDictItems(data);
  });

/** 创建字典类型 */
export const createDictSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_CREATE)])
  .validator(createDictSchema)
  .handler(async ({ data, context }) => {
    const result = await createDict(data);
    logCrud(context.user, "dict", "create", {
      id: result.id,
      name: result.name,
    });
    return { success: true };
  });

/** 更新字典类型 */
export const updateDictSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_EDIT)])
  .validator(updateDictSchema)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    await updateDictRecord(id, rest);
    logCrud(context.user, "dict", "update", { id: data.id });
    return { success: true };
  });

/** 删除字典类型 */
export const deleteDictSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_DELETE)])
  .validator(idSchema)
  .handler(async ({ data: { id }, context }) => {
    await deleteDict(id);
    logCrud(context.user, "dict", "delete", { id: id });
    return { success: true };
  });

/** 创建字典条目 */
export const createDictItemSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_CREATE_ITEM)])
  .validator(createItemSchema)
  .handler(async ({ data, context }) => {
    const result = await createDictItemData(data);
    logCrud(
      context.user,
      "dict",
      "create",
      { id: result.id, name: `${data.dictSlug}:${data.label}` },
      { targetType: "dict_item" },
    );
    return { success: true };
  });

/** 更新字典条目 */
export const updateDictItemSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_EDIT_ITEM)])
  .validator(updateItemSchema)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    await updateDictItemRecord(id, rest);
    logCrud(context.user, "dict", "update", { id: data.id }, { targetType: "dict_item" });
    return { success: true };
  });

/** 列表内联修改条目排序权重（仅更新一个字段，避免复用整条更新回写其它字段） */
export const updateDictItemSortSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_EDIT_ITEM)])
  .validator(updateDictItemSortSchema)
  .handler(async ({ data: { id, sortOrder }, context }) => {
    const updated = await updateDictItemSortOrder(id, sortOrder);
    if (!updated) throw new Error("条目不存在或已被删除");
    logCrud(
      context.user,
      "dict",
      "update",
      { id },
      {
        targetType: "dict_item",
        detail: { field: "sortOrder", to: sortOrder },
      },
    );
    return { success: true };
  });

/** 列表中切换条目启用状态（仅更新一个字段） */
export const setDictItemStatusSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_EDIT_ITEM)])
  .validator(dictItemStatusSchema)
  .handler(async ({ data: { id, status }, context }) => {
    const updated = await setDictItemStatus(id, status);
    if (!updated) throw new Error("条目不存在或已被删除");
    logCrud(
      context.user,
      "dict",
      "update",
      { id },
      { targetType: "dict_item", detail: { field: "status", to: status } },
    );
    return { success: true };
  });

/** 删除字典条目 */
export const deleteDictItemSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_DELETE_ITEM)])
  .validator(idSchema)
  .handler(async ({ data: { id }, context }) => {
    await deleteDictItemRecord(id);
    logCrud(context.user, "dict", "delete", { id: id }, { targetType: "dict_item" });
    return { success: true };
  });

/** 导出字典数据（树形 JSON） */
export const exportDictsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_EXPORT)])
  .handler(async () => {
    const tree = await exportAllDicts();
    return toJson(tree);
  });

/** 导入字典数据（树形 JSON，自动展平为内部格式） */
export const importDictsSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_IMPORT)])
  .validator(dictImportSchema)
  .handler(async ({ data, context }) => {
    const flat: DictImportData = {
      dicts: data.dicts.map(({ children: _, ...rest }) => rest),
      dictItems: data.dicts.flatMap((d) =>
        (d.children ?? []).map((item) => ({ ...item, dictSlug: d.slug })),
      ),
    };
    const result = await importDicts(flat);
    logCrud(context.user, "dict", "import", undefined, {
      detail: {
        dictsCreated: result.dictsCreated,
        dictsUpdated: result.dictsUpdated,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsSkipped: result.itemsSkipped,
      },
    });
    return result;
  });
