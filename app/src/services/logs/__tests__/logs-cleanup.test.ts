/**
 * 日志文件清理测试：验证清理逻辑
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUnlinkSync, mockReaddirSync, mockExistsSync, mockJoin, mockResolve } = vi.hoisted(
  () => ({
    mockUnlinkSync: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockExistsSync: vi.fn(),
    mockJoin: vi.fn((...args: string[]) => args.join("/")),
    mockResolve: vi.fn((...args: string[]) => args.join("/")),
  }),
);

vi.mock("node:fs", () => ({
  unlinkSync: mockUnlinkSync,
  readdirSync: mockReaddirSync,
  existsSync: mockExistsSync,
}));

vi.mock("node:path", () => ({
  join: mockJoin,
  resolve: mockResolve,
}));

/** 日志清理失败路径会经 logger 记 warn：mock 掉避免拉起完整日志模块（pino 流依赖真实的 node:fs） */
const { mockLoggerWarn } = vi.hoisted(() => ({ mockLoggerWarn: vi.fn() }));
vi.mock("#/shared-services/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { toDateString } from "@ucode/hub-lib/date-format";

import { cleanExpiredLogs } from "#/services/logs/logs-cleanup.server";

describe("cleanExpiredLogs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("日志目录不存在时返回 0", () => {
    mockExistsSync.mockReturnValue(false);
    expect(cleanExpiredLogs()).toBe(0);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it("空日志目录返回 0", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    expect(cleanExpiredLogs()).toBe(0);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it("全部日志在保留期内返回 0", () => {
    // 与清理逻辑同一时区基准（Asia/Shanghai）生成今日文件名
    const todayStr = `${toDateString(new Date())}.log`;

    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([todayStr]);
    expect(cleanExpiredLogs()).toBe(0);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it("过期日志文件被删除", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["2020-01-01.log", "2020-01-02.log"]);
    expect(cleanExpiredLogs()).toBe(2);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
  });

  it("非标准命名的 .log 文件不会被删除", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["debug.log", "error.log", "2020-01-01.log"]);
    expect(cleanExpiredLogs()).toBe(1);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
  });

  it("单个文件删除失败不中断后续文件清理，并记 warn 日志", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["2020-01-01.log", "2020-01-02.log"]);
    mockUnlinkSync
      .mockImplementationOnce(() => {
        throw new Error("权限不足");
      })
      .mockImplementationOnce(() => {});

    expect(cleanExpiredLogs()).toBe(1);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        file: "2020-01-01.log",
        error: "权限不足",
      }),
      "清理日志文件失败",
    );
  });

  it("支持自定义保留天数", () => {
    const todayStr = `${toDateString(new Date())}.log`;

    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([todayStr]);
    expect(cleanExpiredLogs(365)).toBe(0);
  });
});
