/**
 * 客户端角色表格列定义
 * 权限标签只读展示；时间列走 ProTable valueType（列表统一到分钟）
 */
import { PermissionTags } from "@ucode/hub-ui-spa/permission-tags";
import { actionsWidth, COLUMN_WIDTH, TableOperate } from "@ucode/hub-ui-spa/table";

import { CLIENT_PERMISSION_META } from "#/permissions/client-permissions";
import type { ClientRoleRecord } from "#/services/client-role/client-role.server";
import type { SortProps } from "#/utils/use-list-query";

interface ClientRoleColumnsOptions {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => SortProps;
  /** 打开编辑弹窗 */
  onEdit: (record: ClientRoleRecord) => void;
  /** 删除 */
  onDelete: (record: ClientRoleRecord) => Promise<void>;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    edit: boolean;
    delete: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑客户端角色」权限";
const NO_DELETE_PERMISSION = "无「删除客户端角色」权限";

export function clientRoleColumns(options: ClientRoleColumnsOptions) {
  const { permissions } = options;
  return [
    {
      title: "角色名称",
      dataIndex: "name",
      key: "name",
      width: COLUMN_WIDTH.shortText,
      ...options.sortProps("name"),
    },
    {
      title: "标识",
      dataIndex: "slug",
      key: "slug",
      width: COLUMN_WIDTH.shortText,
      ...options.sortProps("slug"),
      render: (v: string) => <code className="text-xs">{v}</code>,
    },
    {
      title: "权限",
      dataIndex: "permissions",
      key: "permissions",
      width: 240,
      render: (perms: string[]) => (
        <PermissionTags permissions={perms} meta={CLIENT_PERMISSION_META} />
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      width: 200,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 165,
      ...options.sortProps("createdAt"),
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：宽度为出现横向滚动时的按钮所需宽，大屏余宽归它
      width: actionsWidth("编辑", "删除"),
      elastic: true,
      render: (_: unknown, record: ClientRoleRecord) => (
        <TableOperate>
          <TableOperate.Edit
            onClick={() => options.onEdit(record)}
            disabled={!permissions.edit}
            disabledReason={NO_EDIT_PERMISSION}
          />
          <TableOperate.Delete
            recordName="此角色"
            disabled={!permissions.delete}
            disabledReason={NO_DELETE_PERMISSION}
            onConfirm={() => options.onDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];
}
