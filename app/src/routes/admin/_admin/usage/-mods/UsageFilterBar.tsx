/**
 * 用量页筛选条：时间范围（含快捷项）、账号类型、模型模糊匹配，状态收进「筛选 ▾」
 * 点查询才请求；输入项只维护草稿，回车等同点查询。
 */
import { DatePicker, Input, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";

import { AdminFilterItem, AdminFilters } from "#/components/admin";
import type { UsageFilterDraft } from "./usage.shared";

const { RangePicker } = DatePicker;

/** 时间快捷项：用量排查集中在最近几天 */
const PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: "今天", value: [dayjs().startOf("day"), dayjs().endOf("day")] },
  { label: "近 7 天", value: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  {
    label: "近 30 天",
    value: [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")],
  },
  { label: "本月", value: [dayjs().startOf("month"), dayjs().endOf("day")] },
];

const ACCOUNT_OPTIONS = [
  { label: "管理端账号", value: "admin" },
  { label: "客户端账号", value: "client" },
];

const STATUS_OPTIONS = [
  { label: "成功", value: "ok" },
  { label: "失败", value: "error" },
];

interface UsageFilterBarProps {
  draft: UsageFilterDraft;
  onChange: (patch: Partial<UsageFilterDraft>) => void;
  onQuery: () => void;
  onReset: () => void;
}

export function UsageFilterBar({ draft, onChange, onQuery, onReset }: UsageFilterBarProps) {
  return (
    <AdminFilters
      onQuery={onQuery}
      onReset={onReset}
      moreCount={draft.status ? 1 : 0}
      more={
        <AdminFilterItem label="状态">
          <Select
            className="w-full"
            placeholder="全部"
            value={draft.status}
            onChange={(value?: UsageFilterDraft["status"]) => onChange({ status: value })}
            options={STATUS_OPTIONS}
            allowClear
          />
        </AdminFilterItem>
      }
    >
      <RangePicker
        value={draft.dateRange}
        // 区间不允许清空：区间是用量的必备条件，清了反而要再猜一个默认值
        allowClear={false}
        presets={PRESETS}
        onChange={(range) => {
          if (!range?.[0] || !range[1]) return;
          onChange({ dateRange: [range[0], range[1]] });
        }}
      />
      <Select
        placeholder="账号类型"
        value={draft.accountType}
        onChange={(value?: UsageFilterDraft["accountType"]) => onChange({ accountType: value })}
        options={ACCOUNT_OPTIONS}
        allowClear
        style={{ width: 130 }}
      />
      <Input
        placeholder="模型（模糊）"
        value={draft.model}
        onChange={(event) => onChange({ model: event.target.value })}
        onPressEnter={onQuery}
        allowClear
        style={{ width: 200 }}
      />
    </AdminFilters>
  );
}
