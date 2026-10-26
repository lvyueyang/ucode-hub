/**
 * AI 服务编排层测试：streamAiChat 流式透传、completeText 非流式取文本、未配置 fail-fast
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockChat, mockGetAiAdapter, mockInc, mockObserve } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockGetAiAdapter: vi.fn(),
  mockInc: vi.fn(),
  mockObserve: vi.fn(),
}));

vi.mock("@tanstack/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/ai")>();
  return { ...actual, chat: mockChat };
});

vi.mock("../ai.provider", () => ({
  getAiAdapter: mockGetAiAdapter,
}));

// 外部调用观测按其真实实现运行（含真实 observeExternalStream），只拦截日志与指标出口，
// 以验证「AI 调用确实计入 external_calls_total」
vi.mock("#/shared-services/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("#/shared-services/metrics", () => ({
  externalCallsTotal: { inc: mockInc },
  externalCallDurationSeconds: { observe: mockObserve },
}));

import { completeText, streamAiChat } from "../ai.server";

const mockAdapter = { kind: "text" } as never;

/** 逐块产出的异步流 */
async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

/** 消费整个流并收集块 */
async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe("streamAiChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAiAdapter.mockReset();
  });

  it("未配置时抛友好错误", async () => {
    mockGetAiAdapter.mockResolvedValue(null);
    await expect(streamAiChat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      "AI 客户端未配置",
    );
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("透传 providerId/messages/systemPrompts/modelOptions/threadId/runId，返回流", async () => {
    mockGetAiAdapter.mockResolvedValue(mockAdapter);
    const stream = fromArray(["块1", "块2"]);
    mockChat.mockResolvedValue(stream);

    const result = await streamAiChat({
      messages: [{ role: "user", content: "hi" }],
      systemPrompts: ["你是助手"],
      providerId: "deepseek",
      modelOptions: { temperature: 0.7, max_tokens: 4096 },
      threadId: "t1",
      runId: "r1",
    });

    expect(mockGetAiAdapter).toHaveBeenCalledWith("deepseek");
    // 返回的是经观测包装的流：块原样透传
    expect(await collect(result)).toEqual(["块1", "块2"]);
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: mockAdapter,
        messages: [{ role: "user", content: "hi" }],
        systemPrompts: ["你是助手"],
        modelOptions: { temperature: 0.7, max_tokens: 4096 },
        threadId: "t1",
        runId: "r1",
      }),
    );
  });

  it("流消费完毕后记一次成功的外部调用", async () => {
    mockGetAiAdapter.mockResolvedValue(mockAdapter);
    mockChat.mockResolvedValue(fromArray(["块1"]));

    const stream = await streamAiChat({
      messages: [{ role: "user", content: "hi" }],
      providerId: "deepseek",
    });
    await collect(stream);

    expect(mockInc).toHaveBeenCalledWith({ system: "ai", outcome: "success" });
    expect(mockObserve).toHaveBeenCalled();
  });

  it("流内抛错时记失败并原样抛出", async () => {
    mockGetAiAdapter.mockResolvedValue(mockAdapter);
    async function* failing(): AsyncGenerator<string> {
      yield "块1";
      throw new Error("上游断流");
    }
    mockChat.mockResolvedValue(failing());

    const stream = await streamAiChat({
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(collect(stream)).rejects.toThrow("上游断流");

    expect(mockInc).toHaveBeenCalledWith({ system: "ai", outcome: "error" });
  });

  it("不传 providerId/systemPrompts/threadId/runId 时透传 undefined", async () => {
    mockGetAiAdapter.mockResolvedValue(mockAdapter);
    mockChat.mockResolvedValue({} as never);

    await streamAiChat({ messages: [{ role: "user", content: "hi" }] });

    expect(mockGetAiAdapter).toHaveBeenCalledWith(undefined);
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompts: undefined,
        threadId: undefined,
        runId: undefined,
      }),
    );
  });
});

describe("completeText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAiAdapter.mockReset();
  });

  it("未配置时抛友好错误", async () => {
    mockGetAiAdapter.mockResolvedValue(null);
    await expect(completeText({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      "AI 客户端未配置",
    );
  });

  it("以 stream: false 调用并返回完整文本（透传 providerId）", async () => {
    mockGetAiAdapter.mockResolvedValue(mockAdapter);
    // @tanstack/ai 0.69 起 chat({ stream: false }) 返回 ChatResult（含 text 与 chunks），不再是裸字符串
    mockChat.mockResolvedValue({ text: "译文内容", chunks: [] });

    const result = await completeText({
      messages: [{ role: "user", content: "请翻译" }],
      providerId: "moonshot",
      modelOptions: { temperature: 0.3 },
    });

    expect(mockGetAiAdapter).toHaveBeenCalledWith("moonshot");
    expect(result).toBe("译文内容");
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: mockAdapter,
        messages: [{ role: "user", content: "请翻译" }],
        modelOptions: { temperature: 0.3 },
        stream: false,
      }),
    );
  });

  it("成功与失败都计入外部调用指标", async () => {
    mockGetAiAdapter.mockResolvedValue(mockAdapter);
    mockChat.mockResolvedValue({ text: "译文内容", chunks: [] });

    await completeText({ messages: [{ role: "user", content: "hi" }] });
    expect(mockInc).toHaveBeenCalledWith({ system: "ai", outcome: "success" });

    mockChat.mockRejectedValue(new Error("上游 500"));
    await expect(completeText({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      "上游 500",
    );
    expect(mockInc).toHaveBeenLastCalledWith({
      system: "ai",
      outcome: "error",
    });
  });
});
