/**
 * 管理端表格可用宽度（参考视口 1600）
 *
 * 口径：全宽页 = 1600 − 侧栏 200 − 内容左右内边距 40 − 表格边框 ≈ 1359；
 * 双栏右栏再减左栏宽与栏间距（实测 22，含栏间 20 与表格边框）。
 * 参考视口取 1600 而非 1440：长文本列有 340 的可读下限，按 1440 计会迫使该列或其它列被压到不可读
 * （宁可窄屏时表格内滚动，也不牺牲大屏下的信息完整度）。
 * 布局调整（侧栏宽、内容内边距）后只需改这里，页面与表格无需改动。
 */

/** 表格可用宽度常量（px） */
export const TABLE_BUDGET = {
  /** 全宽列表页（无左栏） */
  full: 1359,
  /** 双栏页左栏与右栏之间的占位（栏间距 + 边框） */
  splitGap: 22,
} as const;

/** 双栏右栏可用宽度：全宽减去左栏宽与栏间距 */
export function splitPanelBudget(sideWidth: number): number {
  return TABLE_BUDGET.full - sideWidth - TABLE_BUDGET.splitGap;
}
