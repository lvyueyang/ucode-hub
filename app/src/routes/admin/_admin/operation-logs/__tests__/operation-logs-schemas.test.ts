/**
 * 操作日志列表 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { operationLogListSchema } from "#/shared-services/operation-log/operation-log.schemas";

describe("operationLogListSchema", () => {
  it("空参数应通过校验", () => {
    const result = operationLogListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("所有参数同时传入应通过校验", () => {
    const result = operationLogListSchema.safeParse({
      module: "news",
      action: "create",
      keyword: "admin",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      page: 1,
      pageSize: 20,
      sortField: "createdAt",
      sortOrder: "ascend",
    });
    expect(result.success).toBe(true);
  });

  it("每页条数应原样透传（前端分页控件依赖）", () => {
    const result = operationLogListSchema.safeParse({ pageSize: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("日期格式非 YYYY-MM-DD 应校验失败", () => {
    const result = operationLogListSchema.safeParse({
      startDate: "2024/01/01",
      endDate: "2024-12-31T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("不存在的日历日期应校验失败", () => {
    const result = operationLogListSchema.safeParse({
      startDate: "2024-02-31",
      endDate: "2024-12-31",
    });
    expect(result.success).toBe(false);
  });
});
