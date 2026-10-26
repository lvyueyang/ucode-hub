/**
 * 列宽预算守门测试：scroll.x 推导、弹性列处理、开发期告警
 */
import type { ColumnsType, ColumnType } from "antd/es/table";
import { describe, expect, it } from "vitest";
import { applyColumnBudget } from "../table-budget";

interface Row {
  id: string;
}

/** 测试用列类型：在 antd 列基础上带弹性列标记 */
type TestColumn = ColumnType<Row> & { elastic?: boolean };

function columns(...defs: TestColumn[]): ColumnsType<Row> {
  return defs as ColumnsType<Row>;
}

describe("applyColumnBudget", () => {
  it("scroll.x 为各列宽度之和（含行展开与行选择列）", () => {
    const result = applyColumnBudget<Row>(
      columns(
        { title: "名称", key: "name", width: 200 },
        { title: "操作", key: "actions", width: 170, elastic: true },
      ),
      { expandWidth: 50, selectionWidth: 48 },
    );

    expect(result.scrollX).toBe(468);
    expect(result.warnings).toEqual([]);
  });

  it("弹性列渲染时移除 width 与标记：宽度留给布局吸收", () => {
    const result = applyColumnBudget<Row>(
      columns(
        { title: "名称", key: "name", width: 200 },
        { title: "操作", key: "actions", width: 170, elastic: true },
      ),
    );

    expect(result.columns[0]).toMatchObject({ width: 200 });
    // 弹性列的 width 只用于推导 scroll.x，不交给 antd
    expect(result.columns[1]).not.toHaveProperty("width");
    expect(result.columns[1]).not.toHaveProperty("elastic");
  });

  it("非弹性列缺少 width 时告警", () => {
    const result = applyColumnBudget<Row>(
      columns({ title: "名称", key: "name", width: 200 }, { title: "备注", key: "remark" }),
    );

    expect(result.warnings.join()).toContain("备注");
    expect(result.warnings.join()).toContain("缺少 width");
  });

  it("弹性列超过一个时告警", () => {
    const result = applyColumnBudget<Row>(
      columns(
        { title: "标题", key: "title", width: 240, elastic: true },
        { title: "操作", key: "actions", width: 170, elastic: true },
      ),
    );

    expect(result.warnings.join()).toContain("弹性列只能有一个");
  });

  it("合计超出预算时告警，显式传 null 则不校验", () => {
    const defs = () =>
      columns(
        { title: "标题", key: "title", width: 900, elastic: true },
        { title: "操作", key: "actions", width: 300 },
      );

    expect(applyColumnBudget<Row>(defs(), { budget: 1199 }).warnings.join()).toContain(
      "超出该表预算 1199px",
    );
    expect(applyColumnBudget<Row>(defs(), { budget: null }).warnings).toEqual([]);
  });

  it("分组表头自身不占宽度，子列各自计入", () => {
    const result = applyColumnBudget<Row>(
      columns({
        title: "分组",
        key: "group",
        children: [
          { title: "名称", key: "name", width: 200 },
          { title: "编码", key: "code", width: 120 },
        ],
      } as TestColumn),
    );

    expect(result.scrollX).toBe(320);
    expect(result.warnings).toEqual([]);
  });
});
