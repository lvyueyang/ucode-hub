/**
 * 日志查询页面：按级别、关键词与日期范围检索日志文件内容
 * 筛选为「点查询才请求」模式，输入框仅维护草稿条件
 */
import { DownloadOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { COLUMN_WIDTH, ProTable, StatusTag, type StatusTagOption } from "@ucode/hub-ui-spa/table";
import { DatePicker, Input, Select, Space, Tag, Tooltip } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useState } from "react";
import { AdminFilterItem, AdminFilters, AdminListPage } from "#/components/admin";
import { LEVEL_OPTIONS } from "#/constants";
import type { LogEntry } from "#/services/logs/logs.server";
import { useListQuery } from "#/utils/use-list-query";
import { getDatesSFn, searchLogsSFn } from "./-mods/logs.functions";

/** 日志级别 → 展示配置（对齐 LEVEL_COLORS 的语义色） */
const LEVEL_TAG_OPTIONS: Record<string, StatusTagOption> = {
  info: { label: "INFO", tone: "info" },
  warn: { label: "WARN", tone: "warning" },
  error: { label: "ERROR", tone: "danger" },
  fatal: { label: "FATAL", tone: "danger" },
  debug: { label: "DEBUG", tone: "neutral" },
};

/** 日志列表筛选条件 */
interface LogFilters {
  keyword: string;
  level: string;
  startDate?: string;
  endDate?: string;
}

export const Route = createFileRoute("/admin/_admin/logs/")({
  component: LogsPage,
  loader: async () => {
    const [result, dates] = await Promise.all([
      searchLogsSFn({ data: { page: 1, pageSize: 20 } }),
      getDatesSFn(),
    ]);
    return { result, availableDates: dates };
  },
});

function LogsPage() {
  const initial = Route.useLoaderData();
  const [availableDates] = useState<string[]>(initial.availableDates);

  // 草稿条件：仅在点击「查询」时提交，避免输入即请求
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const list = useListQuery<LogEntry, LogFilters>({
    initial: {
      records: initial.result.entries,
      total: initial.result.total,
      page: initial.result.page,
      pageSize: initial.result.pageSize,
    },
    initialFilters: { keyword: "", level: "" },
    errorMessage: "日志查询失败",
    fetcher: useCallback(async ({ page, pageSize, filters }) => {
      const result = await searchLogsSFn({
        data: {
          keyword: filters.keyword || undefined,
          level: filters.level || undefined,
          startDate: filters.startDate,
          endDate: filters.endDate,
          page,
          pageSize,
        },
      });
      return {
        records: result.entries,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    }, []),
  });

  /** 提交草稿条件查询（applyFilters 自动回到第 1 页） */
  const handleSearch = () => {
    list.applyFilters({
      keyword,
      level,
      startDate: dateRange?.[0]?.format("YYYY-MM-DD"),
      endDate: dateRange?.[1]?.format("YYYY-MM-DD"),
    });
  };

  /** 重置筛选条件并重新查询 */
  const handleReset = () => {
    setKeyword("");
    setLevel("");
    setDateRange(null);
    list.applyFilters({
      keyword: "",
      level: "",
      startDate: undefined,
      endDate: undefined,
    });
  };

  /** 点击日期标签：以该日为范围查询（保留已提交的关键词与级别） */
  const handleDateClick = (date: string) => {
    const day = dayjs(date);
    setDateRange([day, day]);
    list.applyFilters({ startDate: date, endDate: date });
  };

  // 日志条目无稳定主键，行标识由时间戳与页内序号组合
  const columns = [
    {
      title: "时间",
      dataIndex: "time",
      key: "time",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute" as const,
    },
    {
      title: "级别",
      dataIndex: "level",
      key: "level",
      width: COLUMN_WIDTH.status,
      render: (value: string) => <StatusTag value={value} options={LEVEL_TAG_OPTIONS} />,
    },
    {
      title: "消息内容",
      dataIndex: "msg",
      key: "msg",
      // 弹性列：宽度为出现横向滚动时的最小可读宽，大屏余宽归它
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
      render: (msg: string | undefined) => msg ?? "",
    },
  ];

  return (
    <AdminListPage
      title="日志查询"
      description="搜索和查看系统操作日志文件"
      filters={
        <AdminFilters
          onQuery={handleSearch}
          onReset={handleReset}
          // 日期快选与「下载该日日志」共用一个入口，收进「筛选 ▾」避免页头出现第二行
          more={
            availableDates.length > 0 ? (
              <AdminFilterItem label="日志日期（点日期按当天查询，右侧图标下载该日文件）">
                <div className="flex flex-wrap items-center gap-1.5">
                  {availableDates.slice(0, 14).map((date) => (
                    <Space key={date} size={0}>
                      <Tag
                        color="default"
                        className="cursor-pointer"
                        style={{ margin: 0 }}
                        onClick={() => handleDateClick(date)}
                      >
                        {date}
                      </Tag>
                      <Tooltip title="下载该日日志文件">
                        <a
                          href={`/admin/logs/download/${date}`}
                          className="inline-flex items-center px-1"
                        >
                          <DownloadOutlined className="text-xs text-muted-foreground" />
                        </a>
                      </Tooltip>
                    </Space>
                  ))}
                </div>
              </AdminFilterItem>
            ) : undefined
          }
        >
          <Input
            placeholder="搜索日志关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
            style={{ width: 180 }}
          />
          <Select
            value={level}
            onChange={setLevel}
            options={LEVEL_OPTIONS}
            style={{ width: 110 }}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | null)}
            placeholder={["开始日期", "结束日期"]}
            format="YYYY-MM-DD"
            style={{ width: 240 }}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey={(record, index) => `${record.time ?? record.timestamp ?? ""}-${index}`}
        loading={list.loading}
        locale={{ emptyText: "暂无日志" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
        expandable={{
          columnWidth: 50,
          expandedRowRender: (record: LogEntry) => (
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
