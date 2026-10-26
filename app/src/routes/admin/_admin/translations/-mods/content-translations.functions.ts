/**
 * 实体翻译页面 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { toJson } from "@ucode/hub-lib/export";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  contentTranslationListSchema,
  deleteSchema,
  formSchema,
} from "#/shared-services/i18n/i18n.content.schemas";
import {
  type ContentTranslationExportData,
  deleteContentTranslation,
  getAllContentTranslationsForExport,
  importContentTranslations,
  listContentTranslations,
  type TranslationImportResult,
  upsertContentTranslation,
} from "#/shared-services/i18n/i18n.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

export const getListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_VIEW)])
  .validator(contentTranslationListSchema)
  .handler(async ({ data }) => listContentTranslations(data));

export const saveSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(formSchema)
  .handler(async ({ data, context }) => {
    const result = await upsertContentTranslation(data);
    logCrud(context.user, "translation", "update", undefined, {
      targetType: "content_translation",
    });
    return result;
  });

export const deleteSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(deleteSchema)
  .handler(async ({ data, context }) => {
    await deleteContentTranslation(data.id);
    logCrud(
      context.user,
      "translation",
      "delete",
      { id: data.id },
      { targetType: "content_translation" },
    );
    return { success: true };
  });

export const exportContentTranslationsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_EXPORT)])
  .handler(async () => {
    const translations = await getAllContentTranslationsForExport();
    return toJson({ translations });
  });

/** 实体翻译导入入参 schema（测试共用） */
export const importContentTranslationsSchema = z.object({
  data: z.object({
    translations: z.array(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().min(1),
        fieldName: z.string().min(1),
        locale: z.string().min(1),
        value: z.string().min(1),
        valueType: z.string().optional(),
      }),
    ),
  }),
});

export const importContentTranslationsSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_IMPORT)])
  .validator(importContentTranslationsSchema)
  .handler(async ({ data: { data }, context }): Promise<TranslationImportResult> => {
    const result = await importContentTranslations(data as ContentTranslationExportData);
    logCrud(context.user, "translation", "import", undefined, {
      targetType: "content_translation",
      detail: { created: result.created, updated: result.updated },
    });
    return result;
  });
