/**
 * AI 客户端（app 服务层）：读取系统配置构建多厂商 provider/adapter
 * 配置为单 JSON 键（ai_providers，对象形式：{ [厂商id]: { name, baseUrl, apiKey, default?, models } }），
 * 底层全部走 TanStack AI 的 OpenAI 兼容协议（Chat Completions 面），统一使用推理兼容子类以保留思考内容。
 * provider 按「厂商 id + 配置指纹」缓存为跨 bundle 共享 Map（globalThis，Nitro 入口与 SSR 渲染器共享）。
 * 纯基建职责：只构建 provider/adapter，不编排 chat()、不消费流、不感知业务。
 */
import type { AnyTextAdapter } from "@tanstack/ai";
import OpenAI from "openai";
import { getConfig } from "#/shared-services/config/config.server";
import { logger } from "#/shared-services/logger";
import { ReasoningCompatibleChatAdapter } from "./ai.reasoning-adapter";
import {
  type AiModelView,
  type AiProvidersConfig,
  type AiProviderView,
  aiProviderConfigSchema,
} from "./ai.schemas";

/** AI HTTP 请求超时（毫秒）：与上游网关超时对齐，避免请求无限挂起 */
export const AI_TIMEOUT_MS = 180_000;
/** OpenAI SDK 层面对 429/5xx/连接错误的重试次数 */
export const AI_MAX_RETRIES = 2;

/**
 * 构建出的 provider 函数形态：传入模型名返回对应 adapter。
 * 运行时模型名来自系统配置（动态字符串），故在此以 string 收窄。
 */
export type AiProvider = (model: string) => AnyTextAdapter;

/** 跨 bundle 共享 provider 缓存的 globalThis 存储键 */
const AI_PROVIDER_CACHE_KEY = "__HUB_AI_PROVIDERS__";

/** 单个厂商的缓存槽（按厂商 id 缓存，配置指纹变更时替换，避免无限增长） */
interface AiProviderSlot {
  /** 构建该 provider 时的配置指纹 */
  fingerprint: string;
  provider: AiProvider;
  /** 原始 OpenAI 兼容客户端：供需要直通厂商 SSE 的场景复用（如 OpenAI 兼容代理端点） */
  client: OpenAI;
}

/**
 * 从 globalThis 读取跨 bundle 共享的 provider 缓存 Map（键：厂商 id，值：{fingerprint, provider}）。
 * 避免模块级单例在 Nitro 入口与 SSR 渲染器两条 bundle 间分裂；按 id 缓存限长，多厂商互相隔离。
 */
function getProviderCache(): Map<string, AiProviderSlot> {
  const global = globalThis as typeof globalThis &
    Record<string, Map<string, AiProviderSlot> | undefined>;
  const cached = global[AI_PROVIDER_CACHE_KEY] ?? new Map<string, AiProviderSlot>();
  global[AI_PROVIDER_CACHE_KEY] = cached;
  return cached;
}

/**
 * 旧「数组」格式（首版）一次性兼容迁移到对象：id 取自元素 id 字段，model 归一化为 models。
 * 仅用于存量数据，新数据不再写入数组。
 */
function migrateArrayToObject(parsed: unknown[]): AiProvidersConfig {
  const obj: AiProvidersConfig = {};
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = rec.id;
    if (typeof id !== "string" || !id) continue;
    const base: Record<string, unknown> = {
      name: rec.name,
      baseUrl: rec.baseUrl,
      apiKey: rec.apiKey,
      default: rec.default,
    };
    const model = rec.model;
    if (typeof model === "string" && model) {
      base.models = { [model]: { name: model, default: true } };
    }
    const result = aiProviderConfigSchema.safeParse(base);
    if (result.success) obj[id] = result.data;
  }
  return obj;
}

/**
 * 对象配置 → 归一化视图数组（逐项校验，跳过非法厂商与非法模型 id，避免一个脏数据让全部厂商失效）。
 */
function toProviderViews(config: unknown): AiProviderView[] {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return [];
  }
  const views: AiProviderView[] = [];
  for (const [id, providerRaw] of Object.entries(config)) {
    if (!id || id.includes("/") || id.includes("#")) {
      logger.warn({ id }, "跳过非法的 AI 厂商 id");
      continue;
    }
    const result = aiProviderConfigSchema.safeParse(providerRaw);
    if (!result.success) {
      logger.warn({ id }, "跳过非法的 AI 厂商配置项");
      continue;
    }
    const provider = result.data;
    const models: AiModelView[] = [];
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (!modelId || modelId.includes("#")) {
        logger.warn({ providerId: id, modelId }, "跳过非法的模型 id");
        continue;
      }
      models.push({ id: modelId, ...model });
    }
    views.push({
      id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      default: provider.default,
      models,
    });
  }
  return views;
}

/** 读取并校验多厂商配置；失败/非法 JSON/非对象时降级为空数组并告警 */
export async function readProviders(): Promise<AiProviderView[]> {
  const raw = await getConfig("ai_providers");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // 首版数组存量数据一次性迁移到对象
      return toProviderViews(migrateArrayToObject(parsed));
    }
    return toProviderViews(parsed);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "ai_providers 配置解析失败，视为空",
    );
    return [];
  }
}

/**
 * 从厂商列表解析目标厂商：优先 providerId，其次 default:true，最后取首个非空。
 * 无可用厂商返回 null。
 */
export function resolveProvider(
  providers: AiProviderView[],
  providerId?: string,
): AiProviderView | null {
  const usable = providers.filter((p) => p.baseUrl && p.apiKey && p.models.length > 0);
  if (!usable.length) return null;
  if (providerId) {
    return usable.find((p) => p.id === providerId) ?? null;
  }
  return usable.find((p) => p.default) ?? usable[0];
}

/** 解析厂商下目标模型 id：指定模型 / default 模型 / 首个非空 */
export function resolveModel(provider: AiProviderView, modelId?: string): string | null {
  const models = provider.models;
  if (!models.length) return null;
  if (modelId) {
    return models.find((m) => m.id === modelId)?.id ?? null;
  }
  return models.find((m) => m.default)?.id ?? models.at(0)?.id ?? null;
}

/** 读取并解析目标厂商配置（未命中返回 null） */
export async function readProviderConfig(providerId?: string): Promise<AiProviderView | null> {
  const providers = await readProviders();
  return resolveProvider(providers, providerId);
}

/** 构建厂商对应的原始 OpenAI 兼容客户端（统一超时与重试策略） */
function buildOpenAiClient(config: AiProviderView): OpenAI {
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    // 客户端超时与重试：超时避免无限挂起，5xx/429 由 SDK 指数退避重试
    timeout: AI_TIMEOUT_MS,
    maxRetries: AI_MAX_RETRIES,
  });
}

/** 构建（或命中缓存）某厂商的缓存槽；配置指纹变更时重建 */
async function getOrBuildSlot(config: AiProviderView): Promise<AiProviderSlot> {
  const fingerprint = `${config.baseUrl}||${config.apiKey}||${JSON.stringify(config.models)}`;
  const cache = getProviderCache();
  const slot = cache.get(config.id);
  if (slot && slot.fingerprint === fingerprint) {
    return slot;
  }

  // 适配器底层为 Chat Completions 协议（DeepSeek/Moonshot/Qwen/本地 vLLM 等 OpenAI 兼容端点）。
  // 统一使用「推理兼容子类」：其 extractReasoning 会读取 delta.reasoning_content/reasoning，
  // 对非推理模型无该字段自然返回 undefined，行为与基类一致，故无需按能力位分叉。
  const client = buildOpenAiClient(config);
  const provider: AiProvider = (modelId) =>
    new ReasoningCompatibleChatAdapter(client, modelId, config.name);
  const next: AiProviderSlot = { fingerprint, provider, client };
  cache.set(config.id, next);
  logger.info(
    {
      providerId: config.id,
      baseUrl: config.baseUrl,
      models: config.models.map((m) => m.id),
    },
    "AI provider 已初始化",
  );
  return next;
}

/**
 * 获取目标厂商的 OpenAI 兼容 provider（按厂商 id + 指纹缓存，配置变更时重建）。
 * 返回 null 表示无可命中的已配置厂商。
 */
export async function getAiProvider(providerId?: string): Promise<AiProvider | null> {
  const config = await readProviderConfig(providerId);
  if (!config) return null;
  return (await getOrBuildSlot(config)).provider;
}

/**
 * 获取目标厂商的原始 OpenAI 客户端与目标模型（供需要直通厂商 SSE 的端点复用同一份缓存）。
 * 返回 null 表示无可命中的已配置厂商或目标模型。
 */
export async function getAiRawClient(
  providerId?: string,
  modelId?: string,
): Promise<{ client: OpenAI; model: string } | null> {
  const config = await readProviderConfig(providerId);
  if (!config) return null;
  const model = resolveModel(config, modelId);
  if (!model) return null;
  const { client } = await getOrBuildSlot(config);
  return { client, model };
}

/**
 * 获取目标厂商对应的 OpenAI 兼容 text adapter（供 ai.server 传给 chat({ adapter })）。
 * 无可命中的已配置厂商或目标模型时返回 null，由调用方决定是否报友好错误。
 */
export async function getAiAdapter(
  providerId?: string,
  modelId?: string,
): Promise<AnyTextAdapter | null> {
  const config = await readProviderConfig(providerId);
  if (!config) return null;
  const model = resolveModel(config, modelId);
  if (!model) return null;
  const { provider } = await getOrBuildSlot(config);
  return provider(model);
}
