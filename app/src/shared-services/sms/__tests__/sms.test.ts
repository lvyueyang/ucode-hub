/**
 * 短信发送模块测试：配置读取、服务商分发、发送成功/失败（getConfig / logger 直接 mock）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetConfig, mockLogger, mockSendSms, mockLogExternalRequest } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
  mockSendSms: vi.fn(),
  mockLogExternalRequest: vi.fn(),
}));

vi.mock("#/shared-services/config/config.server", () => ({
  getConfig: mockGetConfig,
}));
vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));
vi.mock("#/shared-services/external-observability", () => ({
  logExternalRequest: mockLogExternalRequest,
}));

vi.mock("@alicloud/openapi-client", () => ({
  Config: vi.fn(),
}));

vi.mock("@alicloud/dysmsapi20170525", () => ({
  __esModule: true,
  default: class {
    sendSms = mockSendSms;
  },
  SendSmsRequest: vi.fn(),
}));

import { sendSms } from "../index";

describe("sendSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReset();
  });

  it("未配置短信服务商时抛出异常", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(sendSms("13800138000", "123456")).rejects.toThrow("短信服务未配置");
  });

  it("不支持的服务商时抛出异常", async () => {
    mockGetConfig.mockResolvedValue("unknown");

    await expect(sendSms("13800138000", "123456")).rejects.toThrow("不支持的短信服务商");
  });

  it("阿里云未配置 AccessKey 时抛出异常", async () => {
    mockGetConfig.mockImplementation((key: string) => {
      if (key === "sms_provider") return "aliyun";
      return "";
    });

    await expect(sendSms("13800138000", "123456")).rejects.toThrow("阿里云短信未配置");
  });

  it("阿里云短信发送成功", async () => {
    mockGetConfig.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        sms_provider: "aliyun",
        sms_aliyun_access_key_id: "test-id",
        sms_aliyun_access_key_secret: "test-secret",
        sms_aliyun_sign_name: "测试签名",
        sms_aliyun_template_code: "SMS_12345",
      };
      return map[key] ?? "";
    });
    mockSendSms.mockResolvedValue({ body: { code: "OK" } });

    await expect(sendSms("13800138000", "123456")).resolves.toBeUndefined();
  });

  it("发送成功经 logExternalRequest 记成功（手机号脱敏、不在本层另打 info）", async () => {
    mockGetConfig.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        sms_provider: "aliyun",
        sms_aliyun_access_key_id: "test-id",
        sms_aliyun_access_key_secret: "test-secret",
        sms_aliyun_sign_name: "测试签名",
        sms_aliyun_template_code: "SMS_12345",
      };
      return map[key] ?? "";
    });
    mockSendSms.mockResolvedValue({ body: { code: "OK" } });

    await sendSms("13800138000", "123456");

    expect(mockLogExternalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "sms",
        success: true,
        extra: expect.objectContaining({ phone: "138****8000" }),
      }),
    );
    // 只针对发送结果断言：客户端初始化等合法 info 不应被误伤（也不能声明「本层无任何 info」）
    expect(mockLogger.info).not.toHaveBeenCalledWith(expect.anything(), "短信发送成功");
  });

  it("API 返回错误码时记失败并抛出", async () => {
    mockGetConfig.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        sms_provider: "aliyun",
        sms_aliyun_access_key_id: "test-id",
        sms_aliyun_access_key_secret: "test-secret",
        sms_aliyun_sign_name: "测试签名",
        sms_aliyun_template_code: "SMS_12345",
      };
      return map[key] ?? "";
    });
    mockSendSms.mockResolvedValue({
      body: { code: "isv.BUSINESS_LIMIT_CONTROL", message: "触发业务限流" },
    });

    await expect(sendSms("13800138000", "123456")).rejects.toThrow("阿里云短信: 触发业务限流");
    expect(mockLogExternalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "sms",
        success: false,
        error: "阿里云短信: 触发业务限流",
      }),
    );
  });

  it("服务商未配置等前置校验失败时不计入外部调用", async () => {
    mockGetConfig.mockResolvedValue("");
    await expect(sendSms("13800138000", "123456")).rejects.toThrow("短信服务未配置");
    expect(mockLogExternalRequest).not.toHaveBeenCalled();
  });

  it("阿里云短信 API 返回错误码时抛出异常", async () => {
    mockGetConfig.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        sms_provider: "aliyun",
        sms_aliyun_access_key_id: "test-id",
        sms_aliyun_access_key_secret: "test-secret",
        sms_aliyun_sign_name: "测试签名",
        sms_aliyun_template_code: "SMS_12345",
      };
      return map[key] ?? "";
    });
    mockSendSms.mockResolvedValue({
      body: { code: "isv.BUSINESS_LIMIT_CONTROL", message: "触发业务限流" },
    });

    await expect(sendSms("13800138000", "123456")).rejects.toThrow("阿里云短信: 触发业务限流");
  });

  it("短信签名未配置时抛出异常", async () => {
    mockGetConfig.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        sms_provider: "aliyun",
        sms_aliyun_access_key_id: "test-id",
        sms_aliyun_access_key_secret: "test-secret",
        sms_aliyun_sign_name: "",
        sms_aliyun_template_code: "SMS_12345",
      };
      return map[key] ?? "";
    });

    await expect(sendSms("13800138000", "123456")).rejects.toThrow("短信签名未配置");
  });
});
