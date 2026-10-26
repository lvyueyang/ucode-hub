/**
 * 通用查询工具测试：软删除条件、分页、排序、分页执行
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  buildSortClause,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "../query-utils.server";

describe("DEFAULT_PAGE", () => {
  it("默认第一页为 1", () => {
    expect(DEFAULT_PAGE).toBe(1);
  });
});

describe("DEFAULT_PAGE_SIZE", () => {
  it("默认每页 20 条", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });
});

describe("paginationOffset", () => {
  it("第 1 页偏移量为 0", () => {
    expect(paginationOffset(1, 20)).toBe(0);
  });

  it("第 2 页偏移量为 20", () => {
    expect(paginationOffset(2, 20)).toBe(20);
  });

  it("第 3 页每页 10 条偏移量为 20", () => {
    expect(paginationOffset(3, 10)).toBe(20);
  });

  it("第 1 页每页 50 条偏移量为 0", () => {
    expect(paginationOffset(1, 50)).toBe(0);
  });
});

/** 递归提取 drizzle SQL 对象中的 SQL 文本，用于语义断言 */
function sqlString(value: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") {
      if (typeof node === "string") out.push(node);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      for (const chunk of obj.queryChunks) walk(chunk);
      return;
    }
    if (Array.isArray(obj.value)) {
      for (const v of obj.value) walk(v);
      return;
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(value);
  return out.join("").toLowerCase();
}

describe("notDeleted", () => {
  it("生成 is null 的软删除条件", () => {
    const result = notDeleted(sql`deleted_at`);
    const s = sqlString(result);
    expect(s).toContain("deleted_at");
    expect(s).toContain("is null");
  });
});

describe("buildSortClause", () => {
  const fieldMap = {
    createdAt: sql`created_at`,
    updatedAt: sql`updated_at`,
  };

  it("未指定 sortField 时使用默认字段降序", () => {
    const result = buildSortClause(fieldMap, undefined, undefined, "createdAt");
    const s = sqlString(result);
    expect(s).toContain("created_at");
    expect(s).toContain("desc");
  });

  it("指定升序排序", () => {
    const result = buildSortClause(fieldMap, "createdAt", "ascend", "createdAt");
    const s = sqlString(result);
    expect(s).toContain("created_at");
    expect(s).toContain("asc");
  });

  it("指定降序排序并映射到对应字段", () => {
    const result = buildSortClause(fieldMap, "updatedAt", "descend", "createdAt");
    const s = sqlString(result);
    expect(s).toContain("updated_at");
    expect(s).toContain("desc");
  });

  it("非法 sortField 回退到默认字段，防止注入", () => {
    const result = buildSortClause(fieldMap, "injectedField;DROP TABLE x", "ascend", "createdAt");
    const s = sqlString(result);
    expect(s).toContain("created_at");
    expect(s).not.toContain("injectedfield");
    expect(s).toContain("asc");
  });
});

describe("executePaginatedQuery", () => {
  it("并行执行数据和计数查询并返回分页结构", async () => {
    const result = await executePaginatedQuery(
      Promise.resolve(["a", "b", "c"]),
      Promise.resolve(100),
      1,
      20,
    );

    expect(result.records).toEqual(["a", "b", "c"]);
    expect(result.total).toBe(100);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("空数组返回正确分页结构", async () => {
    const result = await executePaginatedQuery(Promise.resolve([]), Promise.resolve(0), 2, 10);

    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });
});
