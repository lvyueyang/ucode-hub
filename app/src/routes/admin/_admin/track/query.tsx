/**
 * 埋点事件查询页面：按事件、关键词与日期范围检索客户端上报的埋点事件
 * 筛选为「点查询才请求」模式，事件/关键词/日期仅维护草稿条件
 */
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { downloadFile } from "@ucode/hub-lib/export";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { COLUMN_WIDTH, DetailGrid, formatDetailValue, ProTable } from "@ucode/hub-ui-spa/table";
import { Button, DatePicker, Input, Select, Tag } from "antd";
import dayjs from "dayjs";
import type { ChangeEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { AdminFilterItem, AdminFilters, AdminListPage } from "#/components/admin";
import { getTrackEventMetaSFn, getTrackPropertyMetaSFn } from "#/services/track/track.functions";
import type { TrackEventRecord, TrackPropertyMetaRecord } from "#/services/track/track.types";
import { useListQuery } from "#/utils/use-list-query";
import { getTrackEventNamesSFn, searchTrackEventsSFn } from "./-mods/query.functions";

const { RangePicker } = DatePicker;

/** 埋点事件列表筛选条件 */
interface TrackEventFilters {
  name: string;
  keyword: string;
  startDate?: string;
  endDate?: string;
}

export const Route = createFileRoute("/admin/_admin/track/query")({
  component: EventListPage,
  loader: async () => {
    const [eventNames, presetEvents, presetProperties, result] = await Promise.all([
      getTrackEventNamesSFn(),
      getTrackEventMetaSFn().catch(() => []),
      getTrackPropertyMetaSFn().catch(() => []),
      searchTrackEventsSFn({ data: {} }),
    ]);
    return { eventNames, presetEvents, presetProperties, result };
  },
});

function EventListPage() {
  const {
    eventNames,
    presetEvents,
    presetProperties,
    result: initialResult,
  } = Route.useLoaderData();

  // 草稿条件：仅在点击「查询」时提交
  const [eventName, setEventName] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const list = useListQuery<TrackEventRecord, TrackEventFilters>({
    initial: {
      records: initialResult.records,
      total: initialResult.total,
      page: initialResult.page,
      pageSize: initialResult.pageSize,
    },
    initialFilters: { name: "", keyword: "" },
    errorMessage: "埋点事件查询失败",
    fetcher: useCallback(
      async ({ page, pageSize, sortField, sortOrder, filters }) =>
        searchTrackEventsSFn({
          data: {
            name: filters.name || undefined,
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

  /** 事件名 → 显示名称映射 */
  const eventLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const event of presetEvents) {
      map[event.name] = event.label;
    }
    return map;
  }, [presetEvents]);

  /** 属性键 → 显示名称映射 */
  const propertyLabelMap = useMemo(() => {
    const map: Record<string, Pick<TrackPropertyMetaRecord, "label" | "dataType">> = {};
    for (const property of presetProperties) {
      map[property.key] = {
        label: property.label,
        dataType: property.dataType,
      };
    }
    return map;
  }, [presetProperties]);

  /** 提交草稿条件查询（applyFilters 自动回到第 1 页） */
  const handleSearch = () => {
    list.applyFilters({
      name: eventName ?? "",
      keyword,
      startDate: dateRange?.[0]?.format("YYYY-MM-DD"),
      endDate: dateRange?.[1]?.format("YYYY-MM-DD"),
    });
  };

  /** 重置筛选条件并重新查询 */
  const handleReset = () => {
    setEventName(undefined);
    setKeyword("");
    setDateRange(null);
    list.applyFilters({
      name: "",
      keyword: "",
      startDate: undefined,
      endDate: undefined,
    });
  };

  /** 导出当前页事件为 CSV */
  const handleExport = () => {
    const headers = ["事件名称", "用户ID", "会话ID", "属性", "触发时间", "接收时间"];
    const rows = list.data.records.map((event) => [
      event.name,
      event.userId ?? "-",
      event.sessionId,
      JSON.stringify(event.properties),
      event.time ? new Date(event.time).toISOString() : "-",
      event.createdAt ? new Date(event.createdAt).toISOString() : "-",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    downloadFile(
      `\uFEFF${csv}`,
      `埋点事件_${dayjs().format("YYYYMMDD_HHmmss")}.csv`,
      "text/csv;charset=utf-8;",
    );
    message.success("导出成功");
  };

  const columns = [
    {
      title: "事件名称",
      dataIndex: "name",
      key: "name",
      // 170：显示名称 + 事件标识 Tag 需要的最小宽度，过窄会把名称折成两行抬高行高
      width: 170,
      render: (value: string) => {
        const label = eventLabelMap[value];
        return (
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{label ?? value}</span>
            {label && (
              <Tag className="m-0 text-xs leading-none" color="blue">
                {value}
              </Tag>
            )}
          </span>
        );
      },
    },
    {
      title: "用户 ID",
      dataIndex: "userId",
      key: "userId",
      width: 200,
      ellipsis: true,
      render: (value: string | null) =>
        value || <span className="text-muted-foreground">匿名</span>,
    },
    {
      title: "会话 ID",
      dataIndex: "sessionId",
      key: "sessionId",
      width: 120,
      ellipsis: true,
    },
    {
      // 不定宽列：吸收剩余宽度（属性是 JSON 长串，最需要宽度）
      title: "属性",
      dataIndex: "properties",
      key: "properties",
      // 弹性列：属性串长度不可控，宽度为出现横向滚动时的最小可读宽
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
      render: (value: Record<string, unknown>) => JSON.stringify(value),
    },
    {
      title: "触发时间",
      dataIndex: "time",
      key: "time",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute" as const,
      // 服务层排序白名单仅支持 time
      ...list.sortProps("time"),
    },
    {
      title: "接收时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute" as const,
    },
  ];

  return (
    <AdminListPage
      title="埋点事件查询"
      description="查询和分析客户端上报的埋点事件数据"
      filters={
        <AdminFilters
          onQuery={handleSearch}
          onReset={handleReset}
          moreCount={dateRange ? 1 : 0}
          more={
            <AdminFilterItem label="触发时间">
              <RangePicker
                className="w-full"
                value={dateRange}
                onChange={(value) => setDateRange(value as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                showTime={false}
                placeholder={["开始日期", "结束日期"]}
              />
            </AdminFilterItem>
          }
        >
          <Select
            placeholder="事件名称"
            value={eventName}
            onChange={setEventName}
            allowClear
            style={{ width: 160 }}
            options={eventNames.map((name) => ({
              label: eventLabelMap[name] ?? name,
              value: name,
            }))}
          />
          <Input
            placeholder="关键词搜索（事件/属性）"
            value={keyword}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
        </AdminFilters>
      }
      extra={
        <>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={list.data.records.length === 0}
          >
            导出 CSV
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void list.reload()}>
            刷新
          </Button>
        </>
      }
    >
      <ProTable
        columns={columns}
        dataSource={list.data.records}
        rowKey="id"
        loading={list.loading}
        onChange={list.onTableChange}
        pagination={list.pagination}
        locale={{ emptyText: "暂无事件数据" }}
        expandable={{
          columnWidth: 50,
          rowExpandable: (record: TrackEventRecord) => Object.keys(record.properties).length > 0,
          expandedRowRender: (record: TrackEventRecord) => (
            <DetailGrid
              items={Object.entries(record.properties).map(([key, value]) => {
                const meta = propertyLabelMap[key];
                return {
                  key,
                  label: meta?.label ?? key,
                  // 无预置元信息时标签即原始键，不再重复展示标识
                  fieldKey: meta ? key : undefined,
                  value: formatDetailValue(value),
                };
              })}
            />
          ),
        }}
      />
    </AdminListPage>
  );
}
