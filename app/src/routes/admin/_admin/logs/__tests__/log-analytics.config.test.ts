/**
 * 运行日志分析图表配置测试
 */

import { describe, expect, it } from "vitest";
import { buildLogTrendConfig } from "../-mods/log-analytics.config";

describe("buildLogTrendConfig", () => {
  it("空数据返回 null", () => {
    expect(buildLogTrendConfig([])).toBeNull();
  });

  it("按级别生成多系列折线配置", () => {
    const config = buildLogTrendConfig([
      { date: "2026-01-01", value: 3, series: "info" },
      { date: "2026-01-01", value: 1, series: "error" },
    ]);

    expect(config).not.toBeNull();
    expect(config?.colorField).toBe("series");
    expect(config?.data).toHaveLength(2);
  });
});
