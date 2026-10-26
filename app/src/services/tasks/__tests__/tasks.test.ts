/**
 * 定时任务注册测试：验证注册配置正确且 handler 逻辑真实执行
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRegisterTask } = vi.hoisted(() => ({ mockRegisterTask: vi.fn() }));
vi.mock("#/shared-services/scheduler", () => ({
  registerTask: mockRegisterTask,
}));

const { mockCleanExpiredFiles, mockCleanExpiredLogs } = vi.hoisted(() => ({
  mockCleanExpiredFiles: vi.fn(),
  mockCleanExpiredLogs: vi.fn(),
}));

vi.mock("#/services/file/file.server", () => ({
  cleanExpiredFiles: mockCleanExpiredFiles,
}));

vi.mock("#/services/logs/logs-cleanup.server", () => ({
  cleanExpiredLogs: mockCleanExpiredLogs,
}));

const { mockSampleSystemMetric, mockCleanupSystemMetrics } = vi.hoisted(() => ({
  mockSampleSystemMetric: vi.fn(),
  mockCleanupSystemMetrics: vi.fn(),
}));
vi.mock("#/services/system-metric/system-metric.server", () => ({
  sampleSystemMetric: mockSampleSystemMetric,
  cleanupSystemMetrics: mockCleanupSystemMetrics,
}));

const { mockTakeLastSeenUpdates, mockPruneIdleDevices } = vi.hoisted(() => ({
  mockTakeLastSeenUpdates: vi.fn(() => new Map<string, Date>()),
  mockPruneIdleDevices: vi.fn(() => [] as string[]),
}));
vi.mock("#/services/device/device.online", () => ({
  takeLastSeenUpdates: mockTakeLastSeenUpdates,
  pruneIdleDevices: mockPruneIdleDevices,
}));

const { mockSaveLastSeen } = vi.hoisted(() => ({ mockSaveLastSeen: vi.fn(() => 0) }));
vi.mock("#/services/device/device.server", () => ({ saveLastSeen: mockSaveLastSeen }));

const { mockLoggerInfo } = vi.hoisted(() => ({ mockLoggerInfo: vi.fn() }));
vi.mock("#/shared-services/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: mockLoggerInfo, warn: vi.fn() },
}));

import { registerAllTasks } from "#/services/tasks/tasks.server";

describe("registerAllTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("注册全部定时任务且配置正确", () => {
    registerAllTasks();
    expect(mockRegisterTask).toHaveBeenCalledTimes(5);
    const calls = mockRegisterTask.mock.calls;
    expect(calls[0][0].name).toBe("系统监控指标采样");
    expect(calls[0][0].cronExpression).toBe("* * * * *");
    expect(calls[0][0].runOnInit).toBe(true);
    expect(calls[1][0].name).toBe("设备在线态巡检");
    expect(calls[1][0].cronExpression).toBe("* * * * *");
    expect(calls[2][0].name).toBe("清理过期临时文件");
    expect(calls[2][0].cronExpression).toBe("0 * * * *");
    expect(calls[3][0].name).toBe("清理过期日志文件");
    expect(calls[3][0].cronExpression).toBe("0 3 * * *");
    expect(calls[4][0].name).toBe("清理过期系统监控数据");
    expect(calls[4][0].cronExpression).toBe("0 4 * * *");
  });

  it("设备在线态巡检先落库再清内存", async () => {
    const updates = new Map([["device-1", new Date("2026-10-20T00:00:00Z")]]);
    mockTakeLastSeenUpdates.mockReturnValue(updates);
    mockPruneIdleDevices.mockReturnValue(["device-2"]);
    registerAllTasks();

    await mockRegisterTask.mock.calls[1][0].handler();

    expect(mockSaveLastSeen).toHaveBeenCalledWith(updates);
    expect(mockPruneIdleDevices).toHaveBeenCalled();
  });

  it("系统监控采样任务 handler 调用采样函数", async () => {
    registerAllTasks();
    await mockRegisterTask.mock.calls[0][0].handler();
    expect(mockSampleSystemMetric).toHaveBeenCalledTimes(1);
  });

  it("清理到过期文件时记录清理日志", async () => {
    mockCleanExpiredFiles.mockResolvedValue(3);
    mockCleanExpiredLogs.mockResolvedValue(0);
    registerAllTasks();
    await mockRegisterTask.mock.calls[2][0].handler();
    expect(mockCleanExpiredFiles).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith({ count: 3 }, "已清理过期临时文件");
  });

  it("没有过期文件时不记录清理日志", async () => {
    mockCleanExpiredFiles.mockResolvedValue(0);
    registerAllTasks();
    await mockRegisterTask.mock.calls[2][0].handler();
    expect(mockCleanExpiredFiles).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it("过期日志清理任务 handler 正常执行", async () => {
    mockCleanExpiredFiles.mockResolvedValue(0);
    mockCleanExpiredLogs.mockResolvedValue(2);
    registerAllTasks();
    await mockRegisterTask.mock.calls[3][0].handler();
    expect(mockCleanExpiredLogs).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith({ count: 2 }, "已清理过期日志文件");
  });

  it("过期系统监控数据清理任务 handler 正常执行", async () => {
    mockCleanupSystemMetrics.mockReturnValue(5);
    registerAllTasks();
    await mockRegisterTask.mock.calls[4][0].handler();
    expect(mockCleanupSystemMetrics).toHaveBeenCalledWith(7);
    expect(mockLoggerInfo).toHaveBeenCalledWith({ count: 5 }, "已清理过期系统监控数据");
  });
});
