/**
 * 列表页筛选组：页头筛选段的内容物（内联筛选 + 「筛选 ▾」折叠 + 查询 / 重置）
 *
 * 取代此前的 AdminTableToolbar：不再两端对齐（左侧一两个控件、右侧一堆按钮会留下大片死区），
 * 而是左起连续排列，低频筛选收进「筛选 ▾」浮层，保证页头始终只有一行。
 * 「查询」「重置」紧邻筛选控件，不再分置页面两端。
 */
import { DownOutlined, FilterOutlined, SearchOutlined } from "@ant-design/icons";
import { Badge, Button, Popover } from "antd";
import type { ReactNode } from "react";

/** 「筛选 ▾」浮层内的单项筛选：自带标签、纵向排列，控件需占满浮层宽度 */
export function AdminFilterItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

interface AdminFiltersProps {
  /** 内联筛选控件（搜索 / 状态 / 主筛选），按使用频率从左到右排列 */
  children: ReactNode;
  /** 收进「筛选 ▾」浮层的低频筛选（用 AdminFilterItem 包裹） */
  more?: ReactNode;
  /** 浮层内已启用的筛选数量，大于 0 时在按钮上显示角标 */
  moreCount?: number;
  /** 传即渲染「查询」主按钮（点查询才请求的页面用） */
  onQuery?: () => void;
  /** 传即渲染「重置」按钮（清空全部筛选条件并回到第 1 页） */
  onReset?: () => void;
}

export function AdminFilters({
  children,
  more,
  moreCount = 0,
  onQuery,
  onReset,
}: AdminFiltersProps) {
  return (
    <>
      {children}
      {more && (
        <Popover
          trigger="click"
          placement="bottomLeft"
          content={<div className="flex w-64 flex-col gap-3">{more}</div>}
        >
          <Badge count={moreCount} size="small" offset={[-4, 2]}>
            <Button icon={<FilterOutlined />}>
              筛选
              <DownOutlined />
            </Button>
          </Badge>
        </Popover>
      )}
      {onQuery && (
        <Button type="primary" icon={<SearchOutlined />} onClick={onQuery}>
          查询
        </Button>
      )}
      {onReset && <Button onClick={onReset}>重置</Button>}
    </>
  );
}
