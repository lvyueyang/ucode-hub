/**
 * 通知外发渠道测试：webhook 变体 payload / 签名、渠道分发、短信占位
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogExternalRequest } = vi.hoisted(() => ({
  mockLogExternalRequest: vi.fn(),
}));

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("#/shared-services/external-observability", () => ({
  logExternalRequest: mockLogExternalRequest,
}));
vi.mock("#/shared-services/mail", () => ({
  sendMail: vi.fn().mockResolvedValue(true),
}));

import { sendMail } from "#/shared-services/mail";
import { sendNotificationChannel } from "../index";
import { sendWebhook } from "../webhook";

const payload = { title: "标题", content: "内容" };

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn();
});

describe("sendWebhook", () => {
  it("飞书变体返回成功", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const result = await sendWebhook(
      "https://open.feishu.cn/open-apis/bot/v2/hook/x",
      undefined,
      "feishu",
      payload,
    );
    expect(result.ok).toBe(true);
    expect(formBody()).toMatchObject({ msg_type: "text" });
  });

  it("钉钉带签名时使用毫秒时间戳并附加 timestamp/sign", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    await sendWebhook(
      "https://oapi.dingtalk.com/robot/send?access_token=t",
      "secret",
      "dingtalk",
      payload,
    );
    expect(callUrl()).toContain("timestamp=");
    expect(callUrl()).toContain("sign=");
    // 钉钉 timestamp 为毫秒级（13 位），区别于飞书/企微的秒级（10 位）
    const ts = /timestamp=(\d+)/.exec(callUrl())?.[1];
    expect(ts?.length).toBe(13);
  });

  it("通用变体含 secret 时放入 X-Signature 头", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    await sendWebhook("https://example.com/hook", "mysecret", "generic", payload);
    expect(callHeaders()["X-Signature"]).toBe("mysecret");
  });

  it("非 2xx 返回失败", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    const result = await sendWebhook("https://example.com/hook", undefined, "generic", payload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("成功与失败都经 logExternalRequest 记外部调用（不回传 webhook URL）", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    await sendWebhook(
      "https://example.com/hook?access_token=secret",
      undefined,
      "generic",
      payload,
    );
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        system: "webhook",
        success: true,
        extra: { variant: "generic" },
      }),
    );

    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network"),
    );
    await sendWebhook(
      "https://example.com/hook?access_token=secret",
      undefined,
      "generic",
      payload,
    );
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        system: "webhook",
        success: false,
        error: "network",
      }),
    );
  });
});

describe("sendNotificationChannel", () => {
  it("email 渠道复用 mail", async () => {
    const result = await sendNotificationChannel({
      channel: "email",
      value: "a@b.com",
      title: payload.title,
      content: payload.content,
    });
    expect(result.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", subject: payload.title }),
    );
  });

  it("sms 渠道占位返回未实现", async () => {
    const result = await sendNotificationChannel({
      channel: "sms",
      value: "13800000000",
      title: payload.title,
      content: payload.content,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("未实现");
  });

  it("webhook 走 webhook 发送器", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const result = await sendNotificationChannel({
      channel: "webhook",
      value: "https://example.com/hook",
      title: payload.title,
      content: payload.content,
    });
    expect(result.ok).toBe(true);
  });
});

/** 辅助：读取 fetch 调用参数 */
function callArgs() {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls[0];
}
function callUrl() {
  return callArgs()[0];
}
function callHeaders() {
  return callArgs()[1]?.headers ?? {};
}
function formBody() {
  return JSON.parse(callArgs()[1]?.body as string);
}
