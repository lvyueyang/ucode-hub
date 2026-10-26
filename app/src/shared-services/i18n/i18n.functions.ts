/**
 * 国际化 Server Function 包装器：共享查询 + AI 翻译
 */

import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  aiBatchTranslateSchema,
  aiTranslateFieldSchema,
} from "#/shared-services/i18n/i18n.ai.schemas";
import {
  createBatchTranslateResponse,
  resolveTargetLocales,
  translateWithAi,
} from "#/shared-services/i18n/i18n.ai.server";
import {
  formSchema as contentTranslationFormSchema,
  fieldTranslationQuerySchema,
} from "#/shared-services/i18n/i18n.content.schemas";
import {
  getExistingTranslations,
  getFieldTranslations,
  getUITranslations,
  upsertContentTranslation,
} from "#/shared-services/i18n/i18n.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/**
 * 获取当前请求的 locale 及对应翻译（从 requestMiddleware context 读取 Cookie locale）
 */
export const getLocaleBundleSFn = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const locale = context.locale;
  const translations = await getUITranslations(locale);
  return { locale, translations };
});

/** 获取某实体某字段的所有语言翻译（抽屉用；schema 与实体翻译页共用单一来源） */
export const getFieldTranslationsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_VIEW)])
  .validator(fieldTranslationQuerySchema)
  .handler(async ({ data: { entityType, entityId, fieldName } }) => {
    return getFieldTranslations(entityType, entityId, fieldName);
  });

/** 实体翻译创建/更新（schema 与实体翻译页共用 i18n.content.schemas 的单一来源） */
export const saveContentTranslationSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(contentTranslationFormSchema)
  .handler(async ({ data, context }) => {
    const result = await upsertContentTranslation(data);
    logCrud(context.user, "translation", "update", undefined, {
      targetType: "content_translation",
    });
    return result;
  });

/** AI 翻译单个字段（使用 ai_translation_prompt 模板，非流式生成） */
export const aiTranslateFieldSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(aiTranslateFieldSchema)
  .handler(async ({ data }) => translateWithAi(data));

/**
 * 批量 AI 翻译（组件/抽屉共用）：客户端把要翻译的记录（id + 源字段值）与字段声明传入，
 * 服务端查询已有翻译后按 mode(fill/correct) 组批，流式返回 SSE（writeBack=true 落库 / false 仅回填编辑器）。
 * handler 返回 Response，TanStack Start 置 x-tss-raw 透传流式响应。
 */
export const aiBatchTranslateSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRANSLATION_MANAGE)])
  .validator(aiBatchTranslateSchema)
  .handler(async ({ data }) => {
    const { entityType, mode, fields, records, targetLocales, batchSize, writeBack } = data;
    const locales = resolveTargetLocales(targetLocales);
    const existing = await getExistingTranslations(
      entityType,
      records.map((r) => r.id),
      locales,
    );
    return createBatchTranslateResponse({
      entityType,
      mode,
      fields,
      records,
      targetLocales: locales,
      batchSize: batchSize ?? 10,
      writeBack,
      existing,
    });
  });
