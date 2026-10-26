/**
 * 运行日志分析模块测试：真实文件系统验证级别分布、错误率、聚类与筛选
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  accumulateLogStream,
  createAccumulator,
  getLogAnalytics,
  parseEntryTime,
} from "../log-analytics.server";

let storageDir: string;

/** 构造 pino 风格 JSON 行 */
function pinoLine(level: number, isoTime: string, msg: string): string {
  return JSON.stringify({
    level,
    time: new Date(isoTime).getTime(),
    msg,
  });
}

beforeAll(async () => {
  storageDir = join(tmpdir(), `log-analytics-test-${Date.now()}`);
  process.env.STORAGE_DIR = storageDir;
  await mkdir(join(storageDir, "logs"), { recursive: true });

  await writeFile(
    join(storageDir, "logs", "2026-01-01.log"),
    [
      pinoLine(30, "2026-01-01T00:00:00.000Z", "启动完成"),
      pinoLine(
        50,
        "2026-01-01T01:00:00.000Z",
        "查询用户 550e8400-e29b-41d4-a716-446655440000 失败",
      ),
      pinoLine(
        50,
        "2026-01-01T02:00:00.000Z",
        "查询用户 123e4567-e89b-12d3-a456-426614174000 失败",
      ),
      pinoLine(40, "2026-01-01T03:00:00.000Z", "慢查询"),
    ].join("\n"),
  );

  await writeFile(
    join(storageDir, "logs", "2026-01-02.log"),
    pinoLine(30, "2026-01-02T00:00:00.000Z", "启动完成"),
  );
});

afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

beforeEach(() => vi.clearAllMocks());

describe("getLogAnalytics", () => {
  const range = { startDate: "2026-01-01", endDate: "2026-01-02" };

  it("聚合级别分布、错误率与错误聚类", async () => {
    const result = await getLogAnalytics(range);

    expect(result.total).toBe(5);
    expect(result.errorCount).toBe(2);
    expect(result.errorRate).toBeCloseTo(0.4);
    expect(result.scannedFiles).toBe(2);

    const info = result.levelCounts.find((l) => l.level === "info");
    expect(info?.count).toBe(2);

    // 两条不同 UUID 的错误归一为同一聚类
    expect(result.topErrors[0].count).toBe(2);
  });

  it("按天分桶并兼容东八区", async () => {
    const result = await getLogAnalytics(range);
    const dates = new Set(result.timeSeries.map((p) => p.date));

    expect(dates.has("2026-01-01")).toBe(true);
    expect(dates.has("2026-01-02")).toBe(true);
  });

  it("按小时粒度分桶", async () => {
    const result = await getLogAnalytics({
      ...range,
      granularity: "hour",
    });

    const dates = new Set(result.timeSeries.map((p) => p.date));
    expect(dates.has("2026-01-01 08:00")).toBe(true);
  });

  it("按级别筛选", async () => {
    const result = await getLogAnalytics({ ...range, level: "error" });

    expect(result.total).toBe(2);
    expect(result.levelCounts).toHaveLength(1);
    expect(result.levelCounts[0].level).toBe("error");
  });

  it("按关键词筛选", async () => {
    const result = await getLogAnalytics({ ...range, keyword: "启动" });

    expect(result.total).toBe(2);
  });

  it("日期范围内无文件时返回零值", async () => {
    const result = await getLogAnalytics({
      startDate: "2025-01-01",
      endDate: "2025-01-02",
    });

    expect(result.total).toBe(0);
    expect(result.errorRate).toBe(0);
    expect(result.scannedFiles).toBe(0);
  });
});

describe("parseEntryTime", () => {
  it("兼容 epoch 毫秒与 ISO 字符串", () => {
    const epoch = Date.UTC(2026, 0, 1);
    expect(parseEntryTime({ time: epoch })?.getTime()).toBe(epoch);
    expect(parseEntryTime({ timestamp: "2026-01-01T00:00:00.000Z" })?.getTime()).toBe(epoch);
  });

  it("缺失或非法时间返回 null", () => {
    expect(parseEntryTime({})).toBeNull();
    expect(parseEntryTime({ time: "not-a-date" })).toBeNull();
  });
});

describe("accumulateLogStream", () => {
  /** 由数组构造异步行流 */
  async function* fromArray(lines: string[]): AsyncGenerator<string> {
    for (const line of lines) yield line;
  }

  it("触达扫描行数上限时截断", async () => {
    const acc = createAccumulator();
    await accumulateLogStream(
      fromArray([
        pinoLine(30, "2026-01-01T00:00:00.000Z", "a"),
        pinoLine(30, "2026-01-01T00:00:00.000Z", "b"),
        pinoLine(30, "2026-01-01T00:00:00.000Z", "c"),
      ]),
      { granularity: "day", maxLines: 2 },
      acc,
    );

    expect(acc.truncated).toBe(true);
    expect(acc.total).toBe(2);
    expect(acc.scanned).toBe(2);
  });

  it("合法 JSON 标量行（null）兜底为错误且不中断扫描", async () => {
    const acc = createAccumulator();
    await accumulateLogStream(
      fromArray(["null", pinoLine(30, "2026-01-01T00:00:00.000Z", "正常日志")]),
      { granularity: "day", maxLines: 10 },
      acc,
    );

    // "null" 行无法作为 pino 记录，计为 error 并继续处理后续行
    expect(acc.total).toBe(2);
    expect(acc.errorCount).toBe(1);
    expect(acc.truncated).toBe(false);
  });
});
