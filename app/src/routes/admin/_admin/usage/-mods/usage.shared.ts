/**
 * 用量页共用：筛选草稿与查询参数的换算、展示格式化、页头 KPI 项组装。
 * 与 UI 无关的纯函数放在这里，页面与筛选条各自只负责渲染与取值。
 */
import dayjs, { type Dayjs } from "dayjs";

import type { AnalyticsKpiItem } from "#/components/admin/analytics";
import type { UsageTotals } from "#/services/usage/usage.server";

/** 页头筛选草稿：时间范围用 Dayjs，提交时才换算成日期字符串 */
export type UsageFilterDraft = {
  dateRange: [Dayjs, Dayjs];
  accountType?: "admin" | "client";
  model?: string;
  status?: "ok" | "error";
};

/** 提交给服务层的查询条件（与 `usageFilterSchema` 对齐） */
export type UsageQuery = {
  accountType?: "admin" | "client";
  model?: string;
  status?: "ok" | "error";
  startDate: string;
  endDate: string;
};

/**
 * 默认窗口取近 7 天：不设默认窗口时首屏就是全量历史的第一页，
 * 量越大越慢，而「最近发生了什么」才是用量页的常态诉求。
 */
export const defaultUsageDraft = (): UsageFilterDraft => ({
  dateRange: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")],
  accountType: undefined,
  model: undefined,
  status: undefined,
});

/** 草稿 → 查询条件：模型去空白，空串归一为 undefined（别把「没填」变成筛选条件） */
export const toUsageQuery = (draft: UsageFilterDraft): UsageQuery => ({
  accountType: draft.accountType,
  model: draft.model?.trim() || undefined,
  status: draft.status,
  startDate: draft.dateRange[0].format("YYYY-MM-DD"),
  endDate: draft.dateRange[1].format("YYYY-MM-DD"),
});

/** 记数格式：千分位，便于一眼看出量级 */
export const formatCount = (value: number): string => value.toLocaleString("zh-CN");

/** 耗时格式：1 秒以下读毫秒，以上折算成秒（长回答的整段耗时读秒更直观） */
export const formatLatency = (ms: number): string =>
  ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

/** 归属名缺失（账号 / 设备已删）时的回落：UUID 前 8 位足够辨认对象 */
export const shortenId = (id: string): string => id.slice(0, 8);

/** 页头汇总卡：口径与下方列表完全一致（同一套筛选在服务层算） */
export const buildUsageKpiItems = (totals: UsageTotals): AnalyticsKpiItem[] => {
  const failureRate = totals.requests > 0 ? (totals.errorRequests / totals.requests) * 100 : 0;
  return [
    { title: "请求数", value: totals.requests },
    {
      title: "失败数",
      value: totals.errorRequests,
      hint: `失败率 ${failureRate.toFixed(1)}%`,
    },
    { title: "输入 Token", value: totals.promptTokens },
    { title: "输出 Token", value: totals.completionTokens },
    { title: "合计 Token", value: totals.totalTokens },
    { title: "平均耗时", value: totals.avgLatencyMs, suffix: "ms" },
  ];
};
