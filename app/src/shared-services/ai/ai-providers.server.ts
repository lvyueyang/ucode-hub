/**
 * AI 厂商配置服务（app 服务层）
 * 读写 system_config.ai_providers（对象 JSON：{ [厂商id]: { name, baseUrl, apiKey, default?, models } }）。
 * 页面为专用「AI 厂商」管理，数据不新增 DB 表。
 */
import { upsertConfig } from "#/shared-services/config/config.server";
import { logExternalRequest } from "#/shared-services/external-observability";
import { AI_TIMEOUT_MS, readProviders } from "./ai.provider";
import { type AiProvidersConfig, aiProvidersSchema } from "./ai.schemas";

/** ai_providers 系统配置键 */
export const AI_PROVIDERS_CONFIG_KEY = "ai_providers";

/** 读取 AI 厂商列表（已归一化；空/非法降级为空数组） */
export async function getAiProviderList() {
  return readProviders();
}

/** 保存 AI 厂商配置（整体对象覆盖写入 ai_providers 键） */
export async function saveAiProviderList(providers: AiProvidersConfig): Promise<void> {
  const validated = aiProvidersSchema.parse(providers);
  await upsertConfig(
    AI_PROVIDERS_CONFIG_KEY,
    JSON.stringify(validated),
    "AI 厂商配置（对象 JSON）：{ [厂商id]: { name, baseUrl, apiKey, default?, models: { [模型名]: { name?, default?, contextLimit?, outputLimit?, jsonOutput?, toolCalls?, reasoning?, input?, output? } } } }，底层走 OpenAI 兼容协议",
    "json",
    "AI设置",
    false,
  );
}

/**
 * 调用 OpenAI 兼容 /models 端点拉取可用模型 id 列表（供管理页弹窗「拉取模型列表」）。
 * @throws 网络/HTTP 失败、响应体不可用（非 JSON / 结构异常 / 无模型）时抛友好错误
 */
export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const startedAt = Date.now();
  // 观测字段：只记 baseUrl，不回传 apiKey
  const logBase = {
    system: "ai",
    requestType: "business" as const,
    path: "/models",
    method: "GET",
    extra: { baseUrl },
  };
  /**
   * 统一收口本次外发结果：HTTP 成功但响应体不可用同样计为失败
   * （指标按「调用是否真正可用」统计，否则上游返回垃圾数据会被记为成功）
   */
  const logOutcome = (success: boolean, fields: { status?: number; error?: string } = {}) =>
    logExternalRequest({
      ...logBase,
      duration: Date.now() - startedAt,
      success,
      ...fields,
    });

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    logOutcome(false, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("连接 AI 服务失败，请检查 API 基础地址");
  }
  if (!res.ok) {
    logOutcome(false, { status: res.status, error: `HTTP ${res.status}` });
    throw new Error(`拉取模型列表失败（HTTP ${res.status}）`);
  }

  // 响应体非法 JSON 时把原始 SyntaxError 就地归一化为可读文案，不抛给调用方；
  // 元素形态不可信（可能含 null / 数字 / 字符串），故按 unknown 逐项收窄而非直接断言
  const payload = (await res.json().catch(() => undefined)) as { data?: unknown[] } | undefined;
  const rawModels = payload?.data;
  if (!Array.isArray(rawModels)) {
    logOutcome(false, {
      status: res.status,
      error: "模型列表响应格式异常",
    });
    throw new Error("模型列表响应格式异常");
  }
  const ids = rawModels
    .map((m) => (typeof m === "object" && m !== null ? (m as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string" && !!id);
  if (!ids.length) {
    logOutcome(false, { status: res.status, error: "未获取到可用模型" });
    throw new Error("未获取到可用模型");
  }
  logOutcome(true, { status: res.status });
  return ids;
}
