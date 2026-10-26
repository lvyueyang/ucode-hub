/**
 * 日志列表 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { logsListSchema } from "#/services/logs/logs.schemas";

describe("logsListSchema", () => {
  it("空参数应通过校验", () => {
    const result = logsListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("所有参数同时传入应通过校验", () => {
    const result = logsListSchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      keyword: "error",
      level: "error",
      page: 1,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("每页条数应原样透传（前端分页控件依赖）", () => {
    const result = logsListSchema.safeParse({ page: 2, pageSize: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });
});
