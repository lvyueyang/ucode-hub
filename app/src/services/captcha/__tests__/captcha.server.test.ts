/**
 * 验证码模块测试：发送 + 校验
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { mockSendCaptchaMail } = vi.hoisted(() => ({
  mockSendCaptchaMail: vi.fn(),
}));
vi.mock("#/shared-services/mail", () => ({
  sendCaptchaMail: mockSendCaptchaMail,
}));

const { mockSendSms } = vi.hoisted(() => ({
  mockSendSms: vi.fn(),
}));
vi.mock("#/shared-services/sms", () => ({ sendSms: mockSendSms }));

const { mockCreateCaptcha } = vi.hoisted(() => ({
  mockCreateCaptcha: vi.fn(),
}));
vi.mock("../captcha", () => ({ create: mockCreateCaptcha }));

const { mockDb, mockRows, mockUpdateSet } = vi.hoisted(() => {
  const rows = vi.fn().mockResolvedValue([]);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
  };
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: (value: unknown) => unknown) => rows().then(onFulfilled),
  });
  // update 的 set 入参是「置 used / 累加 attempts / 两者同时」三种语义的落点，单独暴露供断言
  const updateSet = vi.fn(() => ({ where: vi.fn() }));
  return {
    mockRows: rows,
    mockUpdateSet: updateSet,
    mockDb: {
      select: vi.fn(() => chain),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import {
  createImageCaptcha,
  sendCaptcha,
  verifyCaptcha,
  verifyImageCaptcha,
} from "#/services/captcha/captcha.server";

describe("sendCaptcha", () => {
  beforeEach(() => vi.clearAllMocks());

  it("首次发送成功", async () => {
    mockRows.mockResolvedValue([]);
    mockSendCaptchaMail.mockResolvedValue(true);

    const result = await sendCaptcha("email", "user@test.com");
    expect(result.success).toBe(true);
    expect(result.message).toBe("验证码已发送");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("发新码前先作废该 target 未用的旧码", async () => {
    mockRows.mockResolvedValue([]);
    mockSendCaptchaMail.mockResolvedValue(true);

    await sendCaptcha("email", "user@test.com");

    expect(mockUpdateSet).toHaveBeenCalledWith({ used: true });
    // 作废必须早于写入新码，否则新码会被自己的作废语句命中
    expect(mockUpdateSet.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.insert.mock.invocationCallOrder[0],
    );
  });

  it("60 秒内重复发送被拦截", async () => {
    mockRows.mockResolvedValue([{ id: "recent" }]);

    const result = await sendCaptcha("email", "user@test.com");
    expect(result.success).toBe(false);
    expect(result.message).toBe("发送过于频繁，请稍后再试");
  });

  it("邮件发送失败返回 false", async () => {
    mockRows.mockResolvedValue([]);
    mockSendCaptchaMail.mockResolvedValue(false);

    const result = await sendCaptcha("email", "user@test.com");
    expect(result.success).toBe(false);
    expect(result.message).toBe("邮件发送失败");
  });
});

describe("verifyCaptcha", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正确验证码返回 true 并标记已使用", async () => {
    // 查询只按 type / target / 未用 / 未过期筛，码值在 JS 里比对
    mockRows.mockResolvedValue([{ id: "cap-1", code: "123456", attempts: 0 }]);

    const result = await verifyCaptcha("email", "u@t.com", "123456");

    expect(result).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith({ used: true });
  });

  it("错误验证码返回 false 并累加失败次数（未达上限不作废）", async () => {
    mockRows.mockResolvedValue([{ id: "cap-1", code: "123456", attempts: 0 }]);

    const result = await verifyCaptcha("email", "u@t.com", "000000");

    expect(result).toBe(false);
    expect(mockUpdateSet).toHaveBeenCalledWith({ attempts: 1 });
    expect(mockUpdateSet).not.toHaveBeenCalledWith({ used: true });
  });

  it("错误满 5 次即作废该码，之后即使码对也校验失败", async () => {
    // attempts 已到 4，再错一次就触顶
    mockRows.mockResolvedValue([{ id: "cap-1", code: "123456", attempts: 4 }]);

    expect(await verifyCaptcha("email", "u@t.com", "000000")).toBe(false);
    expect(mockUpdateSet).toHaveBeenCalledWith({ attempts: 5, used: true });

    // 该行 used 已为 true，查询条件（used = false）不再命中，正确码也拿不到记录
    mockRows.mockResolvedValue([]);
    expect(await verifyCaptcha("email", "u@t.com", "123456")).toBe(false);
  });

  it("没有未用且未过期的码时返回 false，且不写失败次数", async () => {
    mockRows.mockResolvedValue([]);

    const result = await verifyCaptcha("email", "u@t.com", "000000");

    expect(result).toBe(false);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});

describe("sendCaptcha（短信路径）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("短信发送成功返回成功", async () => {
    mockRows.mockResolvedValue([]);
    mockSendSms.mockResolvedValue(undefined);

    const result = await sendCaptcha("sms", "13800138000");

    expect(result.success).toBe(true);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("短信发送抛错时返回失败并带出错误信息", async () => {
    mockRows.mockResolvedValue([]);
    mockSendSms.mockRejectedValue(new Error("短信通道异常"));

    const result = await sendCaptcha("sms", "13800138000");

    expect(result.success).toBe(false);
    expect(result.message).toBe("短信通道异常");
  });
});

describe("createImageCaptcha", () => {
  beforeEach(() => vi.clearAllMocks());

  it("生成 SVG 并落库，验证码转小写", async () => {
    mockCreateCaptcha.mockReturnValue({ data: "<svg>...</svg>", text: "AbCd" });
    const valuesMock = vi.fn();
    mockDb.insert.mockReturnValue({ values: valuesMock });

    const result = await createImageCaptcha();

    expect(result.svg).toBe("<svg>...</svg>");
    expect(result.token).toBeTruthy();
    const values = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({
      type: "image",
      code: "abcd",
    });
    expect(values.expiredAt).toBeInstanceOf(Date);
  });
});

describe("verifyImageCaptcha", () => {
  beforeEach(() => vi.clearAllMocks());

  it("校验通过时返回 true 并标记已使用", async () => {
    mockRows.mockResolvedValue([{ id: "img-1" }]);

    const result = await verifyImageCaptcha("token-1", "aBcD");

    expect(result).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("大小写与空格归一后仍可校验通过", async () => {
    mockRows.mockResolvedValue([{ id: "img-1" }]);

    const result = await verifyImageCaptcha("token-1", "  ABCD  ");

    expect(result).toBe(true);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("验证码不存在时返回 false", async () => {
    mockRows.mockResolvedValue([]);

    const result = await verifyImageCaptcha("token-1", "XXXX");

    expect(result).toBe(false);
  });
});
