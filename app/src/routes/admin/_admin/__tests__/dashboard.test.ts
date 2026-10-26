/**
 * 仪表盘展示纯函数与入参 Schema 测试
 */

import { describe, expect, it } from "vitest";
import type { SystemMetricHistoryPoint } from "#/services/system-metric/system-metric.types";
import { buildResourceTrendConfig, buildTrafficTrendConfig } from "../-mods/dashboard.charts";
import { formatUptime } from "../-mods/dashboard.formatters";
import { dashboardOverviewSchema } from "../-mods/dashboard.schemas";

describe("buildTrafficTrendConfig", () => {
  it("空序列返回 null", () => {
    expect(buildTrafficTrendConfig([])).toBeNull();
  });

  it("上期点位按桶序号对齐到本期日期并标记虚线", () => {
    const config = buildTrafficTrendConfig([
      { date: "2026-09-11", value: 1, compare: "current" },
      { date: "2026-09-12", value: 2, compare: "current" },
      { date: "2026-09-09", value: 1, compare: "previous" },
      { date: "2026-09-10", value: 1, compare: "previous" },
    ]);
    const data = config?.data as unknown as {
      date: string;
      series: string;
      dashed: boolean;
    }[];

    expect(data).toHaveLength(4);
    const previous = data.filter((item) => item.series === "上期");
    expect(previous.map((item) => item.date)).toEqual(["2026-09-11", "2026-09-12"]);
    expect(previous.every((item) => item.dashed)).toBe(true);
  });
});

describe("buildResourceTrendConfig", () => {
  it("按指标筛选采样点并将内存由字节换算为 MB", () => {
    const points: SystemMetricHistoryPoint[] = [
      { date: "2026-09-13 10:00", metric: "rss", value: 1048576 },
      { date: "2026-09-13 10:00", metric: "cpuPercent", value: 12.5 },
      { date: "2026-09-13 11:00", metric: "rss", value: 2097152 },
    ];

    const config = buildResourceTrendConfig(points, "rss");
    const data = config?.data as unknown as { date: string; value: number }[];

    expect(data).toEqual([
      { date: "2026-09-13 10:00", value: 1 },
      { date: "2026-09-13 11:00", value: 2 },
    ]);
  });

  it("无对应指标数据返回 null", () => {
    expect(buildResourceTrendConfig([], "cpuPercent")).toBeNull();
  });
});

describe("formatUptime", () => {
  it("按天 / 小时 / 分钟分段展示", () => {
    expect(formatUptime(90)).toBe("1 分");
    expect(formatUptime(3 * 3600 + 120)).toBe("3 小时 2 分");
    expect(formatUptime(2 * 86400 + 5 * 3600)).toBe("2 天 5 小时");
  });
});

describe("dashboardOverviewSchema", () => {
  it("接受合法范围并拒绝未知范围", () => {
    expect(dashboardOverviewSchema.safeParse({ range: "7d" }).success).toBe(true);
    expect(dashboardOverviewSchema.safeParse({ range: "1d" }).success).toBe(false);
  });
});
