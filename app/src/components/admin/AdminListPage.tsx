/**
 * 管理端列表页骨架：页面标题 + 附加区块 + 表格区域
 *
 * 统一职责（各列表页不再各写一遍）：
 * - 组合 AdminPageContent（吸顶标题栏 + 定高滚动内容区）
 * - 标题栏三段式：`filters` 进标题栏中段（筛选），`extra` 进右段（操作）
 * - 表格区域测量剩余高度并经 context 下发，ProTable 自动继承表体高度（表头与分页器固定）
 * - 区块间距统一：看板 → 表格
 */
import { TableHeightProvider, useTableBodyHeight } from "@ucode/hub-ui-spa/table";
import type { ReactNode } from "react";
import { AdminPageContent } from "./AdminPageContent";

interface AdminListPageProps {
  title: ReactNode;
  description?: string;
  /** 标题栏右侧主操作（如「新建」按钮）与次要操作 */
  extra?: ReactNode;
  /** 顶部附加区块（统计看板、上传区等） */
  stats?: ReactNode;
  /** 标题栏中段的筛选段（用 AdminFilters 组装） */
  filters?: ReactNode;
  /** 表格区域（ProTable 或表格 + 弹层） */
  children: ReactNode;
}

export function AdminListPage({
  title,
  description,
  extra,
  stats,
  filters,
  children,
}: AdminListPageProps) {
  const { areaRef, height } = useTableBodyHeight();

  return (
    <AdminPageContent title={title} description={description} titleTrailing={filters} extra={extra}>
      {stats && <div className="mb-4">{stats}</div>}
      {/* 表格区域：ref 用于测量顶部偏移，context 向内部 ProTable 注入表体高度 */}
      <div ref={areaRef}>
        <TableHeightProvider value={height}>{children}</TableHeightProvider>
      </div>
    </AdminPageContent>
  );
}
