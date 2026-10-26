/**
 * AI 厂商管理 Server Function：读取/保存 ai_providers 配置（供专属厂商管理页使用）
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";
import { saveAiProvidersSchema } from "./ai.schemas";
import { fetchProviderModels, getAiProviderList, saveAiProviderList } from "./ai-providers.server";

/** 拉取厂商模型的入参 */
export const fetchProviderModelsInputSchema = z.object({
  baseUrl: z.string().min(1, "API 基础地址不能为空"),
  apiKey: z.string().min(1, "API 密钥不能为空"),
});

/** 获取 AI 厂商配置列表 */
export const getAiProvidersSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.AI_PROVIDER_MANAGE)])
  .handler(async () => getAiProviderList());

/** 调用 OpenAI 兼容 /models 端点拉取厂商可用模型（供管理页弹窗） */
export const fetchProviderModelsSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.AI_PROVIDER_MANAGE)])
  .validator(fetchProviderModelsInputSchema)
  .handler(async ({ data }) => ({
    models: await fetchProviderModels(data.baseUrl, data.apiKey),
  }));

/** 保存 AI 厂商配置列表（整列表覆盖） */
export const saveAiProvidersSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.AI_PROVIDER_MANAGE)])
  .validator(saveAiProvidersSchema)
  .handler(async ({ data, context }) => {
    await saveAiProviderList(data.providers);
    logCrud(context.user, "ai-provider", "update", undefined, {
      targetType: "ai_providers",
      detail: { count: Object.keys(data.providers).length },
    });
    return { ok: true as const };
  });
