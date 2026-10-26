/**
 * 操作日志分析图表配置测试：趋势折线与分布柱状的纯函数组装
 */

import { describe, expect, it } from "vitest";
import {
  buildOperationDistributionConfig,
  buildOperationTrendConfig,
} from "../-mods/operation-log-analytics.config";

describe("buildOperationTrendConfig", () => {
  it("空数据返回 null", () => {
    expect(buildOperationTrendConfig([])).toBeNull();
  });

  it("按分组维度生成多系列折线配置", () => {
    const config = buildOperationTrendConfig([
      { date: "2024-01-01", value: 3, series: "create" },
      { date: "2024-01-01", value: 1, series: "delete" },
    ]);

    expect(config).not.toBeNull();
    expect(config?.colorField).toBe("series");
    expect(config?.data).toHaveLength(2);
  });
});

describe("buildOperationDistributionConfig", () => {
  it("空数据返回 null", () => {
    expect(buildOperationDistributionConfig([], {})).toBeNull();
  });

  it("按映射表替换展示名", () => {
    const config = buildOperationDistributionConfig([{ name: "create", count: 5, ratio: 0.5 }], {
      create: "创建",
    });

    expect(config).not.toBeNull();
    expect(config?.data).toEqual([{ name: "创建", value: 5 }]);
  });

  it("映射表缺省时回退原始名称", () => {
    const config = buildOperationDistributionConfig(
      [{ name: "unknown_action", count: 1, ratio: 1 }],
      {},
    );

    expect(config?.data).toEqual([{ name: "unknown_action", value: 1 }]);
  });
});
