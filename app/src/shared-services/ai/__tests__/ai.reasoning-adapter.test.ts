/**
 * 推理内容提取测试：extractReasoningData 兼容各厂商思考增量字段，
 * 并通过真实适配器 chatStream 端到端验证 REASONING_* 事件产出
 */
import { describe, expect, it, vi } from "vitest";
import { extractReasoningData, ReasoningCompatibleChatAdapter } from "../ai.reasoning-adapter";

/** 构造一个 OpenAI 兼容 Chat Completions 流式 chunk */
function chunk(delta: Record<string, unknown> | undefined): unknown {
  return { choices: [{ delta }] };
}

describe("extractReasoningData", () => {
  it("解析 delta.reasoning_content（DeepSeek/Qwen/Moonshot）", () => {
    expect(extractReasoningData(chunk({ reasoning_content: "先拆解需求" }))).toEqual({
      text: "先拆解需求",
    });
  });

  it("解析 delta.reasoning（OpenRouter 等）", () => {
    expect(extractReasoningData(chunk({ reasoning: "思考中" }))).toEqual({
      text: "思考中",
    });
  });

  it("解析 delta.reasoning_details", () => {
    expect(extractReasoningData(chunk({ reasoning_details: "推理细节" }))).toEqual({
      text: "推理细节",
    });
  });

  it("reasoning_content 优先于 reasoning", () => {
    expect(
      extractReasoningData(chunk({ reasoning_content: "主字段", reasoning: "次字段" })),
    ).toEqual({ text: "主字段" });
  });

  it("对象形态（{ content } / { text }）也能提取", () => {
    expect(extractReasoningData(chunk({ reasoning: { content: "对象思考" } }))).toEqual({
      text: "对象思考",
    });
    expect(extractReasoningData(chunk({ reasoning: { text: "文本思考" } }))).toEqual({
      text: "文本思考",
    });
  });

  it("非推理模型/空增量返回 undefined", () => {
    expect(extractReasoningData(chunk({ content: "正常文本" }))).toBeUndefined();
    expect(extractReasoningData(chunk(undefined))).toBeUndefined();
    expect(extractReasoningData(chunk({ reasoning_content: "  " }))).toBeUndefined();
    expect(extractReasoningData(chunk({ reasoning: "" }))).toBeUndefined();
    expect(extractReasoningData(chunk({ reasoning: 123 }))).toBeUndefined();
  });
});

describe("ReasoningCompatibleChatAdapter.chatStream", () => {
  /** 构造一个 OpenAI Chat Completions 流式 chunk */
  function sseChunk(delta: Record<string, unknown>, finishReason?: string) {
    return {
      id: "c1",
      object: "chat.completion.chunk",
      model: "deepseek-reasoner",
      choices: [{ index: 0, delta, finish_reason: finishReason ?? null }],
      usage: null,
    };
  }

  /** 构造一个把 create 返回 chunks 的假 OpenAI client */
  function makeClient(chunks: unknown[]) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(chunks),
        },
      },
    } as never;
  }

  // 仅记录 processStreamChunks 用到的日志字段
  const logger = {
    request: vi.fn(),
    provider: vi.fn(),
    errors: vi.fn(),
  } as never;

  it("注入 reasoning_content 增量时产出 REASONING_START / REASONING_MESSAGE_CONTENT 事件", async () => {
    const client = makeClient([
      sseChunk({ reasoning_content: "先分析需求" }),
      sseChunk({ content: "最终答案" }, "stop"),
    ]);
    const adapter = new ReasoningCompatibleChatAdapter(client, "deepseek-reasoner", "deepseek");

    const chunks: Array<{ type: string; delta?: string }> = [];
    for await (const chunk of adapter.chatStream({
      model: "deepseek-reasoner",
      messages: [{ role: "user", content: "做个页面" }],
      logger,
    })) {
      chunks.push(chunk as { type: string; delta?: string });
    }

    // 思考阶段事件被产出
    expect(chunks.find((c) => c.type === "REASONING_START")).toBeDefined();
    const reasoning = chunks.find((c) => c.type === "REASONING_MESSAGE_CONTENT");
    expect(reasoning?.delta).toBe("先分析需求");
    // 正文仍正常流式
    const text = chunks.find((c) => c.type === "TEXT_MESSAGE_CONTENT");
    expect(text?.delta).toBe("最终答案");
  });

  it("非推理模型 chunk（无 reasoning_content）不产出 REASONING 事件", async () => {
    const client = makeClient([sseChunk({ content: "你好" }, "stop")]);
    const adapter = new ReasoningCompatibleChatAdapter(client, "chat", "deepseek");

    const chunks: Array<{ type: string }> = [];
    for await (const chunk of adapter.chatStream({
      model: "chat",
      messages: [{ role: "user", content: "hi" }],
      logger,
    })) {
      chunks.push(chunk as { type: string });
    }

    expect(chunks.some((c) => c.type.startsWith("REASONING"))).toBe(false);
    expect(chunks.some((c) => c.type === "TEXT_MESSAGE_CONTENT")).toBe(true);
  });
});
