/**
 * 定时任务调度器测试：注册、停止、防重复、runOnInit 等
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger, mockCronStop, capturedOnTicks } = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
  mockCronStop: vi.fn(),
  capturedOnTicks: [] as Array<() => void>,
}));

vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));

vi.mock("cron", () => ({
  CronJob: {
    from: vi.fn((opts: { onTick: () => void }) => {
      capturedOnTicks.push(opts.onTick);
      return { stop: mockCronStop };
    }),
  },
  CronTime: {
    validateCronExpression: vi.fn((expr: string) => ({
      valid: expr.trim().split(/\s+/).length >= 5 && expr !== "invalid",
      error: expr === "invalid" ? new Error("校验失败") : undefined,
    })),
  },
}));

import { CronJob } from "cron";
import { getTaskNames, registerTask, stopAllTasks, stopTask } from "../index";

describe("registerTask", () => {
  const mockCronFrom = vi.mocked(CronJob.from);

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnTicks.length = 0;
    stopAllTasks();
  });

  afterEach(() => {
    stopAllTasks();
  });

  it("注册成功后将任务加入 getTaskNames", () => {
    registerTask({
      name: "test-task",
      cronExpression: "0 * * * *",
      handler: async () => {},
    });
    expect(getTaskNames()).toContain("test-task");
    expect(mockCronFrom).toHaveBeenCalled();
  });

  it("无效 cron 表达式不注册", () => {
    registerTask({
      name: "bad-task",
      cronExpression: "invalid",
      handler: async () => {},
    });
    expect(getTaskNames()).not.toContain("bad-task");
    expect(mockCronFrom).not.toHaveBeenCalled();
  });

  it("重复注册同名任务跳过", () => {
    const handler = vi.fn();
    registerTask({
      name: "dup-task",
      cronExpression: "0 * * * *",
      handler,
    });
    registerTask({
      name: "dup-task",
      cronExpression: "0 * * * *",
      handler,
    });
    expect(mockCronFrom).toHaveBeenCalledTimes(1);
  });

  it("默认使用 Asia/Shanghai 时区", () => {
    registerTask({
      name: "tz-default",
      cronExpression: "0 3 * * *",
      handler: async () => {},
    });
    expect(mockCronFrom).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: "Asia/Shanghai" }),
    );
  });

  it("自定义 timeZone 时透传给 CronJob", () => {
    registerTask({
      name: "tz-custom",
      cronExpression: "0 3 * * *",
      handler: async () => {},
      timeZone: "UTC",
    });
    expect(mockCronFrom).toHaveBeenCalledWith(expect.objectContaining({ timeZone: "UTC" }));
  });

  it("runOnInit 时模拟 CronJob 立即执行 handler", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerTask({
      name: "init-task",
      cronExpression: "0 * * * *",
      handler,
      runOnInit: true,
    });
    // runOnInit 标志透传给 CronJob
    expect(mockCronFrom).toHaveBeenCalledWith(
      expect.objectContaining({ runOnInit: true, name: "init-task" }),
    );
    // 模拟 CronJob 在 runOnInit 时调用 onTick
    capturedOnTicks[0]();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.anything(), "定时任务执行完成"),
    );
    // 正常 tick 不写 info，避免高频任务刷屏
    expect(mockLogger.info).not.toHaveBeenCalledWith(expect.anything(), "定时任务执行完成");
  });

  it("handler 异常被捕获并记录错误日志，不影响注册", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("失败"));
    registerTask({
      name: "error-task",
      cronExpression: "0 * * * *",
      handler,
    });
    expect(getTaskNames()).toContain("error-task");
    // 模拟 CronJob 触发 onTick，handler 抛错被 catch
    capturedOnTicks[0]();
    await vi.waitFor(() =>
      expect(mockLogger.error).toHaveBeenCalledWith(expect.anything(), "定时任务执行失败"),
    );
    expect(getTaskNames()).toContain("error-task");
  });
});

describe("stopTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAllTasks();
  });

  afterEach(() => {
    stopAllTasks();
  });

  it("停止已注册任务", () => {
    registerTask({
      name: "stop-me",
      cronExpression: "0 * * * *",
      handler: async () => {},
    });
    stopTask("stop-me");
    expect(getTaskNames()).not.toContain("stop-me");
    expect(mockCronStop).toHaveBeenCalled();
  });

  it("停止不存在的任务不抛异常", () => {
    expect(() => stopTask("不存在")).not.toThrow();
  });
});

describe("stopAllTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAllTasks();
  });

  afterEach(() => {
    stopAllTasks();
  });

  it("停止所有任务并清空", () => {
    registerTask({
      name: "task-a",
      cronExpression: "0 * * * *",
      handler: async () => {},
    });
    registerTask({
      name: "task-b",
      cronExpression: "0 * * * *",
      handler: async () => {},
    });
    stopAllTasks();
    expect(getTaskNames()).toEqual([]);
  });
});
