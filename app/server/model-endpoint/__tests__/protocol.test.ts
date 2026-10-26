/**
 * 模型端点协议侧测试：请求体收窄、厂商 / 模型解析、上游载荷构造、usage 抽取、模型清单与错误体规范化
 * 全部为纯函数，不连网络也不连 DB。
 */
import { describe, expect, it } from "vitest";

import type { AiProviderView } from "#/shared-services/ai/ai.schemas";

import {
  buildCompletionsUrl,
  buildUpstreamBody,
  buildUpstreamHeaders,
  normalizeErrorBody,
  parseChatCompletionRequest,
  readUsage,
  resolveCompletionTarget,
  toModelList,
} from "../protocol";

/** 厂商替身：只填协议侧会读的字段 */
const provider = (overrides: Partial<AiProviderView> = {}): AiProviderView => ({
  id: "deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "sk-x",
  models: [{ id: "deepseek-chat", default: true }],
  ...overrides,
});

const messages = [{ role: "user", content: "你好" }];

describe("parseChatCompletionRequest", () => {
  it("留下原始字段，抽出 model 与 stream", () => {
    const parsed = parseChatCompletionRequest({
      model: " deepseek-chat ",
      messages,
      stream: true,
      temperature: 0.2,
    });

    expect(parsed).toEqual({
      raw: { model: " deepseek-chat ", messages, stream: true, temperature: 0.2 },
      model: "deepseek-chat",
      stream: true,
    });
  });

  it("stream 非 true 时按非流式处理", () => {
    expect(parseChatCompletionRequest({ messages, stream: "true" })?.stream).toBe(false);
  });

  it("model 缺失或去空白后为空时视为未指定", () => {
    expect(parseChatCompletionRequest({ messages })?.model).toBeUndefined();
    expect(parseChatCompletionRequest({ messages, model: "   " })?.model).toBeUndefined();
  });

  it("messages 非非空数组一律拒绝", () => {
    expect(parseChatCompletionRequest({ messages: [] })).toBeNull();
    expect(parseChatCompletionRequest({ messages: "hi" })).toBeNull();
    expect(parseChatCompletionRequest({ model: "x" })).toBeNull();
    expect(parseChatCompletionRequest(null)).toBeNull();
    expect(parseChatCompletionRequest([{ role: "user" }])).toBeNull();
  });
});

describe("resolveCompletionTarget", () => {
  it("请求模型命中某厂商清单时用它", () => {
    const target = resolveCompletionTarget([provider()], "deepseek-chat");
    expect(target?.provider.id).toBe("deepseek");
    expect(target?.model).toBe("deepseek-chat");
  });

  it("模型没命中任何清单时回落默认厂商并原样转发模型", () => {
    const target = resolveCompletionTarget([provider()], "upstream-new-model");
    expect(target?.provider.id).toBe("deepseek");
    expect(target?.model).toBe("upstream-new-model");
  });

  it("多厂商时优先取 default 厂商，未标记则取首个", () => {
    const first = provider({ id: "a", default: undefined });
    const second = provider({ id: "b", default: true });
    expect(resolveCompletionTarget([first, second])?.provider.id).toBe("b");
    expect(resolveCompletionTarget([first])?.provider.id).toBe("a");
  });

  it("未指定模型时取厂商默认模型，无默认取首个", () => {
    const multi = provider({
      models: [{ id: "m1" }, { id: "m2", default: true }],
    });
    expect(resolveCompletionTarget([multi])?.model).toBe("m2");
    expect(resolveCompletionTarget([provider({ models: [{ id: "only" }] })])?.model).toBe("only");
  });

  it("无可用厂商（缺地址 / 密钥）或厂商无模型时返回 null", () => {
    expect(resolveCompletionTarget([])).toBeNull();
    expect(resolveCompletionTarget([provider({ apiKey: "" })])).toBeNull();
    expect(resolveCompletionTarget([provider({ baseUrl: "" })])).toBeNull();
    expect(resolveCompletionTarget([provider({ models: [] })])).toBeNull();
  });
});

describe("buildCompletionsUrl / buildUpstreamHeaders", () => {
  it("baseUrl 带不带 /v1 都拼成同一路径", () => {
    expect(buildCompletionsUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(buildCompletionsUrl("https://api.deepseek.com/v1/")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(buildCompletionsUrl("https://gw.example.com/openai")).toBe(
      "https://gw.example.com/openai/chat/completions",
    );
  });

  it("上游凭证只取厂商密钥，不转发调用方的头", () => {
    expect(buildUpstreamHeaders("sk-x")).toEqual({
      authorization: "Bearer sk-x",
      "content-type": "application/json",
    });
  });
});

describe("buildUpstreamBody", () => {
  const request = { raw: { messages, temperature: 0.2 }, model: "m", stream: true };
  const target = { provider: provider(), model: "deepseek-chat" };

  it("改写 model 与 stream，未知字段原样透传", () => {
    const body = buildUpstreamBody({ ...request, stream: false }, target);
    expect(body).toEqual({ messages, temperature: 0.2, model: "deepseek-chat", stream: false });
  });

  it("流式注入 stream_options.include_usage", () => {
    const body = buildUpstreamBody(request, target);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("已带 stream_options 时合并而不是覆盖", () => {
    const body = buildUpstreamBody(
      { ...request, raw: { ...request.raw, stream_options: { custom: 1 } } },
      target,
    );
    expect(body.stream_options).toEqual({ custom: 1, include_usage: true });
  });

  it("stream_options 形态非法时按缺省重建", () => {
    const body = buildUpstreamBody({ ...request, raw: { messages, stream_options: "x" } }, target);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});

describe("readUsage", () => {
  it("读取三项 token", () => {
    expect(
      readUsage({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }),
    ).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("只给了部分字段时其余留 null", () => {
    expect(readUsage({ usage: { total_tokens: 30 } })).toEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: 30,
    });
  });

  it("缺 usage、全空、非数字值都视为拿不到", () => {
    expect(readUsage({})).toBeNull();
    expect(readUsage({ usage: {} })).toBeNull();
    expect(readUsage({ usage: "x" })).toBeNull();
    expect(readUsage({ usage: { total_tokens: "30" } })).toBeNull();
    expect(readUsage(null)).toBeNull();
  });
});

describe("toModelList", () => {
  it("汇总已配置厂商的模型，跳过不可用户商", () => {
    const items = toModelList(
      [
        provider({ models: [{ id: "a" }, { id: "b" }] }),
        provider({ id: "disabled", apiKey: "", models: [{ id: "c" }] }),
      ],
      1_700_000_000_000,
    );

    expect(items).toEqual([
      { id: "a", object: "model", created: 1_700_000_000, owned_by: "DeepSeek" },
      { id: "b", object: "model", created: 1_700_000_000, owned_by: "DeepSeek" },
    ]);
  });

  it("多厂商同名模型只报一次（转发时命中靠前的那个）", () => {
    const items = toModelList([
      provider({ id: "a", name: "A", models: [{ id: "same" }] }),
      provider({ id: "b", name: "B", models: [{ id: "same" }] }),
    ]);
    expect(items).toEqual([
      { id: "same", object: "model", created: expect.any(Number), owned_by: "A" },
    ]);
  });
});

describe("normalizeErrorBody", () => {
  it("上游本来就是 { error } 时原样透传", () => {
    const body = '{"error":{"message":"invalid api key","type":"auth_error"}}';
    expect(normalizeErrorBody(body, 401)).toBe(body);
  });

  it("纯文本错误体包一层 OpenAI 错误结构", () => {
    expect(JSON.parse(normalizeErrorBody("upstream boom", 502))).toEqual({
      error: { message: "upstream boom", type: "upstream_error" },
    });
  });

  it("空错误体给状态码兜底文案", () => {
    expect(JSON.parse(normalizeErrorBody("", 429))).toEqual({
      error: { message: "上游返回 HTTP 429", type: "upstream_error" },
    });
  });
});
