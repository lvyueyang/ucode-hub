/**
 * 表格域桶导出
 * - ProTable：增强表格（valueType / ellipsis / copyable / emptyText / 表体高度继承 / 列宽预算）
 * - TableOperate：操作列容器（Edit / Delete / Link / More / Custom + 禁用原因提示）
 * - 内联编辑单元格：SortOrderCell / PublishSwitchCell（通用态就地修改）
 * - 状态列：StatusTag（值 → 文案 + 语义色）
 * - ImageCell：图片 / 封面列（固定正方形 + contain，放表格最前）
 * - DetailGrid：行展开面板（自适应网格 + 中文标签 / 英文键 / 复制按钮）
 * - 表体高度：TableHeightProvider / useTableBodyHeight / useTableHeight
 * - 列宽：COLUMN_WIDTH 档位 / actionsWidth 操作列公式 / 列宽预算（自动 scroll.x + 开发期校验）
 */
export { actionsWidth, COLUMN_WIDTH } from "./column-width";
export {
  DETAIL_GRID_ITEM_WIDTH,
  DetailGrid,
  type DetailGridProps,
} from "./detail-grid";
export {
  DETAIL_EMPTY_TEXT,
  type DetailGridItem,
  formatDetailValue,
  isEmptyDetailValue,
  resolveDetailCopyText,
} from "./detail-grid.utils";
export { IMAGE_CELL_SIZE, ImageCell, type ImageCellProps } from "./image-cell";
export {
  PublishSwitchCell,
  type PublishSwitchCellProps,
  SortOrderCell,
  type SortOrderCellProps,
} from "./inline-cells";
export {
  formatDateTimeValue,
  type ProColumnType,
  ProTable,
  type ProTableProps,
} from "./pro-table";
export {
  StatusTag,
  type StatusTagOption,
  type StatusTagProps,
  type StatusTone,
} from "./status-tag";
export {
  applyColumnBudget,
  type ColumnBudgetOptions,
  type ColumnBudgetResult,
  type ElasticColumnMarker,
  EXPAND_COLUMN_WIDTH_DEFAULT,
  enableColumnBudgetWarning,
  SELECTION_COLUMN_WIDTH_DEFAULT,
  TableBudgetProvider,
  type TableBudgetProviderProps,
  useTableBudget,
  warnColumnBudget,
} from "./table-budget";
export {
  ADMIN_SCROLL_CONTAINER_ATTR,
  TABLE_BODY_HEIGHT_FALLBACK,
  type TableBodyHeight,
  TableHeightProvider,
  useTableBodyHeight,
  useTableHeight,
} from "./table-height";
export {
  TableOperate,
  type TableOperateMoreItem,
  withDisabledReason,
} from "./table-operate";
