/**
 * 事件趋势图配置组装纯函数测试
 */
import { describe, expect, it } from "vitest";
import type { TimeSeriesPoint } from "#/services/track/track.types";
import { buildTrendConfig } from "../-mods/analytics.trend-config";

/** 构造当前窗口序列 */
function curPoint(date: string, value: number, series?: string): TimeSeriesPoint {
  return { date, value, series, compare: "current" };
}

describe("buildTrendConfig", () => {
  it("空数据返回 null 配置", () => {
    const result = buildTrendConfig([], {
      compare: "none",
    });
    expect(result.config).toBeNull();
    expect(result.seriesField).toBeNull();
  });

  it("单序列（无拆解无对比）不设置系列字段", () => {
    const result = buildTrendConfig([curPoint("2026-09-01", 5), curPoint("2026-09-02", 8)], {
      compare: "none",
      eventNames: ["PageView"],
    });
    expect(result.seriesField).toBeNull();
    expect(result.config?.data).toEqual([
      { date: "2026-09-01", value: 5 },
      { date: "2026-09-02", value: 8 },
    ]);
  });

  it("多事件对比按 series 分组着色", () => {
    const result = buildTrendConfig(
      [curPoint("2026-09-01", 5, "PageView"), curPoint("2026-09-01", 2, "Login")],
      { compare: "none", eventNames: ["PageView", "Login"] },
    );
    expect(result.seriesField).toBe("series");
    expect(result.config?.data).toEqual([
      { date: "2026-09-01", value: 5, series: "PageView" },
      { date: "2026-09-01", value: 2, series: "Login" },
    ]);
  });

  it("维度拆解同样按 series 分组", () => {
    const result = buildTrendConfig(
      [curPoint("2026-09-01", 5, "Desktop"), curPoint("2026-09-01", 2, "Mobile")],
      { compare: "none", breakdown: "$device_type" },
    );
    expect(result.seriesField).toBe("series");
    expect(result.config?.data[0]).toEqual({
      date: "2026-09-01",
      value: 5,
      series: "Desktop",
    });
  });

  it("周期对比（无分组）把上期序列对齐到当前窗口日期", () => {
    const result = buildTrendConfig(
      [
        curPoint("2026-09-01", 5),
        {
          date: "2026-08-25",
          value: 3,
          series: "PageView",
          compare: "previous",
        },
      ],
      { compare: "previous", eventNames: ["PageView"] },
    );
    expect(result.seriesField).toBe("series");
    // 本期与上期对齐到同一日期桶，上期标记 dashed
    expect(result.config?.data).toEqual([
      { date: "2026-09-01", value: 5, series: "本期" },
      { date: "2026-09-01", value: 3, series: "上期", dashed: true },
    ]);
  });

  it("维度拆解与周期对比并存时以维度分组优先（忽略对比序列）", () => {
    const result = buildTrendConfig(
      [
        curPoint("2026-09-01", 5, "Desktop"),
        {
          date: "2026-08-25",
          value: 3,
          series: "Desktop",
          compare: "previous",
        },
      ],
      { compare: "previous", breakdown: "$device_type" },
    );
    expect(result.seriesField).toBe("series");
    // 有分组时忽略对比序列，只保留当前窗口
    expect(result.config?.data).toEqual([{ date: "2026-09-01", value: 5, series: "Desktop" }]);
  });
});
