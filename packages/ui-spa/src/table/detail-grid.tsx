/**
 * 行展开面板：把表格列放不下的详情字段渲染成自适应网格卡片
 *
 * 自适应：列数由 `minItemWidth` 与容器宽度共同决定（auto-fill），不写死断点，
 * 宽屏自然铺满、窄屏自动降为单列；卡片为描边直角容器，头部为中文标签 +
 * 英文键标识 + 复制按钮（hover / focus 时显现，触屏与键盘仍可达）。
 */
import { CopyOutlined } from "@ant-design/icons";
import { Button, Tag, Tooltip } from "antd";
import type { ReactNode } from "react";
import { copyText } from "../clipboard";
import { COLUMN_WIDTH } from "./column-width";
import {
  DETAIL_EMPTY_TEXT,
  type DetailGridItem,
  isEmptyDetailValue,
  resolveDetailCopyText,
} from "./detail-grid.utils";

/** 单个字段卡片的最小宽度（px） */
export const DETAIL_GRID_ITEM_WIDTH = 320;

/** antd 表格单元格的水平内边距（展开行的 td 同为 16px） */
const TABLE_CELL_PADDING = 16;

export interface DetailGridProps {
  /** 字段列表 */
  items: DetailGridItem[];
  /** 空值占位符，默认「—」 */
  emptyText?: string;
  /** 卡片最小宽度（px），默认 320 */
  minItemWidth?: number;
  /** 附加类名，作用于网格容器 */
  className?: string;
}

/**
 * 值区域：超长文本按行高截断并由 Tooltip 展示全文；
 * 非字符串值（Tag / 预览组件等）直接渲染，不套 Tooltip
 */
function DetailGridValue({ value, emptyText }: { value?: ReactNode; emptyText: string }) {
  if (isEmptyDetailValue(value)) {
    return <div className="text-xs text-foreground-tertiary">{emptyText}</div>;
  }
  const content = (
    <div className="max-h-16 overflow-hidden font-mono text-xs break-all text-foreground-tertiary">
      {value}
    </div>
  );
  if (typeof value !== "string") return content;
  return (
    <Tooltip title={value} mouseEnterDelay={0.5}>
      {content}
    </Tooltip>
  );
}

export function DetailGrid({
  items,
  emptyText = DETAIL_EMPTY_TEXT,
  minItemWidth = DETAIL_GRID_ITEM_WIDTH,
  className,
}: DetailGridProps) {
  const containerClass = ["grid gap-2 py-2", className].filter(Boolean).join(" ");

  return (
    <div
      className={containerClass}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
        // 左边缘与首个数据列对齐：展开行 td 自带 16px 内边距，补足展开列宽与之差
        paddingLeft: COLUMN_WIDTH.expand - TABLE_CELL_PADDING,
        paddingRight: 0,
      }}
    >
      {items.map((item) => {
        const copyValue = resolveDetailCopyText(item);
        const showCopy = item.copyable !== false && copyValue !== null;
        return (
          <div key={item.key} className="group border border-border bg-background px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">{item.label}</span>
                {item.fieldKey && (
                  <Tag className="m-0 shrink-0 text-xs leading-none" color="default">
                    {item.fieldKey}
                  </Tag>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.extra}
                {showCopy && (
                  <Tooltip title="复制">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label="复制"
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      style={{ paddingInline: 4 }}
                      onClick={() => void copyText(copyValue)}
                    />
                  </Tooltip>
                )}
              </div>
            </div>
            <DetailGridValue value={item.value} emptyText={emptyText} />
          </div>
        );
      })}
    </div>
  );
}
