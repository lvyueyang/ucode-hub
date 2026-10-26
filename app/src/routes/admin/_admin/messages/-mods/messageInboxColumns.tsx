/**
 * 消息收件箱表格列定义
 * 只读列表：类型 / 状态用 StatusTag，时间列走 ProTable valueType，行内提供已读与删除
 */
import { CheckOutlined } from "@ant-design/icons";
import {
  actionsWidth,
  COLUMN_WIDTH,
  StatusTag,
  type StatusTagOption,
  TableOperate,
} from "@ucode/hub-ui-spa/table";
import { Button } from "antd";
import type { MessageRecord } from "#/services/message/message.server";

/** 消息类型展示选项 */
const TYPE_OPTIONS: Record<string, StatusTagOption> = {
  system: { label: "系统", tone: "info" },
};

/** 消息状态展示选项 */
const STATUS_OPTIONS: Record<string, StatusTagOption> = {
  unread: { label: "未读", tone: "danger" },
  read: { label: "已读", tone: "neutral" },
};

interface MessageInboxColumnsOptions {
  /** 标记单条已读 */
  onMarkRead: (record: MessageRecord) => Promise<void>;
  /** 删除单条消息 */
  onDelete: (record: MessageRecord) => Promise<void>;
}

/** 列渲染所需的筛选态（受控回填列头漏斗选中项） */
export interface MessageInboxColumnsFilterOptions {
  /** 状态列头筛选值（空串表示全部） */
  statusFilter: "" | "unread" | "read";
}

export function messageInboxColumns(
  options: MessageInboxColumnsOptions,
  filterOptions: MessageInboxColumnsFilterOptions,
) {
  return [
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (val: string) => <StatusTag value={val} options={TYPE_OPTIONS} />,
    },
    {
      title: "标题",
      dataIndex: "title",
      key: "title",
      // 弹性列：宽度为出现横向滚动时的最小可读宽，大屏余宽归它
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      // 未读 / 已读筛选收进列头漏斗（单选），替代此前的顶部 Tabs
      filters: [
        { text: "未读", value: "unread" },
        { text: "已读", value: "read" },
      ],
      filterMultiple: false,
      filteredValue: filterOptions.statusFilter ? [filterOptions.statusFilter] : null,
      render: (val: string) => <StatusTag value={val} options={STATUS_OPTIONS} />,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 固定右侧列声明宽度：宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("已读", "删除"),
      render: (_: unknown, record: MessageRecord) => (
        <TableOperate>
          {record.status === "unread" && (
            <TableOperate.Custom>
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => void options.onMarkRead(record)}
              >
                已读
              </Button>
            </TableOperate.Custom>
          )}
          <TableOperate.Delete recordName="该消息" onConfirm={() => options.onDelete(record)} />
        </TableOperate>
      ),
    },
  ];
}
