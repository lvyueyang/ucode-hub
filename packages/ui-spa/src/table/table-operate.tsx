/**
 * 表格操作列统一容器组件
 * 所有表格的操作列通过此组件包裹，规范化 UI 和交互行为
 *
 * 子组件：
 * - TableOperate.Edit：编辑按钮（图标 + "编辑"）
 * - TableOperate.Delete：删除按钮（内置 Popconfirm + 危险按钮，图标 + "删除"）
 * - TableOperate.Link：路由跳转按钮（<Link> 包裹）
 * - TableOperate.More：把低频操作收进「更多」下拉（列宽预算内放不下时用）
 * - TableOperate.Custom：自定义操作扩展入口
 *
 * 上下架、排序等「通用态」不进操作列，直接在单元格内修改（见 inline-cells）。
 * 禁用语义：传 disabledReason 即置灰并用 Tooltip 说明原因（无权限场景统一走这里）。
 * 注意 antd 的 disabled 按钮不派发鼠标事件，Tooltip 必须包在 span 外层才可见。
 */
import { DeleteOutlined, DownOutlined, EditOutlined } from "@ant-design/icons";
import { Link } from "@tanstack/react-router";
import { Button, Dropdown, Popconfirm, Space, Tooltip } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";

/** 禁用说明包装：disabled 元素不触发鼠标事件，需用 span 承接 Tooltip */
function withDisabledReason(
  node: ReactNode,
  disabled?: boolean,
  disabledReason?: string,
): ReactNode {
  if (!disabled || !disabledReason) return node;
  return (
    <Tooltip title={disabledReason}>
      <span className="inline-flex">{node}</span>
    </Tooltip>
  );
}

/** Edit 子组件 Props */
interface EditProps {
  onClick: () => void;
  disabled?: boolean;
  /** 置灰原因（无权限等），传入即展示 Tooltip */
  disabledReason?: string;
}

/** Delete 子组件 Props */
interface DeleteProps {
  /**
   * 删除执行体；失败时直接向上抛出，由调用方的 callSfn / sfnUnwrap 统一提示，
   * 本组件不自行吞错提示（避免重复提示与原文案泄漏）
   */
  onConfirm: () => void | Promise<void>;
  /** 确认文案中的实体名称，如 "此角色"、"此管理员" */
  recordName?: string;
  disabled?: boolean;
  disabledReason?: string;
}

/** Link 子组件 Props */
interface LinkProps {
  to: string;
  params?: Record<string, string>;
  icon?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

/** Custom 子组件 Props */
interface CustomProps {
  children: ReactNode;
}

/** 「更多」下拉项：只描述单项操作，菜单项渲染与禁用提示由容器统一处理 */
export interface TableOperateMoreItem {
  /** 菜单项唯一标识 */
  key: string;
  /** 文案（与其它操作一致用「图标 + 文字」，图标单列传 icon） */
  label: string;
  icon?: ReactNode;
  /** 危险操作（删除等），置红 */
  danger?: boolean;
  disabled?: boolean;
  /** 置灰原因（无权限等），传入即展示 Tooltip */
  disabledReason?: string;
  onClick: () => void;
}

/** More 子组件 Props */
interface MoreProps {
  items: TableOperateMoreItem[];
}

/** TableOperate 容器 Props */
interface TableOperateProps {
  children: ReactNode;
}

function Edit({ onClick, disabled, disabledReason }: EditProps) {
  return withDisabledReason(
    <Button type="link" size="small" icon={<EditOutlined />} onClick={onClick} disabled={disabled}>
      编辑
    </Button>,
    disabled,
    disabledReason,
  );
}

/** 删除按钮（内置 Popconfirm 确认；错误交由调用方统一提示） */
function Delete({ onConfirm, recordName = "记录", disabled, disabledReason }: DeleteProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    setLoading(true);
    try {
      await result;
    } finally {
      setLoading(false);
    }
  };

  return withDisabledReason(
    <Popconfirm
      title={`确定删除${recordName}？`}
      onConfirm={handleConfirm}
      okButtonProps={{ loading }}
      disabled={disabled}
    >
      <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={disabled}>
        删除
      </Button>
    </Popconfirm>,
    disabled,
    disabledReason,
  );
}

/** 路由跳转按钮（<Link> 包裹） */
function OperateLink({
  to,
  params,
  icon = <EditOutlined />,
  children = "编辑",
  disabled,
  disabledReason,
}: LinkProps) {
  return withDisabledReason(
    <Link to={to} params={params}>
      <Button type="link" size="small" icon={icon} disabled={disabled}>
        {children}
      </Button>
    </Link>,
    disabled,
    disabledReason,
  );
}

/** 自定义操作占位组件，透传任意内容 */
function Custom({ children }: CustomProps) {
  return <>{children}</>;
}

/**
 * 「更多」下拉：把低频操作折叠，控制操作列宽度
 * 单项 disabled 时保留菜单项（与操作列「置灰不隐藏」一致），并用 Tooltip 说明原因
 */
function More({ items }: MoreProps) {
  // 全部项都不可用（如整体无权限）时，直接把触发按钮置灰并说明原因
  const allDisabled = items.length > 0 && items.every((item) => item.disabled);

  return (
    <Dropdown
      disabled={allDisabled}
      menu={{
        items: items.map((item) => ({
          key: item.key,
          icon: item.icon,
          danger: item.danger,
          disabled: item.disabled,
          label: item.disabledReason ? (
            <Tooltip title={item.disabledReason}>
              <span>{item.label}</span>
            </Tooltip>
          ) : (
            item.label
          ),
        })),
        onClick: ({ key }) => {
          items.find((item) => item.key === key)?.onClick();
        },
      }}
    >
      <Button type="link" size="small" disabled={allDisabled}>
        更多
        <DownOutlined />
      </Button>
    </Dropdown>
  );
}

/** 表格操作列统一容器 */
function TableOperate({ children }: TableOperateProps) {
  return <Space size={4}>{children}</Space>;
}

TableOperate.Edit = Edit;
TableOperate.Delete = Delete;
TableOperate.Link = OperateLink;
TableOperate.More = More;
TableOperate.Custom = Custom;

export { TableOperate, withDisabledReason };
