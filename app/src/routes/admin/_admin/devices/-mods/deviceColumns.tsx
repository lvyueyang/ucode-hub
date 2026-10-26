/**
 * 设备表格列定义
 * 归属用户取不到名字时回落 ID 短写；状态与在线态都走 StatusTag；时间列统一到分钟
 */
import { EditOutlined, StopOutlined } from "@ant-design/icons";
import {
  actionsWidth,
  COLUMN_WIDTH,
  StatusTag,
  type StatusTagOption,
  TableOperate,
  withDisabledReason,
} from "@ucode/hub-ui-spa/table";
import { Button, Popconfirm } from "antd";
import { DEVICE_ONLINE_LABELS, DEVICE_STATUS_LABELS } from "#/constants/device";
import type { DeviceListItem } from "#/services/device/device.server";
import type { SortProps } from "#/utils/use-list-query";

/** 设备状态展示配置 */
const STATUS_OPTIONS: Record<string, StatusTagOption> = {
  active: { label: DEVICE_STATUS_LABELS.active, tone: "success" },
  revoked: { label: DEVICE_STATUS_LABELS.revoked, tone: "danger" },
};

/** 在线态展示配置（离线是常态，用中性色；在线才是需要一眼看到的信息） */
const ONLINE_OPTIONS: Record<string, StatusTagOption> = {
  online: { label: DEVICE_ONLINE_LABELS.online, tone: "success" },
  offline: { label: DEVICE_ONLINE_LABELS.offline, tone: "neutral" },
};

/** 归属者名字缺失（用户已删）时的回落：UUID 前 8 位足够辨认是哪台 */
const shortenId = (id: string): string => id.slice(0, 8);

interface DeviceColumnsOptions {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => SortProps;
  /** 打开改名弹窗 */
  onRename: (record: DeviceListItem) => void;
  /** 吊销（令牌立即失效） */
  onRevoke: (record: DeviceListItem) => Promise<void>;
  /** 删除 */
  onDelete: (record: DeviceListItem) => Promise<void>;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    update: boolean;
    revoke: boolean;
    delete: boolean;
  };
}

const NO_UPDATE_PERMISSION = "无「编辑设备」权限";
const NO_REVOKE_PERMISSION = "无「吊销设备」权限";
const NO_DELETE_PERMISSION = "无「删除设备」权限";

/**
 * 设备表格列：设备名 / 归属用户 / 平台 / 版本 / 状态 / 在线 / 最近活跃 / 创建时间 + 操作
 *
 * 列宽合计 1330 ≤ 全宽页预算 1359：平台与客户端版本是短英文标识（≤7 ASCII ≈ 53 + 内边距 32），
 * 与档位里最窄的列相比再收窄 20，把宽度留给归属用户与操作列。
 */
export function deviceColumns(options: DeviceColumnsOptions) {
  const { permissions } = options;
  return [
    {
      title: "设备名",
      dataIndex: "name",
      key: "name",
      width: COLUMN_WIDTH.shortText,
      ...options.sortProps("name"),
      ellipsis: true,
    },
    {
      title: "归属用户",
      dataIndex: "ownerName",
      key: "ownerName",
      width: COLUMN_WIDTH.shortText,
      render: (name: string | null, record: DeviceListItem) => name ?? shortenId(record.ownerId),
      ellipsis: true,
    },
    {
      title: "平台",
      dataIndex: "platform",
      key: "platform",
      width: 100,
      render: (value: string | null) => value ?? "—",
      ellipsis: true,
    },
    {
      title: "客户端版本",
      dataIndex: "clientVersion",
      key: "clientVersion",
      width: 100,
      render: (value: string | null) => value ?? "—",
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: COLUMN_WIDTH.status,
      render: (value: string) => <StatusTag value={value} options={STATUS_OPTIONS} />,
    },
    {
      title: "在线",
      dataIndex: "online",
      key: "online",
      width: COLUMN_WIDTH.status,
      render: (value: boolean) => (
        <StatusTag value={value ? "online" : "offline"} options={ONLINE_OPTIONS} />
      ),
    },
    {
      title: "最近活跃",
      dataIndex: "lastSeenAt",
      key: "lastSeenAt",
      width: COLUMN_WIDTH.time,
      ...options.sortProps("lastSeenAt"),
      valueType: "dateTimeMinute",
      emptyText: "—",
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      ...options.sortProps("createdAt"),
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：宽度为出现横向滚动时的按钮所需宽，大屏余宽归它
      width: actionsWidth("改名", "吊销", "删除"),
      elastic: true,
      render: (_: unknown, record: DeviceListItem) => (
        <TableOperate>
          <TableOperate.Custom>
            {withDisabledReason(
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                disabled={!permissions.update}
                onClick={() => options.onRename(record)}
              >
                改名
              </Button>,
              !permissions.update,
              NO_UPDATE_PERMISSION,
            )}
          </TableOperate.Custom>
          <TableOperate.Custom>
            {withDisabledReason(
              // 二次确认必须说清后果：吊销是当场断开，不是「之后再生效」
              <Popconfirm
                title="确定吊销该设备？"
                description="吊销后该设备立即断开且令牌失效，需重新登记才能再次连接。"
                okText="吊销"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={!permissions.revoke}
                onConfirm={() => options.onRevoke(record)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  disabled={!permissions.revoke}
                >
                  吊销
                </Button>
              </Popconfirm>,
              !permissions.revoke,
              NO_REVOKE_PERMISSION,
            )}
          </TableOperate.Custom>
          <TableOperate.Delete
            recordName="此设备"
            disabled={!permissions.delete}
            disabledReason={NO_DELETE_PERMISSION}
            onConfirm={() => options.onDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];
}
