/**
 * 客户端用户表格列定义
 * 头像列放最前（ImageCell）；状态列跟随字典（DictTag）、邮箱验证走 StatusTag；时间列统一到分钟
 */
import { KeyOutlined } from "@ant-design/icons";
import {
  actionsWidth,
  COLUMN_WIDTH,
  ImageCell,
  StatusTag,
  type StatusTagOption,
  TableOperate,
  withDisabledReason,
} from "@ucode/hub-ui-spa/table";

import { Button } from "antd";
import { DictTag } from "#/components/admin";
import type { ClientUserListItem } from "#/services/client-user/client-user.server";
import type { SortProps } from "#/utils/use-list-query";

/** 邮箱验证状态展示配置 */
const EMAIL_VERIFIED_OPTIONS: Record<string, StatusTagOption> = {
  true: { label: "已验证", tone: "success" },
  false: { label: "未验证", tone: "neutral" },
};

interface ClientUserColumnsOptions {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => SortProps;
  /** 打开编辑弹窗 */
  onEdit: (record: ClientUserListItem) => void;
  /** 打开重置密码弹窗 */
  onResetPwd: (record: ClientUserListItem) => void;
  /** 删除 */
  onDelete: (record: ClientUserListItem) => Promise<void>;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    edit: boolean;
    delete: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑客户端用户」权限";
const NO_DELETE_PERMISSION = "无「删除客户端用户」权限";

export function clientUserColumns(options: ClientUserColumnsOptions) {
  const { permissions } = options;
  return [
    {
      // 头像列放最前（无序号 / ID / 展开 / 选择列），固定正方形等比缩放
      title: "头像",
      key: "avatar",
      width: COLUMN_WIDTH.avatar,
      render: (_: unknown, record: ClientUserListItem) => <ImageCell src={record.avatar ?? null} />,
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      width: COLUMN_WIDTH.shortText,
      ...options.sortProps("username"),
      ellipsis: true,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
      width: COLUMN_WIDTH.shortText,
      ellipsis: true,
      ...options.sortProps("email"),
    },
    {
      title: "邮箱验证",
      dataIndex: "emailVerified",
      key: "emailVerified",
      width: COLUMN_WIDTH.status,
      render: (value: boolean) => <StatusTag value={value} options={EMAIL_VERIFIED_OPTIONS} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: COLUMN_WIDTH.status,
      render: (value: string) => <DictTag dictSlug="user_status" value={value} />,
    },
    {
      title: "最后登录",
      dataIndex: "lastLoginAt",
      key: "lastLoginAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute",
      emptyText: "—",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：宽度为出现横向滚动时的按钮所需宽，大屏余宽归它
      width: actionsWidth("编辑", "重置密码", "删除"),
      elastic: true,
      render: (_: unknown, record: ClientUserListItem) => (
        <TableOperate>
          <TableOperate.Edit
            onClick={() => options.onEdit(record)}
            disabled={!permissions.edit}
            disabledReason={NO_EDIT_PERMISSION}
          />
          <TableOperate.Custom>
            {withDisabledReason(
              <Button
                type="link"
                size="small"
                icon={<KeyOutlined />}
                disabled={!permissions.edit}
                onClick={() => options.onResetPwd(record)}
              >
                重置密码
              </Button>,
              !permissions.edit,
              NO_EDIT_PERMISSION,
            )}
          </TableOperate.Custom>
          <TableOperate.Delete
            recordName="此用户"
            disabled={!permissions.delete}
            disabledReason={NO_DELETE_PERMISSION}
            onConfirm={() => options.onDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];
}
