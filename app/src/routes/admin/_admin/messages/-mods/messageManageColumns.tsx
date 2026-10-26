/**
 * 消息管理表格列定义
 * 用户类型 / 类型 / 状态统一走 StatusTag，时间列走 ProTable valueType，删除权限置灰
 */
import {
  actionsWidth,
  COLUMN_WIDTH,
  StatusTag,
  type StatusTagOption,
  TableOperate,
} from "@ucode/hub-ui-spa/table";
import { MESSAGE_TYPE_LABELS } from "#/constants/message-types";
import type { MessageWithUser } from "#/services/message/message.server";

/** 用户类型展示选项 */
const USER_TYPE_OPTIONS: Record<string, StatusTagOption> = {
  admin: { label: "管理端", tone: "info" },
  client: { label: "客户端", tone: "success" },
};

/** 消息类型展示选项（由共享标签派生，未知类型兜底原值） */
const TYPE_OPTIONS: Record<string, StatusTagOption> = Object.fromEntries(
  Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => [
    value,
    { label, tone: "neutral" as const },
  ]),
);

/** 消息状态展示选项 */
const STATUS_OPTIONS: Record<string, StatusTagOption> = {
  unread: { label: "未读", tone: "danger" },
  read: { label: "已读", tone: "neutral" },
};

interface MessageManageColumnsOptions {
  onDelete: (record: MessageWithUser) => Promise<void>;
  /** 状态列头筛选值（空串表示全部），受控回填漏斗选中态 */
  statusFilter: "" | "unread" | "read";
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    delete: boolean;
  };
}

const NO_DELETE_PERMISSION = "无「删除消息」权限";

/** 消息管理表格列：用户/标题/类型/状态/时间 + 删除 */
export function messageManageColumns(options: MessageManageColumnsOptions) {
  return [
    {
      title: "用户",
      dataIndex: "userName",
      key: "userName",
      width: 200,
      render: (name: string, record: MessageWithUser) => (
        <span className="inline-flex items-center gap-1">
          <StatusTag value={record.userType} options={USER_TYPE_OPTIONS} />
          {name}
        </span>
      ),
      ellipsis: true,
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
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (val: string) => <StatusTag value={val} options={TYPE_OPTIONS} fallback={val} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      // 未读 / 已读筛选收进列头漏斗（单选），不再占页头一行
      filters: [
        { text: "未读", value: "unread" },
        { text: "已读", value: "read" },
      ],
      filterMultiple: false,
      filteredValue: options.statusFilter ? [options.statusFilter] : null,
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
      width: actionsWidth("删除"),
      render: (_: unknown, record: MessageWithUser) => (
        <TableOperate>
          <TableOperate.Delete
            recordName="该消息"
            disabled={!options.permissions.delete}
            disabledReason={NO_DELETE_PERMISSION}
            onConfirm={() => options.onDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];
}
