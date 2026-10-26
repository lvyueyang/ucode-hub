/**
 * 管理端页面容器：吸顶标题栏 + 内容区
 * 标题栏按三段式排布，替代各页面手动编写的标题区域与独立筛选行：
 * - 标题段：仅标题，定宽收窄并省略；说明文案走 `description`，以 Tooltip 在悬停标题时显示，
 *   不占标题栏第二行（实时计数等动态说明同样放这里）
 * - 筛选段（titleTrailing）：左起紧贴标题，占满中段，承载搜索 / 状态筛选 / 日期范围等
 * - 操作段（extra）：右对齐，主操作在前、次要操作在后（`ml-auto` 在无筛选段时同样贴右）
 */
import { TableBudgetProvider } from "@ucode/hub-ui-spa/table";
import { Tooltip } from "antd";
import type { ReactNode } from "react";
import { TABLE_BUDGET } from "./table-budget";

/** 标题段最大宽度：保证筛选段与操作段在 1440 视口下都有可用空间 */
const TITLE_MAX_WIDTH = 300;
/** 说明 Tooltip 的悬停延迟：避免鼠标划过标题时误弹 */
const DESCRIPTION_TOOLTIP_DELAY = 0.3;

interface AdminPageContentProps {
  title: ReactNode;
  /** 页面说明：不占版面，悬停标题时以 Tooltip 显示 */
  description?: string;
  /** 标题右侧同行的扩展内容（列表页的筛选段），不传时无影响 */
  titleTrailing?: ReactNode;
  /** 标题栏右侧操作（主操作在前，如「新建」） */
  extra?: ReactNode;
  children: ReactNode;
}

export function AdminPageContent({
  title,
  description,
  titleTrailing,
  extra,
  children,
}: AdminPageContentProps) {
  const heading = <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 标题栏：定高，高度由 CSS 变量 --admin-header-height 提供 */}
      <div
        className="z-10 flex shrink-0 items-center gap-4 border-b border-border bg-background px-5"
        style={{ height: "var(--admin-header-height)" }}
      >
        <div className="min-w-0 shrink-0" style={{ maxWidth: TITLE_MAX_WIDTH }}>
          {description ? (
            <Tooltip
              title={description}
              placement="bottomLeft"
              mouseEnterDelay={DESCRIPTION_TOOLTIP_DELAY}
            >
              {heading}
            </Tooltip>
          ) : (
            heading
          )}
        </div>
        {titleTrailing && (
          <div className="flex min-w-0 flex-1 items-center gap-3">{titleTrailing}</div>
        )}
        {extra && <div className="ml-auto flex shrink-0 items-center gap-2">{extra}</div>}
      </div>
      {/* 内容区：高度 = 视口 - 标题栏高，内部滚动，便于子元素按已知高度布局。
				data-admin-scroll-container 标记滚动容器，供列表页骨架测量表格可用高度 */}
      <div
        data-admin-scroll-container=""
        className="scrollbar-thin overflow-auto p-5"
        style={{ height: "calc(100vh - var(--admin-header-height))" }}
      >
        {/* 列宽预算默认按全宽页下发，双栏页由 AdminSplitPanel 覆盖为右栏实宽 */}
        <TableBudgetProvider value={TABLE_BUDGET.full}>{children}</TableBudgetProvider>
      </div>
    </div>
  );
}
