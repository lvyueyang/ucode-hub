/**
 * 邮件发送模块测试：发送成功/失败、验证码邮件模板（getConfig / 外部调用观测直接 mock）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendMail, mockGetConfig, mockLogger, mockLogExternalRequest } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockGetConfig: vi.fn(),
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
  mockLogExternalRequest: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({
    sendMail: mockSendMail,
  })),
}));
vi.mock("#/shared-services/config/config.server", () => ({
  getConfig: mockGetConfig,
}));
vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));
vi.mock("#/shared-services/external-observability", () => ({
  logExternalRequest: mockLogExternalRequest,
}));

import { sendCaptchaMail, sendMail } from "../index";

function mockFullConfig(): void {
  mockGetConfig.mockImplementation((key: string) => {
    const map: Record<string, string> = {
      smtp_host: "smtp.test.com",
      smtp_port: "587",
      smtp_secure: "false",
      smtp_user: "test-user",
      smtp_pass: "test-pass",
      smtp_from: "noreply@test.com",
    };
    return map[key] ?? "";
  });
}

describe("sendMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReset();
    mockFullConfig();
  });

  it("发送成功返回 true", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "msg-1" });
    const result = await sendMail({
      to: "user@test.com",
      subject: "测试邮件",
      html: "<p>Hello</p>",
    });
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "测试邮件",
        html: "<p>Hello</p>",
      }),
    );
  });

  it("发送失败返回 false（不抛异常）", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("连接失败"));
    const result = await sendMail({
      to: "user@test.com",
      subject: "测试",
      html: "<p>Test</p>",
    });
    expect(result).toBe(false);
  });

  it("SMTP 未配置时跳过发送返回 false", async () => {
    mockGetConfig.mockResolvedValue("");
    const result = await sendMail({
      to: "user@test.com",
      subject: "测试",
      html: "<p>Test</p>",
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("成功与失败都经 logExternalRequest 记外部调用（不在本层另打日志）", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "msg-9" });
    await sendMail({
      to: "user@test.com",
      subject: "测试",
      html: "<p>Test</p>",
    });
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ system: "mail", success: true }),
    );

    mockSendMail.mockRejectedValueOnce(new Error("连接失败"));
    await sendMail({
      to: "user@test.com",
      subject: "测试",
      html: "<p>Test</p>",
    });
    expect(mockLogExternalRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ system: "mail", success: false }),
    );
    // 调用结果已由 logExternalRequest 统一承载（成功 debug / 失败 warn），本层不再重复上报
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("SMTP 未配置跳过时不计入外部调用", async () => {
    mockGetConfig.mockResolvedValue("");
    await sendMail({
      to: "user@test.com",
      subject: "测试",
      html: "<p>Test</p>",
    });
    expect(mockLogExternalRequest).not.toHaveBeenCalled();
  });
});

describe("sendCaptchaMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReset();
    mockFullConfig();
  });

  it("HTML 模板包含验证码", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "msg-2" });
    const result = await sendCaptchaMail("user@test.com", "123456");
    expect(result).toBe(true);
    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.html).toContain("123456");
    expect(callArgs.subject).toBe("验证码");
  });

  it("委托 sendMail 发送", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "msg-3" });
    await sendCaptchaMail("user@test.com", "888888");
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});
