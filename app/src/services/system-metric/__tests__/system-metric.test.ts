/**
 * 系统监控模块测试：进程采集、文件存取、按需巡检、采样/快照/历史聚合
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({ mockDb: { execute: vi.fn() } }));
vi.mock("#/db", () => ({ db: mockDb }));

const { mockCheckHealth } = vi.hoisted(() => ({ mockCheckHealth: vi.fn() }));
vi.mock("#/services/health/health.server", () => ({
  checkHealth: mockCheckHealth,
}));

const { mockHttp, mockSf } = vi.hoisted(() => ({
  mockHttp: { total: vi.fn() },
  mockSf: { total: vi.fn(), value: vi.fn() },
}));
vi.mock("#/shared-services/metrics", () => ({
  httpRequestsTotal: mockHttp,
  serverFunctionRequestsTotal: mockSf,
}));

const { mockIterateLogLines } = vi.hoisted(() => ({
  mockIterateLogLines: vi.fn(),
}));
vi.mock("#/services/logs/log-parse", () => ({
  iterateLogLines: mockIterateLogLines,
}));

const { mockAppendFile, mockMkdir, mockReaddirSync, mockUnlinkSync, mockExistsSync } = vi.hoisted(
  () => ({
    mockAppendFile: vi.fn(),
    mockMkdir: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockUnlinkSync: vi.fn(),
    mockExistsSync: vi.fn(),
  }),
);
vi.mock("node:fs", () => ({
  readdirSync: mockReaddirSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync,
}));

const { mockReaddir, mockStat, mockStatfs } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockStat: vi.fn(),
  mockStatfs: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  appendFile: mockAppendFile,
  mkdir: mockMkdir,
  readdir: mockReaddir,
  stat: mockStat,
  statfs: mockStatfs,
}));

const { mockHistogram } = vi.hoisted(() => ({
  mockHistogram: {
    enable: vi.fn(),
    reset: vi.fn(),
    mean: 2_000_000,
    max: 5_000_000,
  },
}));
vi.mock("node:perf_hooks", () => ({
  monitorEventLoopDelay: () => mockHistogram,
}));

import { join, resolve } from "node:path";
import { toDateString } from "@ucode/hub-lib/date-format";
import {
  collectDependencies,
  getActiveResourceCount,
  getRequestTotals,
  readEventLoopDelay,
} from "../system-metric.collect";
import { getDatabaseTotalBytes, getTableSizes } from "../system-metric.db-size.server";
import { getDatabaseSizes, getStorageUsage } from "../system-metric.inspect.server";
import {
  getSystemMetricHistory,
  getSystemOverview,
  sampleSystemMetric,
} from "../system-metric.server";
import {
  appendSample,
  cleanupSystemMetrics,
  getMetricDir,
  getMetricFilePath,
  iterateSamples,
  listMetricFiles,
} from "../system-metric.store";
import type { SystemMetricSample } from "../system-metric.types";

/** 测试用存储目录 */
const STORAGE_DIR = "/tmp/hub-system-metric-test";

/** 构造一条完整采样记录 */
function makeSample(overrides: Partial<SystemMetricSample> = {}): SystemMetricSample {
  return {
    time: new Date().toISOString(),
    cpuPercent: 1,
    rss: 100 * 1024 * 1024,
    heapUsed: 20 * 1024 * 1024,
    heapTotal: 40 * 1024 * 1024,
    external: 1024 * 1024,
    eventLoopLag: 2,
    eventLoopLagMax: 5,
    uptime: 100,
    activeResources: 10,
    httpRequests: 120,
    sfRequests: 30,
    sfErrors: 0,
    dbUp: true,
    dbLatencyMs: 1,
    storageUp: true,
    dbTotalBytes: 1024,
    ...overrides,
  };
}

/** 让 iterateLogLines mock 依次产出给定行 */
function stubLines(lines: string[]): void {
  mockIterateLogLines.mockImplementation(async function* () {
    for (const line of lines) yield line;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STORAGE_DIR = STORAGE_DIR;
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue([]);
  mockCheckHealth.mockResolvedValue({
    checks: {
      database: { status: "up", latencyMs: 3 },
      storage: { status: "up" },
    },
  });
  mockHttp.total.mockReturnValue(1000);
  mockSf.total.mockReturnValue(200);
  mockSf.value.mockReturnValue(4);
  mockDb.execute.mockResolvedValue({ rows: [] });
});

describe("system-metric.store", () => {
  it("解析采样目录与文件路径", () => {
    expect(getMetricDir()).toBe(resolve(STORAGE_DIR, "metrics"));
    expect(getMetricFilePath("2026-09-13")).toBe(
      resolve(STORAGE_DIR, "metrics", "2026-09-13.ndjson"),
    );
  });

  it("按业务日期追加采样行", async () => {
    // 2026-09-13T02:00:00Z = 东八区 2026-09-13 10:00
    const sample = makeSample({ time: "2026-09-13T02:00:00.000Z" });
    await appendSample(sample);

    expect(mockMkdir).toHaveBeenCalledWith(resolve(STORAGE_DIR, "metrics"), {
      recursive: true,
    });
    const [filePath, content, encoding] = mockAppendFile.mock.calls[0];
    expect(filePath).toBe(resolve(STORAGE_DIR, "metrics", "2026-09-13.ndjson"));
    expect(encoding).toBe("utf-8");
    expect(JSON.parse(String(content).trim())).toMatchObject({
      cpuPercent: sample.cpuPercent,
    });
  });

  it("按日期范围枚举采样文件并升序排列", () => {
    mockReaddirSync.mockReturnValue([
      "2026-09-12.ndjson",
      "2026-09-13.ndjson",
      "2026-09-10.ndjson",
      "readme.txt",
    ]);

    expect(listMetricFiles()).toEqual([
      "2026-09-10.ndjson",
      "2026-09-12.ndjson",
      "2026-09-13.ndjson",
    ]);
    expect(listMetricFiles("2026-09-12", "2026-09-13")).toEqual([
      "2026-09-12.ndjson",
      "2026-09-13.ndjson",
    ]);
  });

  it("目录不存在时返回空列表", () => {
    mockExistsSync.mockReturnValue(false);
    expect(listMetricFiles()).toEqual([]);
  });

  it("流式读取时跳过非法行", async () => {
    stubLines([JSON.stringify(makeSample({ uptime: 7 })), "{非法", ""]);
    const samples: SystemMetricSample[] = [];
    for await (const sample of iterateSamples(["2026-09-13.ndjson"])) {
      samples.push(sample);
    }
    expect(samples).toHaveLength(1);
    expect(samples[0].uptime).toBe(7);
  });

  it("清理超过保留期的采样文件", () => {
    mockReaddirSync.mockReturnValue(["2020-01-01.ndjson", "2099-01-01.ndjson"]);
    const deleted = cleanupSystemMetrics(7);
    expect(deleted).toBe(1);
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      join(resolve(STORAGE_DIR, "metrics"), "2020-01-01.ndjson"),
    );
  });
});

describe("system-metric.db-size", () => {
  it("读取数据库总大小（bigint 字符串转数字）", async () => {
    mockDb.execute.mockResolvedValue({ rows: [{ size: "2048" }] });
    expect(await getDatabaseTotalBytes()).toBe(2048);
  });

  it("数据库查询无结果时返回 0", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });
    expect(await getDatabaseTotalBytes()).toBe(0);
  });

  it("映射各表占用字段", async () => {
    mockDb.execute.mockResolvedValue({
      rows: [
        {
          table_name: "news",
          table_bytes: "100",
          index_bytes: "20",
          total_bytes: "120",
        },
      ],
    });
    expect(await getTableSizes()).toEqual([
      { tableName: "news", tableBytes: 100, indexBytes: 20, totalBytes: 120 },
    ]);
  });
});

describe("system-metric.collect", () => {
  it("读取事件循环延迟并可选重置窗口", () => {
    expect(readEventLoopDelay(true)).toEqual({ meanMs: 2, maxMs: 5 });
    expect(mockHistogram.reset).toHaveBeenCalledTimes(1);
  });

  it("返回活跃资源数", () => {
    expect(getActiveResourceCount()).toBeGreaterThanOrEqual(0);
  });

  it("汇总累计请求计数", () => {
    expect(getRequestTotals()).toEqual({ http: 1000, sf: 200, sfErrors: 4 });
    expect(mockSf.value).toHaveBeenCalledWith({ result: "error" });
  });

  it("提取依赖健康状态", async () => {
    expect(await collectDependencies()).toEqual({
      dbUp: true,
      dbLatencyMs: 3,
      storageUp: true,
    });
  });

  it("依赖不可用时不带耗时", async () => {
    mockCheckHealth.mockResolvedValue({
      checks: {
        database: { status: "down", error: "连接失败" },
        storage: { status: "down", error: "不可写" },
      },
    });
    expect(await collectDependencies()).toEqual({
      dbUp: false,
      dbLatencyMs: null,
      storageUp: false,
    });
  });
});

describe("system-metric.inspect", () => {
  /** 构造目录树 mock：path → 条目 */
  function stubDirTree(tree: Record<string, unknown[]>): void {
    mockReaddir.mockImplementation(async (dir: string) => tree[dir] ?? []);
  }

  const dirent = (name: string, kind: "dir" | "file") => ({
    name,
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file",
    isSymbolicLink: () => false,
  });

  it("统计存储目录占用、顶层分解与文件系统容量", async () => {
    const dir = resolve(STORAGE_DIR);
    stubDirTree({
      [dir]: [dirent("uploads", "dir"), dirent("logs", "dir"), dirent("a.txt", "file")],
      [join(dir, "uploads")]: [dirent("x.png", "file"), dirent("y.png", "file")],
      [join(dir, "logs")]: [],
    });
    mockStat.mockImplementation(async (file: string) => ({
      size: file.endsWith("x.png") ? 300 : file.endsWith("y.png") ? 200 : 100,
    }));
    mockStatfs.mockResolvedValue({
      bsize: 4096,
      blocks: 1000,
      bfree: 300,
      bavail: 250,
    });

    const usage = await getStorageUsage(true);

    expect(usage.totalBytes).toBe(600);
    expect(usage.fileCount).toBe(3);
    expect(usage.entries.map((e) => e.name)).toEqual(["uploads", "a.txt", "logs"]);
    expect(usage.filesystem).toEqual({
      totalBytes: 4_096_000,
      usedBytes: 2_867_200,
      freeBytes: 1_024_000,
    });
  });

  it("命中缓存时不重复遍历目录", async () => {
    mockReaddir.mockResolvedValue([]);
    mockStatfs.mockResolvedValue({
      bsize: 4096,
      blocks: 0,
      bfree: 0,
      bavail: 0,
    });

    await getStorageUsage(true);
    const callsAfterForce = mockReaddir.mock.calls.length;
    await getStorageUsage(false);
    expect(mockReaddir.mock.calls.length).toBe(callsAfterForce);
  });

  it("聚合数据库库总量与各表", async () => {
    // Promise.all 依次触发：库总量查询 → 各表查询
    mockDb.execute.mockResolvedValueOnce({ rows: [{ size: "4096" }] }).mockResolvedValueOnce({
      rows: [
        {
          table_name: "news",
          table_bytes: "10",
          index_bytes: "2",
          total_bytes: "12",
        },
      ],
    });

    const sizes = await getDatabaseSizes(true);
    expect(sizes.databaseBytes).toBe(4096);
    expect(sizes.tables).toHaveLength(1);
  });
});

describe("system-metric.server", () => {
  it("采样后落盘并可通过实时快照读取最近采样", async () => {
    await sampleSystemMetric();

    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const overview = await getSystemOverview();
    expect(overview.lastSample).not.toBeNull();
    expect(overview.lastSample?.dbUp).toBe(true);
    expect(overview.httpRequestsTotal).toBe(1000);
    expect(overview.memory.rss).toBeGreaterThan(0);
  });

  it("数据库中无结果时库总量按 0 计", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });
    await sampleSystemMetric();
    const overview = await getSystemOverview();
    expect(overview.lastSample?.dbTotalBytes).toBe(0);
  });

  it("数据库不可用时不查询库总量", async () => {
    mockCheckHealth.mockResolvedValue({
      checks: {
        database: { status: "down", error: "x" },
        storage: { status: "up" },
      },
    });
    await sampleSystemMetric();
    const overview = await getSystemOverview();
    expect(overview.lastSample?.dbUp).toBe(false);
    expect(overview.lastSample?.dbTotalBytes).toBeNull();
  });

  it("按时间桶聚合历史趋势", async () => {
    mockReaddirSync.mockReturnValue([`${toDateString(new Date())}.ndjson`]);
    const recent = new Date(Date.now() - 60_000).toISOString();
    stubLines([
      JSON.stringify(makeSample({ time: recent, rss: 100, cpuPercent: 2, httpRequests: 5 })),
      JSON.stringify(makeSample({ time: recent, rss: 300, cpuPercent: 4, httpRequests: 7 })),
    ]);

    const history = await getSystemMetricHistory("24h");

    const rssPoints = history.points.filter((p) => p.metric === "rss");
    expect(rssPoints).toHaveLength(1);
    expect(rssPoints[0].value).toBe(200);

    const cpuPoints = history.points.filter((p) => p.metric === "cpuPercent");
    expect(cpuPoints[0].value).toBe(3);

    const httpPoints = history.points.filter((p) => p.metric === "httpRequests");
    expect(httpPoints[0].value).toBe(12);
    expect(history.bucketMs).toBe(300_000);
  });

  it("范围内无数据时返回空趋势", async () => {
    stubLines([]);
    const history = await getSystemMetricHistory("1h");
    expect(history.points).toEqual([]);
    expect(history.truncated).toBe(false);
  });
});

describe("跨 bundle 共享状态", () => {
  it("缓存实例挂载 globalThis，重新加载模块仍复用同一实例", async () => {
    vi.resetModules();
    const first = await import("../system-metric.cache");
    first.latestSampleCache.set("probe", makeSample({ uptime: 42 }));

    // 模拟 Nitro 入口与 SSR bundle 分别打包同一模块的场景
    vi.resetModules();
    const second = await import("../system-metric.cache");
    expect(second.latestSampleCache.get("probe")?.uptime).toBe(42);
  });
});
