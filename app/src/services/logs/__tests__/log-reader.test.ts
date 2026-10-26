/**
 * 日志读取模块测试：真实文件系统验证过滤、分页、非 JSON 行兜底与日期读取
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getLogDates, queryLogs, readLogFileContent } from "../log-reader";

let storageDir: string;

beforeAll(async () => {
  storageDir = join(tmpdir(), `log-reader-test-${Date.now()}`);
  process.env.STORAGE_DIR = storageDir;
  await mkdir(join(storageDir, "logs"), { recursive: true });

  await writeFile(
    join(storageDir, "logs", "2026-01-01.log"),
    [
      JSON.stringify({
        level: "info",
        time: "2026-01-01T00:00:00.000Z",
        message: "第一条日志",
      }),
      JSON.stringify({
        level: "error",
        time: "2026-01-01T00:01:00.000Z",
        message: "发生错误",
      }),
      "这是一行非 JSON 内容",
    ].join("\n"),
  );

  await writeFile(
    join(storageDir, "logs", "2026-01-02.log"),
    JSON.stringify({
      level: "info",
      time: "2026-01-02T00:00:00.000Z",
      message: "第二天的日志",
    }),
  );
});

afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

beforeEach(() => vi.clearAllMocks());

describe("queryLogs", () => {
  it("返回全部条目，非 JSON 行兜底为 error 级别", async () => {
    const result = await queryLogs();

    // 3 条 JSON + 1 条非 JSON 兜底
    expect(result.total).toBe(4);
    expect(result.entries).toHaveLength(4);
  });

  it("按时间倒序排列", async () => {
    const result = await queryLogs();

    // 过滤非 JSON 兜底条目后，时间应严格倒序
    const times = result.entries.filter((e) => e.time).map((e) => e.time as string);
    expect(times).toEqual([
      "2026-01-02T00:00:00.000Z",
      "2026-01-01T00:01:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("按级别筛选", async () => {
    const result = await queryLogs({ level: "error" });

    // JSON error + 非 JSON 兜底（level 为 error）
    expect(result.total).toBe(2);
    for (const entry of result.entries) {
      expect(entry.level).toBe("error");
    }
  });

  it("按关键词筛选", async () => {
    const result = await queryLogs({ keyword: "第二天" });

    expect(result.total).toBe(1);
    expect(result.entries[0].message).toBe("第二天的日志");
  });

  it("按日期范围筛选文件", async () => {
    const result = await queryLogs({
      startDate: "2026-01-02",
      endDate: "2026-01-02",
    });

    expect(result.total).toBe(1);
    expect(result.entries[0].message).toBe("第二天的日志");
  });

  it("分页截取条目", async () => {
    const result = await queryLogs({ page: 1, pageSize: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(4);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
  });
});

describe("readLogFileContent", () => {
  it("读取指定日期日志内容", async () => {
    const content = await readLogFileContent("2026-01-01");

    expect(content).not.toBeNull();
    expect(content).toContain("第一条日志");
  });

  it("不存在的日期返回 null", async () => {
    const content = await readLogFileContent("2025-01-01");
    expect(content).toBeNull();
  });
});

describe("getLogDates", () => {
  it("返回可用日志日期并按日期倒序", () => {
    const dates = getLogDates();

    expect(dates).toEqual(["2026-01-02", "2026-01-01"]);
  });
});
