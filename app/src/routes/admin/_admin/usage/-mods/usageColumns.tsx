/**
 * 用量表格列定义
 * 账号名 / 设备名缺失（账号或设备已删）时回落 ID 短写；失败行在状态标签上挂 Tooltip 给原文案；
 * 时间列统一到分钟，token 与耗时按本页展示格式（见 usage.shared）。
 */
import { COLUMN_WIDTH, StatusTag, type StatusTagOption } from "@ucode/hub-ui-spa/table";
import { Tooltip } from "antd";
import type { ModelUsageListItem } from "#/services/usage/usage.server";
import type { SortProps } from "#/utils/use-list-query";
import { formatCount, formatLatency, shortenId } from "./usage.shared";

/** 调用结果展示配置 */
const STATUS_OPTIONS: Record<string, StatusTagOption> = {
  ok: { label: "成功", tone: "success" },
  error: { label: "失败", tone: "danger" },
};

/** 可空的计数列：拿不到值（上游没回 usage）与 0 必须区分开，故显式回落「—」 */
const countColumn = (title: string, dataIndex: "promptTokens" | "completionTokens") => ({
  title,
  dataIndex,
  key: dataIndex,
  width: COLUMN_WIDTH.id,
  render: (value: number | null) => (value === null ? "—" : formatCount(value)),
});

interface UsageColumnsOptions {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => SortProps;
}

/**
 * 用量表格列：时间 / 账号 / 设备 / 模型 / Token（输入 · 输出 · 合计，分组表头）/ 耗时 / 状态
 *
 * 列宽合计 1355 ≤ 全宽页预算 1359：账号与设备是短文本档 180 / 150，模型 id 长度不可控，
 * 取长文本最小可读宽 340 并作弹性列吸收大屏余宽，token 与耗时为窄数字列（9 字符 ≈ 68 + 内边距）。
 */
export function usageColumns(options: UsageColumnsOptions) {
  return [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute",
      ...options.sortProps("createdAt"),
    },
    {
      title: "账号",
      dataIndex: "accountName",
      key: "accountName",
      width: COLUMN_WIDTH.shortText,
      render: (name: string | null, record: ModelUsageListItem) =>
        name ?? shortenId(record.accountId),
      ellipsis: true,
    },
    {
      title: "设备",
      dataIndex: "deviceName",
      key: "deviceName",
      width: COLUMN_WIDTH.id,
      render: (name: string | null, record: ModelUsageListItem) =>
        name ?? (record.deviceId ? shortenId(record.deviceId) : "—"),
      ellipsis: true,
    },
    {
      title: "模型",
      dataIndex: "model",
      key: "model",
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
    },
    {
      // 三个计数并列且都要可比，用分组表头而不是把两个数字塞进一格（塞进去就没法排序）
      title: "Token",
      key: "tokens",
      children: [
        countColumn("输入", "promptTokens"),
        countColumn("输出", "completionTokens"),
        {
          title: "合计",
          dataIndex: "totalTokens",
          key: "totalTokens",
          width: COLUMN_WIDTH.id,
          ...options.sortProps("totalTokens"),
          render: (value: number | null) => (value === null ? "—" : formatCount(value)),
        },
      ],
    },
    {
      title: "耗时",
      dataIndex: "latencyMs",
      key: "latencyMs",
      width: 90,
      ...options.sortProps("latencyMs"),
      render: (value: number) => formatLatency(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: COLUMN_WIDTH.status,
      render: (value: string, record: ModelUsageListItem) => {
        const tag = <StatusTag value={value} options={STATUS_OPTIONS} />;
        // 失败原因可能很长且只在失败行有意义：挂 Tooltip，不为它单开一列
        return record.errorMessage ? <Tooltip title={record.errorMessage}>{tag}</Tooltip> : tag;
      },
    },
  ];
}
