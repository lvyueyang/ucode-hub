/**
 * 管理员表格列定义
 * 头像列放最前（ImageCell）；状态列跟随字典（DictTag）；时间列统一到分钟
 * 宽度：各列取档位；用户名 / 邮箱 属内容可控的短文本，操作列作弹性列吸收大屏余宽
 */
import { KeyOutlined } from "@ant-design/icons";
import {
  actionsWidth,
  COLUMN_WIDTH,
  ImageCell,
  TableOperate,
  withDisabledReason,
} from "@ucode/hub-ui-spa/table";
import { Button, Tag } from "antd";
import { DictTag } from "#/components/admin";
import type { AdminUserListItem } from "#/services/admin-user/admin-user.server";
import type { SortProps } from "#/utils/use-list-query";

interface AdminUserColumnsOptions {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => SortProps;
  /** 打开编辑弹窗 */
  onEdit: (record: AdminUserListItem) => void;
  /** 打开重置密码弹窗 */
  onResetPwd: (record: AdminUserListItem) => void;
  /** 删除 */
  onDelete: (record: AdminUserListItem) => Promise<void>;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    edit: boolean;
    delete: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑管理员」权限";
const NO_DELETE_PERMISSION = "无「删除管理员」权限";

export function adminUserColumns(options: AdminUserColumnsOptions) {
  const { permissions } = options;
  return [
    {
      // 头像列放最前（无序号 / ID / 展开 / 选择列），固定正方形等比缩放
      title: "头像",
      key: "avatar",
      width: COLUMN_WIDTH.avatar,
      render: (_: unknown, record: AdminUserListItem) => <ImageCell src={record.avatar ?? null} />,
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
      title: "角色",
      dataIndex: "roleNames",
      key: "roleNames",
      width: COLUMN_WIDTH.tag,
      render: (_: unknown, record: AdminUserListItem) =>
        record.isRoot ? (
          <Tag color="red">超级管理员</Tag>
        ) : (
          <div className="flex flex-wrap gap-1">
            {record.roleNames.length > 0 ? (
              record.roleNames.map((name) => (
                <Tag key={name} color="blue">
                  {name}
                </Tag>
              ))
            ) : (
              <span>—</span>
            )}
          </div>
        ),
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
      ...options.sortProps("lastLoginAt"),
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
      render: (_: unknown, record: AdminUserListItem) => (
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
            recordName="此管理员"
            // root 管理员受业务规则保护，同样置灰并说明原因
            disabled={record.isRoot || !permissions.delete}
            disabledReason={record.isRoot ? "超级管理员不可删除" : NO_DELETE_PERMISSION}
            onConfirm={() => options.onDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];
}
