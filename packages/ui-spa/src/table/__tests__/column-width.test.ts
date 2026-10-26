/**
 * 列宽档位与操作列宽度公式的守门测试
 * 档位被多页共用，数值漂移（如时间列出现 160/165/180 三套）即在此失败
 */
import { describe, expect, it } from "vitest";
import { actionsWidth, COLUMN_WIDTH } from "../column-width";

describe("COLUMN_WIDTH", () => {
  it("档位数值固定，防止各页分别估值导致漂移", () => {
    expect(COLUMN_WIDTH).toEqual({
      expand: 50,
      selection: 48,
      avatar: 80,
      status: 100,
      toggle: 100,
      sortOrder: 115,
      time: 165,
      timeSecond: 180,
      tag: 150,
      id: 120,
      uuid: 170,
      shortText: 180,
      text: 340,
    });
  });
});

describe("actionsWidth", () => {
  it("无操作项时返回 0", () => {
    expect(actionsWidth()).toBe(0);
  });

  it("按操作项文案实算并向上取到 10 的整数倍", () => {
    // 1 项 / 2 项短文案 / 3 项短文案 / 3 项含四字文案 / 4 项短文案
    expect(actionsWidth("删除")).toBe(100);
    expect(actionsWidth("编辑", "删除")).toBe(170);
    expect(actionsWidth("编辑", "翻译", "删除")).toBe(240);
    expect(actionsWidth("编辑", "重置密码", "删除")).toBe(270);
    expect(actionsWidth("编辑", "下载", "预览", "删除")).toBe(320);
  });

  it("四字文案比两项组合更宽，但窄于多加一项", () => {
    const two = actionsWidth("编辑", "删除");
    const withLongLabel = actionsWidth("编辑", "设为默认", "删除");
    const three = actionsWidth("编辑", "翻译", "删除");
    expect(withLongLabel).toBeGreaterThan(three);
    expect(withLongLabel).toBeGreaterThan(two);
  });
});
