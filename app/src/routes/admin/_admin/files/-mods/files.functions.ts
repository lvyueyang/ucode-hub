/**
 * 文件管理 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { fileIdSchema, updateFileTagsSchema } from "#/services/file/file.schemas";
import { deleteFile, makePermanent, updateFileTags } from "#/services/file/file.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

export const deleteFileSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_DELETE)])
  .validator(fileIdSchema)
  .handler(async ({ data, context }) => {
    await deleteFile(data.id);
    logCrud(context.user, "file", "delete", { id: data.id });
    return { success: true };
  });

export const makePermanentSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_EDIT)])
  .validator(fileIdSchema)
  .handler(async ({ data, context }) => {
    await makePermanent(data.id);
    logCrud(context.user, "file", "make_permanent", { id: data.id });
    return { success: true };
  });

/** 覆盖文件标签（空数组即清空；标签归一化由 schema 负责） */
export const updateFileTagsSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_EDIT)])
  .validator(updateFileTagsSchema)
  .handler(async ({ data: { id, tags }, context }) => {
    const updated = await updateFileTags(id, tags);
    if (!updated) throw new Error("文件不存在或已被删除");
    logCrud(context.user, "file", "update_tag", { id }, { detail: { to: tags } });
    return { success: true };
  });
