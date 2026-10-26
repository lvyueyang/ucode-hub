/**
 * UI 翻译页面 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { toJson } from "@ucode/hub-lib/export";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  deleteUITranslation,
  getAllUITranslationsForExport,
  importUiTranslations,
  listUITranslations,
  type TranslationImportResult,
  type UiTranslationExportData,
  upsertUITranslation,
} from "#/shared-services/i18n/i18n.server";
import {
  deleteSchema,
  formSchema,
  uiTranslationListSchema,
} from "#/shared-services/i18n/i18n.ui.schemas";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

export const getListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_VIEW)])
  .validator(uiTranslationListSchema)
  .handler(async ({ data }) => listUITranslations(data));

export const saveSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(formSchema)
  .handler(async ({ data, context }) => {
    const result = await upsertUITranslation(data);
    logCrud(context.user, "translation", "update", undefined, {
      targetType: "ui_translation",
    });
    return result;
  });

export const deleteSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(deleteSchema)
  .handler(async ({ data, context }) => {
    await deleteUITranslation(data.id);
    logCrud(
      context.user,
      "translation",
      "delete",
      { id: data.id },
      { targetType: "ui_translation" },
    );
    return { success: true };
  });

export const exportUITranslationsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_EXPORT)])
  .handler(async () => {
    const translations = await getAllUITranslationsForExport();
    return toJson({ translations });
  });

/** UI 翻译导入入参 schema（测试共用） */
export const importUITranslationsSchema = z.object({
  data: z.object({
    translations: z.array(
      z.object({
        locale: z.string().min(1),
        key: z.string().min(1),
        value: z.string().min(1),
        valueType: z.string().optional(),
      }),
    ),
  }),
});

export const importUITranslationsSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_IMPORT)])
  .validator(importUITranslationsSchema)
  .handler(async ({ data: { data }, context }): Promise<TranslationImportResult> => {
    const result = await importUiTranslations(data as UiTranslationExportData);
    logCrud(context.user, "translation", "import", undefined, {
      targetType: "ui_translation",
      detail: { created: result.created, updated: result.updated },
    });
    return result;
  });
