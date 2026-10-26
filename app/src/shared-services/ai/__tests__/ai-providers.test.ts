/**
 * AI 厂商配置服务测试：fetchProviderModels 拉取 OpenAI 兼容 /models 端点
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch, mockLogExternalRequest } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockLogExternalRequest: vi.fn(),
}));

vi.mock("#/shared-services/config/config.server", () => ({
  upsertConfig: vi.fn(),
}));
vi.mock("#/shared-services/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("#/shared-services/external-observability", () => ({
  logExternalRequest: mockLogExternalRequest,
}));

import { fetchProviderModels } from "../ai-providers.server";

/** 构造一个 OK 的 fetch 响应 */
function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

/** 构造一个非 OK 的 fetch 响应 */
function errResponse(status: number): Response {
  return { ok: false, status } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockLogExternalRequest.mockClear();
  vi.stubGlobal("fetch", mockFetch);
});

describe("fetchProviderModels", () => {
  it("拼接收尾去斜杠的 baseUrl 并带 Bearer 头，返回模型 id 列表", async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
      }),
    );
    const ids = await fetchProviderModels("https://api.deepseek.com/v1/", "sk-test");
    expect(ids).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk-test" },
      }),
    );
  });

  it("HTTP 非 200 时抛含状态码的友好错误", async () => {
    mockFetch.mockResolvedValue(errResponse(401));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "HTTP 401",
    );
  });

  it("响应 data 非数组时抛格式异常", async () => {
    mockFetch.mockResolvedValue(okResponse({ data: "oops" }));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "响应格式异常",
    );
  });

  it("data 为空数组时抛未获取到模型", async () => {
    mockFetch.mockResolvedValue(okResponse({ data: [] }));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "未获取到可用模型",
    );
  });

  it("网络异常时抛连接失败", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "连接 AI 服务失败",
    );
  });

  it("成功与失败都经 logExternalRequest 记外部调用", async () => {
    mockFetch.mockResolvedValue(okResponse({ data: [{ id: "m1" }] }));
    await fetchProviderModels("https://api.deepseek.com/v1", "sk");
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        system: "ai",
        path: "/models",
        success: true,
        status: 200,
      }),
    );

    mockFetch.mockResolvedValue(errResponse(401));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "HTTP 401",
    );
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        system: "ai",
        path: "/models",
        success: false,
        status: 401,
      }),
    );
  });

  it("HTTP 成功但响应体不可用时同样计为失败（指标按调用是否真正可用统计）", async () => {
    mockFetch.mockResolvedValue(okResponse({ data: "oops" }));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "响应格式异常",
    );
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        system: "ai",
        success: false,
        status: 200,
        error: "模型列表响应格式异常",
      }),
    );
  });

  it("响应体为空数组时计为失败", async () => {
    mockFetch.mockResolvedValue(okResponse({ data: [] }));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "未获取到可用模型",
    );
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, error: "未获取到可用模型" }),
    );
  });

  it("响应体非法 JSON 时归一化为可读文案而非原始 SyntaxError", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token <")),
    } as unknown as Response);

    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).rejects.toThrow(
      "模型列表响应格式异常",
    );
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, status: 200 }),
    );
  });

  it("data 含非法元素时跳过而非崩溃", async () => {
    mockFetch.mockResolvedValue(okResponse({ data: [{ id: "m1" }, null, 42, "m2", {}] }));
    await expect(fetchProviderModels("https://api.deepseek.com/v1", "sk")).resolves.toEqual(["m1"]);
  });
});
