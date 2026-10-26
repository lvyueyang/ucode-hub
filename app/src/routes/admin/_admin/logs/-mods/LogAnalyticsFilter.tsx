/**
 * 运行日志分析筛选区：时间范围（含快捷项）/ 级别 / 粒度 内联，关键词收进「筛选 ▾」
 */

import { DatePicker, Input, Segmented, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { AdminFilterItem, AdminFilters } from "#/components/admin";
import { LEVEL_OPTIONS } from "#/constants";

/** 未提交的筛选状态 */
export interface LogAnalyticsFilterState {
  dateRange: [Dayjs, Dayjs];
  granularity: "hour" | "day";
  level: string;
  keyword?: string;
}

interface LogAnalyticsFilterProps {
  filter: LogAnalyticsFilterState;
  onChange: (patch: Partial<LogAnalyticsFilterState>) => void;
  onQuery: () => void;
  onReset: () => void;
}

export function LogAnalyticsFilter({
  filter,
  onChange,
  onQuery,
  onReset,
}: LogAnalyticsFilterProps) {
  return (
    <AdminFilters
      onQuery={onQuery}
      onReset={onReset}
      moreCount={(filter.keyword ? 1 : 0) + (filter.granularity === "day" ? 0 : 1)}
      more={
        <>
          <AdminFilterItem label="粒度">
            <Segmented
              block
              value={filter.granularity}
              onChange={(v) => onChange({ granularity: v as "hour" | "day" })}
              options={[
                { label: "按小时", value: "hour" },
                { label: "按天", value: "day" },
              ]}
            />
          </AdminFilterItem>
          <AdminFilterItem label="关键词">
            <Input
              className="w-full"
              value={filter.keyword}
              onChange={(e) => onChange({ keyword: e.target.value })}
              placeholder="日志内容 / 模块"
              allowClear
            />
          </AdminFilterItem>
        </>
      }
    >
      <DatePicker.RangePicker
        value={filter.dateRange}
        onChange={(v) => v && onChange({ dateRange: v as [Dayjs, Dayjs] })}
        presets={[
          {
            label: "今天",
            value: [dayjs().startOf("day"), dayjs().endOf("day")],
          },
          {
            label: "近 7 天",
            value: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")],
          },
          {
            label: "近 30 天",
            value: [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")],
          },
        ]}
      />
      <Select
        value={filter.level}
        onChange={(v: string) => onChange({ level: v })}
        options={LEVEL_OPTIONS}
        style={{ width: 110 }}
      />
    </AdminFilters>
  );
}
