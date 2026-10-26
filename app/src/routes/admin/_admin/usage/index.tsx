/**
 * 管理端用量统计页：中继模型端点的调用明细 + 页头汇总
 * 列表骨架 / 查询状态 / 分页排序统一走 AdminListPage + useListQuery；
 * 汇总与列表共用同一套筛选（服务层同一份 where），
 * 因此「查询」会同时刷新两者——页头卡片与下方明细永远说同一件事。
 */
import { createFileRoute } from "@tanstack/react-router";
import { ProTable } from "@ucode/hub-ui-spa/table";
import { Spin } from "antd";
import { useCallback, useState } from "react";
import { AdminListPage } from "#/components/admin";
import { AnalyticsKpiCards } from "#/components/admin/analytics";
import type { ModelUsageListItem, UsageTotals } from "#/services/usage/usage.server";
import { sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import { UsageFilterBar } from "./-mods/UsageFilterBar";
import { getUsageListSFn, getUsageTotalsSFn } from "./-mods/usage.functions";
import {
  buildUsageKpiItems,
  defaultUsageDraft,
  toUsageQuery,
  type UsageFilterDraft,
  type UsageQuery,
} from "./-mods/usage.shared";
import { usageColumns } from "./-mods/usageColumns";

export const Route = createFileRoute("/admin/_admin/usage/")({
  component: UsagePage,
  // 首屏与页面同口径：默认近 7 天，列表与汇总各取一次
  loader: async () => {
    const query = toUsageQuery(defaultUsageDraft());
    const [list, totals] = await Promise.all([
      getUsageListSFn({ data: query }),
      getUsageTotalsSFn({ data: query }),
    ]);
    return { list, totals };
  },
});

function UsagePage() {
  const initial = Route.useLoaderData();
  const [draft, setDraft] = useState<UsageFilterDraft>(defaultUsageDraft);
  const [totals, setTotals] = useState<UsageTotals>(initial.totals);
  const [totalsLoading, setTotalsLoading] = useState(false);

  const list = useListQuery<ModelUsageListItem, UsageQuery>({
    initial: initial.list,
    initialFilters: toUsageQuery(defaultUsageDraft()),
    errorMessage: "加载用量列表失败",
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getUsageListSFn({ data: { page, pageSize, sortField, sortOrder, ...filters } }),
      [],
    ),
  });

  /** 汇总跟着筛选走：只在「点查询 / 重置」时重取（翻页排序不改变筛选，不必重取） */
  const refreshTotals = async (query: UsageQuery) => {
    setTotalsLoading(true);
    const [result] = await sfnUnwrap(getUsageTotalsSFn({ data: query }), {
      error: "加载用量汇总失败",
    });
    setTotalsLoading(false);
    if (result) setTotals(result);
  };

  const handleQuery = () => {
    const query = toUsageQuery(draft);
    list.applyFilters(query);
    void refreshTotals(query);
  };

  const handleReset = () => {
    const next = defaultUsageDraft();
    setDraft(next);
    const query = toUsageQuery(next);
    list.applyFilters(query);
    void refreshTotals(query);
  };

  return (
    <AdminListPage
      title="用量统计"
      description="中继模型端点的调用明细与 token 汇总（按调用账号归属）"
      filters={
        <UsageFilterBar
          draft={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onQuery={handleQuery}
          onReset={handleReset}
        />
      }
      stats={
        <Spin spinning={totalsLoading}>
          <AnalyticsKpiCards items={buildUsageKpiItems(totals)} columns={6} />
        </Spin>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={usageColumns({ sortProps: list.sortProps })}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "该时间范围内暂无调用记录" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />
    </AdminListPage>
  );
}
