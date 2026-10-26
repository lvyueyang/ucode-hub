/**
 * 操作日志查询页面：按模块、动作、关键词与日期范围检索管理员操作审计记录
 * 筛选为「点查询才请求」模式，输入项仅维护草稿条件
 */

import { createFileRoute } from "@tanstack/react-router";
import { COLUMN_WIDTH, ProTable } from "@ucode/hub-ui-spa/table";
import { DatePicker, Input, Select, Tag } from "antd";
import type { Dayjs } from "dayjs";
import { useCallback, useState } from "react";
import { AdminFilterItem, AdminFilters, AdminListPage } from "#/components/admin";
import {
  ACTION_COLORS,
  ACTION_LABELS,
  MODULE_COLORS,
  MODULE_LABELS,
} from "#/constants/operation-log-meta";
import { useListQuery } from "#/utils/use-list-query";
import {
  getOperationLogModulesSFn,
  type JsonValue,
  searchOperationLogsSFn,
} from "./-mods/operation-logs.functions";

/** 可序列化的操作日志条目（createdAt 为 ISO 字符串） */
interface OperationLogEntry {
  id: string;
  operatorId: string | null;
  operatorName: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  detail: JsonValue;
  createdAt: string;
}

/** 操作日志列表筛选条件 */
interface OperationLogFilters {
  module: string;
  action: string;
  keyword: string;
  startDate?: string;
  endDate?: string;
}

export const Route = createFileRoute("/admin/_admin/operation-logs/")({
  component: OperationLogsPage,
  loader: async () => {
    const [modules, result] = await Promise.all([
      getOperationLogModulesSFn(),
      searchOperationLogsSFn({ data: { page: 1, pageSize: 20 } }),
    ]);
    return { modules, result };
  },
});

function OperationLogsPage() {
  const initial = Route.useLoaderData();
  const [modules] = useState<string[]>(initial.modules);

  // 草稿条件：仅在点击「查询」时提交
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [keyword, setKeyword] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const list = useListQuery<OperationLogEntry, OperationLogFilters>({
    initial: {
      records: initial.result.records,
      total: initial.result.total,
      page: initial.result.page,
      pageSize: initial.result.pageSize,
    },
    initialFilters: { module: "", action: "", keyword: "" },
    errorMessage: "查询失败，请稍后重试",
    fetcher: useCallback(
      async ({ page, pageSize, sortField, sortOrder, filters }) =>
        searchOperationLogsSFn({
          data: {
            module: filters.module || undefined,
            action: filters.action || undefined,
            keyword: filters.keyword || undefined,
            startDate: filters.startDate,
            endDate: filters.endDate,
            page,
            pageSize,
            sortField,
            sortOrder,
          },
        }),
      [],
    ),
  });

  /** 提交草稿条件查询（applyFilters 自动回到第 1 页） */
  const handleSearch = () => {
    list.applyFilters({
      module,
      action,
      keyword,
      startDate: dateRange?.[0]?.format("YYYY-MM-DD"),
      endDate: dateRange?.[1]?.format("YYYY-MM-DD"),
    });
  };

  /** 重置筛选条件并重新查询 */
  const handleReset = () => {
    setModule("");
    setAction("");
    setKeyword("");
    setDateRange(null);
    list.applyFilters({
      module: "",
      action: "",
      keyword: "",
      startDate: undefined,
      endDate: undefined,
    });
  };

  /** 模块下拉：全部 + 库中已有的模块 */
  const moduleOptions = [
    { label: "全部", value: "" },
    ...modules.map((m) => ({ label: MODULE_LABELS[m] ?? m, value: m })),
  ];

  /** 动作下拉：全部 + 已知动作 */
  const actionOptions = [
    { label: "全部", value: "" },
    ...Object.entries(ACTION_LABELS).map(([value, label]) => ({
      label,
      value,
    })),
  ];

  const columns = [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute" as const,
      // 服务层排序白名单仅支持 createdAt
      ...list.sortProps("createdAt"),
    },
    {
      title: "操作人",
      dataIndex: "operatorName",
      key: "operatorName",
      width: 130,
      ellipsis: true,
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module",
      width: 110,
      render: (value: string) => (
        <Tag color={MODULE_COLORS[value] || "default"}>{MODULE_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: "动作",
      dataIndex: "action",
      key: "action",
      width: 100,
      render: (value: string) => (
        <Tag color={ACTION_COLORS[value] || "default"}>{ACTION_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: "目标",
      dataIndex: "targetName",
      key: "targetName",
      // 弹性列：目标名长度不可控，宽度为出现横向滚动时的最小可读宽
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
      render: (value: string | null) => value ?? "—",
    },
  ];

  return (
    <AdminListPage
      title="操作日志"
      description="查看管理员的所有数据变更操作记录"
      filters={
        <AdminFilters
          onQuery={handleSearch}
          onReset={handleReset}
          moreCount={action ? 1 : 0}
          more={
            <AdminFilterItem label="动作">
              <Select
                className="w-full"
                value={action}
                onChange={setAction}
                options={actionOptions}
              />
            </AdminFilterItem>
          }
        >
          <Select
            value={module}
            onChange={setModule}
            options={moduleOptions}
            style={{ width: 130 }}
          />
          <Input
            placeholder="搜索操作人/目标"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
            style={{ width: 200 }}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | null)}
            placeholder={["开始日期", "结束日期"]}
            format="YYYY-MM-DD"
            style={{ width: 260 }}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无操作日志" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
        expandable={{
          columnWidth: 50,
          expandedRowRender: (record: OperationLogEntry) => (
            <pre
              style={{
                maxHeight: 300,
                overflow: "auto",
                padding: 12,
                fontSize: 12,
                backgroundColor: "var(--ant-color-fill-tertiary)",
                borderRadius: 0,
                margin: 0,
              }}
            >
              {JSON.stringify(record, null, 2)}
            </pre>
          ),
          rowExpandable: () => true,
        }}
      />
    </AdminListPage>
  );
}
