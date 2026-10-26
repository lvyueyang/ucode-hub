/**
 * 管理端双栏（master-detail）骨架：左侧定宽列表 + 右侧内容
 *
 * 使用前提（见 admin-design skill §3.6）：左栏必须是**独立实体列表**或**常驻可见就有价值的
 * 分组概览**；单纯分类筛选用页头 Select。左栏与右侧表格采用同一套视觉逻辑——
 * 灰底标题行（与表头同色）+ 白底内容 + 同色边框，两者读作一对。
 * 左栏固定高度并吸顶，列表自身滚动：右栏内容（如不分页的长表）滚动时左栏不跟着滚走。
 * 右栏列宽预算按实宽下发（全宽 − 左栏宽 − 栏间距），见 table-budget。
 */
import { TableBudgetProvider } from "@ucode/hub-ui-spa/table";
import type { ReactNode } from "react";
import { splitPanelBudget } from "./table-budget";

/** 左栏宽度档位：分组概览 180 / 实体列表 200 */
export const SPLIT_PANEL_WIDTH = {
  narrow: 180,
  base: 200,
} as const;

/**
 * 左栏高度：内容区可视高度（视口 − 标题栏 − 内容区上下内边距 2.5rem）
 * 与吸顶配合，得到「页头之下、整屏高、内部滚动」的固定栏
 */
const SIDE_PANEL_HEIGHT = "calc(100vh - var(--admin-header-height) - 2.5rem)";

interface AdminSplitPanelProps {
  /** 左栏标题（如「配置分组」「字典类型」），与表格表头同色同高 */
  sideTitle: string;
  /** 左栏宽度档位（默认实体列表 200） */
  sideWidth?: (typeof SPLIT_PANEL_WIDTH)[keyof typeof SPLIT_PANEL_WIDTH];
  /** 左栏内容（AdminSplitPanel.Item 列表） */
  side: ReactNode;
  /** 右栏内容（表格或详情） */
  children: ReactNode;
}

interface AdminSplitPanelItemProps {
  /** 主文案（名称） */
  primary: string;
  /** 次要文案（标识 / 说明），可选 */
  secondary?: string;
  /** 右侧辅助信息（如条目数），可选 */
  extra?: ReactNode;
  /** 行内操作（编辑 / 删除），被点时不触发选中 */
  actions?: ReactNode;
  /** 是否当前选中 */
  active?: boolean;
  onSelect?: () => void;
}

/**
 * 左栏列表项：整行可点，行内操作独立于选中
 * 交互态与侧边导航一致——悬停半透明底色、按下再压深一档、选中用左侧色条 + 主色文字；
 * 色条由 `border-l-transparent` 占位，切换态不引起内容位移；键盘聚焦有内描边
 */
export function AdminSplitPanelItem({
  primary,
  secondary,
  extra,
  actions,
  active,
  onSelect,
}: AdminSplitPanelItemProps) {
  return (
    <div
      className={`flex items-center gap-2 border-b border-l-[3px] border-divider py-2.5 pr-3 pl-3 transition-colors last:border-b-0 ${
        active
          ? "border-l-primary bg-primary-bg"
          : "border-l-transparent hover:bg-accent/60 active:bg-accent"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
      >
        <span
          className={`block truncate text-sm ${
            active ? "font-semibold text-primary" : "text-foreground"
          }`}
        >
          {primary}
        </span>
        {secondary && (
          <span className="block truncate text-xs text-foreground-tertiary">{secondary}</span>
        )}
      </button>
      {extra !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-foreground-tertiary">{extra}</span>
      )}
      {actions && <span className="flex shrink-0 items-center gap-0.5">{actions}</span>}
    </div>
  );
}

export function AdminSplitPanel({
  sideTitle,
  sideWidth = SPLIT_PANEL_WIDTH.base,
  side,
  children,
}: AdminSplitPanelProps) {
  return (
    <div className="flex items-start gap-5">
      <div
        className="sticky top-0 flex shrink-0 flex-col border border-border"
        style={{ width: sideWidth, height: SIDE_PANEL_HEIGHT }}
      >
        {/* 标题行与表格表头同色同高（14px/600 + 16px 内边距），两栏连成一条视觉带 */}
        <div className="flex shrink-0 items-center border-b border-border bg-background-secondary px-4 py-4 font-semibold text-foreground text-sm">
          {sideTitle}
        </div>
        {/* 列表超出固定高度时自身滚动，不推动右栏 */}
        <div className="min-h-0 flex-1 overflow-auto">{side}</div>
      </div>
      {/* 右栏宽度随左栏档位变化，列宽预算按实宽下发（见 table-budget） */}
      <div className="min-w-0 flex-1">
        <TableBudgetProvider value={splitPanelBudget(sideWidth)}>{children}</TableBudgetProvider>
      </div>
    </div>
  );
}

AdminSplitPanel.Item = AdminSplitPanelItem;
