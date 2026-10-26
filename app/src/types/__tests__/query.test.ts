/**
 * 通用查询类型模块测试：类型定义存在性验证
 * 该模块仅导出类型和接口，运行时无实际逻辑
 */

import { describe, expect, it } from "vitest";
import type { PaginatedParams, PaginatedResult, PaginatedSortParams, SortOrder } from "../query";

describe("query-utils 类型模块", () => {
  it("SortOrder 类型被正确导入", () => {
    // 纯类型导入验证，确保模块可被正常 import
    const order: SortOrder = "ascend";
    expect(order).toBe("ascend");
  });

  it("PaginatedParams 接口结构可用", () => {
    const params: PaginatedParams = { page: 1, pageSize: 20 };
    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(20);
  });

  it("PaginatedSortParams 接口结构可用", () => {
    const params: PaginatedSortParams = {
      page: 1,
      pageSize: 20,
      sortField: "createdAt",
      sortOrder: "descend",
    };
    expect(params.sortField).toBe("createdAt");
    expect(params.sortOrder).toBe("descend");
  });

  it("PaginatedResult 接口结构可用", () => {
    const result: PaginatedResult<string> = {
      records: ["a", "b"],
      total: 2,
      page: 1,
      pageSize: 20,
    };
    expect(result.records).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
