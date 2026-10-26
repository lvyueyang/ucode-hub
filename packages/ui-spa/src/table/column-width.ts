/**
 * 列宽档位与操作列宽度计算公式
 *
 * 页面只引用档位常量，不写裸数字：同一类列的宽度在多页之间必须严格一致
 * （历史上 160/165、120/150 这类漂移都是裸数字各自估出来的）。
 * 档位之外的内容列按「文案最大长度 × 字宽 + 单元格内边距」估算后取整，
 * 操作列用 actionsWidth() 按按钮文案实算，避免靠目测反复试数。
 */

/** 单元格左右内边距合计（antd 默认 padding 16 × 2） */
const CELL_PADDING = 32;

/** 中文按 14px、ASCII 按 7.5px 估算文案宽度（14px 字号下的近似值） */
function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += /[\u4e00-\u9fa5]/.test(char) ? 14 : 7.5;
  }
  return width;
}

/**
 * 列宽档位（px）
 *
 * 三项以上难以外推的列型（短文本 / 长文本 / 多值枚举）不设档位，按内容与预算取整。
 */
export const COLUMN_WIDTH = {
  /** 行展开列：图标 16 + 内边距 32（antd 默认 48，留 2 给 `+` 与行缩进） */
  expand: 50,
  /** 行选择列：antd 默认 32，本项目统一 48 与展开列视觉协调 */
  selection: 48,
  /** 头像 / 缩略图：48 图 + 内边距 */
  avatar: 80,
  /** 状态标签：双字标签 68 + 内边距 */
  status: 100,
  /** 布尔开关（PublishSwitchCell）：小号开关 44 + 内边距 */
  toggle: 100,
  /** 排序权重（SortOrderCell）：小号数字输入 83 + 内边距 */
  sortOrder: 115,
  /** 时间（`valueType: "dateTimeMinute"`）：`2026-09-22 10:26` 133 + 内边距 */
  time: 165,
  /** 时间（`valueType: "dateTime"`，含秒）：148 + 内边距 */
  timeSecond: 180,
  /** 枚举 / 标签列缺省上限：2~4 字标签，超出按最长文案调大 */
  tag: 150,
  /** ID / 标识列：短标识（如 `page_view`、`deepseek`） */
  id: 120,
  /** 长标识列：UUID / 哈希 / 路径等（配 `copyable`） */
  uuid: 170,
  /** 短文本列缺省宽（用户名 / 邮箱 / 编码 / 名称）：按典型最长取值 */
  shortText: 180,
  /**
   * 长文本列（标题 / 值 / 文件名 / 路径）
   * 340 是可读下限：低于此值时这类内容频繁触发省略号，只能靠 Tooltip 读全文
   */
  text: 340,
} as const;

/**
 * 操作列宽度：按操作项文案实算并向上取到 10 的整数倍
 *
 * 每项 = 图标 16 + 图标间距 4 + 文案 + 内边距 8×2；项间 8；单元格内边距 32。
 * 对应档位：1 项 100 / 2 项短文案 170 / 3 项短文案 240 / 3 项含四字文案 270 / 4 项 320。
 *
 * 该宽度同时是操作列作为弹性列时「出现横向滚动时的宽度」，
 * 小于内容宽会让按钮溢出到相邻列，故新增或调整操作项后须以其为准。
 */
export function actionsWidth(...labels: string[]): number {
  if (labels.length === 0) return 0;
  const items = labels.reduce((sum, label) => sum + 16 + 4 + textWidth(label) + 16, 0);
  const gaps = (labels.length - 1) * 8;
  return Math.ceil((items + gaps + CELL_PADDING) / 10) * 10;
}
