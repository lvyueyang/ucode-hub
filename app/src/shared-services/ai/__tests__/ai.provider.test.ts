/**
 * AI 客户端测试：多厂商（对象形式）配置读取/校验与迁移、resolveProvider/resolveModel 命中规则、
 * provider 按厂商+指纹缓存构建（OpenAI client 复用）、推理兼容适配器构建
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetConfig, mockLogger, MockOpenAI } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
  MockOpenAI: vi.fn(),
}));

vi.mock("#/shared-services/config/config.server", () => ({
  getConfig: mockGetConfig,
}));

vi.mock("#/shared-services/logger", () => ({
  logger: mockLogger,
}));

vi.mock("openai", () => ({ default: MockOpenAI }));

import { OpenAICompatibleChatAdapter } from "@tanstack/ai-openai/compatible";
import {
  AI_MAX_RETRIES,
  AI_TIMEOUT_MS,
  getAiAdapter,
  getAiProvider,
  getAiRawClient,
  readProviderConfig,
  readProviders,
  resolveModel,
  resolveProvider,
} from "../ai.provider";
import { ReasoningCompatibleChatAdapter } from "../ai.reasoning-adapter";
import type { AiProvidersConfig, AiProviderView } from "../ai.schemas";

/** 通用厂商配置（对象形式：key 为厂商 id） */
const PROVIDERS: AiProvidersConfig = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-ds",
    default: true,
    models: {
      "deepseek-chat": { name: "DeepSeek Chat" },
      "deepseek-reasoner": {
        name: "DeepSeek Reasoner",
        reasoning: true,
        jsonOutput: true,
      },
    },
  },
  moonshot: {
    name: "Moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    apiKey: "sk-ms",
    models: { "kimi-k2-0711-preview": { name: "Kimi K2 Preview" } },
  },
};

/** 与 PROVIDERS 对应的归一化视图数组（resolveProvider/resolveModel 直接用） */
const VIEWS: AiProviderView[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-ds",
    default: true,
    models: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
  },
  {
    id: "moonshot",
    name: "Moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    apiKey: "sk-ms",
    models: [{ id: "kimi-k2-0711-preview" }],
  },
];

/** 用给定配置 getConfig */
function setConfig(providers: AiProvidersConfig | string): void {
  mockGetConfig.mockReset();
  mockGetConfig.mockImplementation((key: string) =>
    key === "ai_providers"
      ? typeof providers === "string"
        ? providers
        : JSON.stringify(providers)
      : "",
  );
}

beforeEach(() => {
  // 清理跨用例残留的 globalThis 共享缓存
  (globalThis as Record<string, unknown>).__HUB_AI_PROVIDERS__ = undefined;
  MockOpenAI.mockClear();
});

describe("readProviders", () => {
  it("配置为空/非法 JSON/非对象时降级为空数组", async () => {
    mockGetConfig.mockResolvedValue("");
    expect(await readProviders()).toEqual([]);

    mockGetConfig.mockResolvedValue("not-json");
    expect(await readProviders()).toEqual([]);

    mockGetConfig.mockResolvedValue("{}");
    expect(await readProviders()).toEqual([]);
  });

  it("合法对象解析为厂商视图数组（id 来自对象键）", async () => {
    setConfig(PROVIDERS);
    const views = await readProviders();
    expect(views.map((p) => p.id)).toEqual(["deepseek", "moonshot"]);
    expect(views[0]!.models.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("单项非法时跳过并保留合法项（不影响其它厂商）", async () => {
    const config: AiProvidersConfig = {
      bad: { name: "", baseUrl: "x", apiKey: "y", models: { z: {} } },
      deepseek: PROVIDERS.deepseek,
    };
    setConfig(config);
    const views = await readProviders();
    expect(views.map((p) => p.id)).toEqual(["deepseek"]);
  });

  it("首版数组存量为对象格式一次性迁移（model 归一化为 models）", async () => {
    mockGetConfig.mockResolvedValue(
      JSON.stringify([
        {
          id: "deepseek",
          name: "DeepSeek",
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "sk-ds",
          model: "deepseek-chat",
          default: true,
        },
      ]),
    );
    const views = await readProviders();
    expect(views).toHaveLength(1);
    expect(views[0]!.id).toBe("deepseek");
    expect(views[0]!.models.map((m) => m.id)).toEqual(["deepseek-chat"]);
    expect(views[0]!.models[0]!.default).toBe(true);
  });
});

describe("resolveProvider", () => {
  it("按 providerId 命中", () => {
    expect(resolveProvider(VIEWS, "moonshot")?.id).toBe("moonshot");
  });

  it("无 providerId 时命中 default", () => {
    expect(resolveProvider(VIEWS)?.id).toBe("deepseek");
  });

  it("无 default 时取首个可用", () => {
    const deepseek = { ...VIEWS[0]!, default: false };
    expect(resolveProvider([deepseek, VIEWS[1]!])?.id).toBe("deepseek");
  });

  it("providerId 未命中返回 null", () => {
    expect(resolveProvider(VIEWS, "nope")).toBeNull();
  });

  it("厂商无可用模型时跳过", () => {
    const broken: AiProviderView[] = [{ id: "x", name: "x", baseUrl: "", apiKey: "", models: [] }];
    expect(resolveProvider(broken)).toBeNull();
  });
});

describe("resolveModel", () => {
  it("按模型 id 命中", () => {
    expect(resolveModel(VIEWS[0]!, "deepseek-reasoner")).toBe("deepseek-reasoner");
  });

  it("无模型 id 取 default 模型", () => {
    const provider = {
      ...VIEWS[0]!,
      models: [{ id: "a" }, { id: "b", default: true }],
    };
    expect(resolveModel(provider)).toBe("b");
  });

  it("无 default 模型取首个", () => {
    expect(resolveModel(VIEWS[0]!)).toBe("deepseek-chat");
  });

  it("模型 id 未命中返回 null", () => {
    expect(resolveModel(VIEWS[0]!, "nope")).toBeNull();
  });
});

describe("readProviderConfig", () => {
  it("读取并解析目标厂商配置", async () => {
    setConfig(PROVIDERS);
    expect((await readProviderConfig("moonshot"))?.id).toBe("moonshot");
    expect((await readProviderConfig())?.id).toBe("deepseek");
  });
});

describe("getAiProvider", () => {
  it("按目标厂商构建 OpenAI client 并按「id+指纹」缓存", async () => {
    setConfig(PROVIDERS);
    const provider = await getAiProvider("moonshot");
    expect(provider).not.toBeNull();
    expect(MockOpenAI).toHaveBeenCalledTimes(1);
    expect(MockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.moonshot.ai/v1",
        apiKey: "sk-ms",
        timeout: AI_TIMEOUT_MS,
        maxRetries: AI_MAX_RETRIES,
      }),
    );

    // 同厂商同配置再次调用不重建 client
    await getAiProvider("moonshot");
    expect(MockOpenAI).toHaveBeenCalledTimes(1);

    // 不同厂商各自独立构建
    await getAiProvider("deepseek");
    expect(MockOpenAI).toHaveBeenCalledTimes(2);
  });

  it("provider 工厂返回推理兼容适配器实例（统一始终用推理子类）", async () => {
    setConfig(PROVIDERS);
    const provider = await getAiProvider("deepseek");
    const adapter = provider!("deepseek-reasoner");
    expect(adapter).toBeInstanceOf(ReasoningCompatibleChatAdapter);
    // 仍是 OpenAI 兼容 Chat Completions 适配器，行为与基类一致
    expect(adapter).toBeInstanceOf(OpenAICompatibleChatAdapter);
  });

  it("配置变更时按指纹重建（模型新增/变动）", async () => {
    setConfig(PROVIDERS);
    await getAiProvider("deepseek");
    const changed: AiProvidersConfig = {
      deepseek: {
        ...PROVIDERS.deepseek,
        models: {
          "deepseek-chat": {
            name: "DeepSeek Chat",
            reasoning: true,
          },
        },
      },
    };
    setConfig(changed);
    await getAiProvider("deepseek");
    expect(MockOpenAI).toHaveBeenCalledTimes(2);
  });

  it("无可命中厂商时返回 null", async () => {
    mockGetConfig.mockResolvedValue("{}");
    expect(await getAiProvider()).toBeNull();
  });
});

describe("getAiAdapter", () => {
  it("用目标厂商默认模型名调用 provider 返回推理兼容 adapter", async () => {
    setConfig(PROVIDERS);
    const adapter = await getAiAdapter("moonshot");
    expect(adapter).toBeInstanceOf(ReasoningCompatibleChatAdapter);
    // 默认模型为 kimi-k2-0711-preview
    expect((adapter as { model: string }).model).toBe("kimi-k2-0711-preview");
  });

  it("显式传模型 id 时用对应模型", async () => {
    setConfig(PROVIDERS);
    const adapter = await getAiAdapter("deepseek", "deepseek-reasoner");
    expect(adapter).toBeInstanceOf(ReasoningCompatibleChatAdapter);
    expect((adapter as { model: string }).model).toBe("deepseek-reasoner");
  });

  it("未配置时返回 null", async () => {
    mockGetConfig.mockResolvedValue("{}");
    expect(await getAiAdapter()).toBeNull();
  });
});

describe("getAiRawClient", () => {
  it("返回目标厂商的原始 OpenAI 客户端与默认模型，且与 provider 共用同一份缓存", async () => {
    setConfig(PROVIDERS);
    const ready = await getAiRawClient("moonshot");
    expect(ready?.model).toBe("kimi-k2-0711-preview");
    expect(ready?.client).toBeDefined();
    expect(MockOpenAI).toHaveBeenCalledTimes(1);

    // provider 路径命中同一缓存槽，不再重建 client
    await getAiProvider("moonshot");
    expect(MockOpenAI).toHaveBeenCalledTimes(1);
  });

  it("显式模型 id 时用对应模型", async () => {
    setConfig(PROVIDERS);
    const ready = await getAiRawClient("deepseek", "deepseek-reasoner");
    expect(ready?.model).toBe("deepseek-reasoner");
  });

  it("厂商未命中或模型未命中返回 null", async () => {
    setConfig(PROVIDERS);
    expect(await getAiRawClient("nope")).toBeNull();
    expect(await getAiRawClient("deepseek", "nope")).toBeNull();
  });

  it("未配置时返回 null", async () => {
    mockGetConfig.mockResolvedValue("{}");
    expect(await getAiRawClient()).toBeNull();
  });
});
