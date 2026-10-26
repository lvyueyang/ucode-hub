/**
 * 表格列宽预算：把「每列定宽 + 恰好一列弹性」的规范落到布局层
 *
 * 宽度行为由 antd 的两条实现决定（实测）：
 * - `<table>` 内联 `width: scroll.x; min-width: 100%`，存在固定列时 `table-layout: fixed`
 * - 容器宽于 scroll.x 时，多出的宽度归**没有 width 的列**；容器窄于 scroll.x 时横向滚动，
 *   没有 width 的列恰好等于 `scroll.x − 其余列宽度之和`
 *
 * 因此以「`scroll.x` = 各列宽度之和」为唯一口径：恰好留一列不写 width（弹性列，默认操作列）后，
 * 大屏余宽全部给它、小屏它恰好等于其声明宽——固定列不会因为宽度不足把按钮挤出单元格。
 * `scroll.x` 由列定义推导，页面不再手写（手写值会与列宽悄悄漂移）。
 */
import type { ColumnsType, ColumnType } from "antd/es/table";
import { createContext, type ReactNode, useContext } from "react";

/** 弹性列标记：恰好一列声明，渲染时不写 width，由布局吸收余宽 */
export interface ElasticColumnMarker {
  /**
   * 标记为弹性列
   *
   * 本列仍需声明 `width`，语义变为「出现横向滚动时的宽度」：操作列取内容实算宽
   * （见 `actionsWidth`），长文本列取最小可读宽。
   */
  elastic?: boolean;
}

/** 行展开列缺省宽度：antd 默认值，规范取值见 `COLUMN_WIDTH.expand` */
export const EXPAND_COLUMN_WIDTH_DEFAULT = 48;

/** 行选择列缺省宽度：antd 默认值，规范取值见 `COLUMN_WIDTH.selection` */
export const SELECTION_COLUMN_WIDTH_DEFAULT = 32;

/** 列宽预算选项 */
export interface ColumnBudgetOptions {
  /** 行展开列宽度：不传表示该表没有行展开列 */
  expandWidth?: number;
  /** 行选择列宽度：不传表示该表没有行选择列 */
  selectionWidth?: number;
  /** 参考视口下该表的可用宽度：超出即告警；传 null 显式关闭校验（迷你表 / 演示页） */
  budget?: number | null;
}

/** 列宽预算结果 */
export interface ColumnBudgetResult<T = unknown> {
  /** 处理后的列：弹性列已移除 `width` 与标记，可直接交给 antd */
  columns: ColumnsType<T>;
  /** 表格最小可用宽度：容器窄于它时出现横向滚动，各列保持声明宽 */
  scrollX: number;
  /** 开发期告警（经 `warnColumnBudget` 输出） */
  warnings: string[];
}

/** 列标题（用于告警文案） */
function columnLabel<T>(column: ColumnType<T>): string {
  if (typeof column.title === "string") return column.title;
  if (column.key !== undefined) return String(column.key);
  return "未命名";
}

/** 分组表头的子列 */
function childrenOf<T>(column: ColumnType<T>): ColumnType<T>[] | null {
  const children = (column as { children?: unknown }).children;
  return Array.isArray(children) ? (children as ColumnType<T>[]) : null;
}

/**
 * 计算列宽预算并处理弹性列
 *
 * 非弹性列必须显式声明 `width`（fixed 布局下缺宽列会与其它缺宽列平分余宽）；
 * 分组表头自身不占宽度，其子列递归计入。
 */
export function applyColumnBudget<T>(
  columns: ColumnsType<T>,
  options: ColumnBudgetOptions = {},
): ColumnBudgetResult<T> {
  const warnings: string[] = [];
  const list = columns as (ColumnType<T> & ElasticColumnMarker)[];

  const countElastic = (items: (ColumnType<T> & ElasticColumnMarker)[]): number =>
    items.reduce((count, column) => {
      const children = childrenOf(column);
      return (
        count +
        (column.elastic === true ? 1 : 0) +
        (children ? countElastic(children as (ColumnType<T> & ElasticColumnMarker)[]) : 0)
      );
    }, 0);

  const elasticCount = countElastic(list);
  if (elasticCount > 1) {
    warnings.push(
      `[列宽预算] 弹性列只能有一个，当前 ${elasticCount} 个：多列平分余宽会让列宽不可控`,
    );
  }

  let total = (options.expandWidth ?? 0) + (options.selectionWidth ?? 0);

  /** 递归处理一列：累计宽度、校验缺宽、剥离弹性列的 width */
  const walk = (
    column: ColumnType<T> & ElasticColumnMarker,
  ): ColumnType<T> & ElasticColumnMarker => {
    const children = childrenOf(column);
    if (children) {
      return {
        ...column,
        children: children.map((child) => walk(child as ColumnType<T> & ElasticColumnMarker)),
      } as ColumnType<T> & ElasticColumnMarker;
    }

    const width = typeof column.width === "number" ? column.width : undefined;
    const label = columnLabel(column);

    if (width === undefined) {
      warnings.push(
        column.elastic === true
          ? `[列宽预算] 弹性列「${label}」需要声明 width 作为横向滚动时的宽度`
          : `[列宽预算]「${label}」列缺少 width：fixed 布局下会与其它缺宽列平分余宽`,
      );
    } else {
      total += width;
    }

    if (column.elastic !== true) return column;

    // 弹性列：width 只用于推导 scroll.x，交给布局吸收余宽
    const rest = { ...column };
    delete rest.width;
    delete rest.elastic;
    return rest;
  };

  const next = list.map(walk);

  if (options.budget != null && total > options.budget) {
    warnings.push(
      `[列宽预算] 列宽合计 ${total}px 超出该表预算 ${options.budget}px：参考视口下会出现横向滚动，` +
        "按「详情文本行进展开 → 次要时间列删 → 操作项进更多」裁剪",
    );
  }

  return { columns: next as ColumnsType<T>, scrollX: total, warnings };
}

/**
 * 开发期列宽告警开关
 *
 * 包内不读 `import.meta.env`（ui-spa 未引入 Vite 类型），由宿主在开发期显式开启，
 * 生产构建不调用即完全不输出。
 */
let warnEnabled = false;

/** 开启列宽预算告警（由宿主在开发期调用一次） */
export function enableColumnBudgetWarning(): void {
  warnEnabled = true;
}

/** 同一条告警全局只输出一次，避免每次渲染刷屏 */
const warnedMessages = new Set<string>();

/** 输出列宽预算告警（ProTable 在列变化后调用） */
export function warnColumnBudget(warnings: string[]): void {
  if (!warnEnabled) return;
  for (const message of warnings) {
    if (warnedMessages.has(message)) continue;
    warnedMessages.add(message);
    console.warn(message);
  }
}

const TableBudgetContext = createContext<number | null | undefined>(undefined);

/** 参考可用宽度提供器属性 */
export interface TableBudgetProviderProps {
  /** 该表在参考视口下的可用宽度；null 表示显式关闭校验 */
  value: number | null;
  children: ReactNode;
}

/** 向下提供该表的参考可用宽度（由页面骨架按布局注入，双栏页取其右栏实宽） */
export function TableBudgetProvider({ value, children }: TableBudgetProviderProps) {
  return <TableBudgetContext.Provider value={value}>{children}</TableBudgetContext.Provider>;
}

/** 读取最近的参考可用宽度：undefined = 未声明（跳过校验），null = 显式关闭 */
export function useTableBudget(): number | null | undefined {
  return useContext(TableBudgetContext);
}
