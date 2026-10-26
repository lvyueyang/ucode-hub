/**
 * 权限选择器：表格形式，支持分组通配符
 * 选择分组时自动写入 group:* 通配符，选择单个权限时写入具体权限码
 */

import { type ProColumnType, ProTable } from "@ucode/hub-ui-spa/table";
import { Checkbox } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import { useMemo } from "react";
import { ADMIN_PERMISSIONS_BY_GROUP } from "#/permissions/admin-permissions";

/** 权限定义的结构化形状（管理端与客户端权限字面量均可赋值） */
interface PermissionOption {
  code: string;
  name: string;
  desc: string;
  group: string;
}

interface GroupRow {
  key: string;
  group: string;
  permissions: readonly PermissionOption[];
  isGroupSelected: boolean;
  selectedIndividuals: PermissionOption[];
}

interface PermissionSelectorProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  /** 权限分组映射，默认使用管理端权限分组；客户端角色页面传入客户端权限分组 */
  groups?: Record<string, readonly PermissionOption[]>;
}

/** 构建分组通配符 */
function wildcard(group: string) {
  return `${group}:*`;
}

/**
 * 权限选择器组件，嵌入 antd Form.Item 使用
 * 表格左侧为分组（可全选），右侧为权限码列表（可单选）
 */
export function PermissionSelector({
  value = [],
  onChange,
  groups = ADMIN_PERMISSIONS_BY_GROUP,
}: PermissionSelectorProps) {
  const groupData = useMemo<GroupRow[]>(() => {
    return Object.entries(groups).map(([group, perms]) => ({
      key: group,
      group,
      permissions: perms,
      isGroupSelected: value.includes(wildcard(group)),
      selectedIndividuals: perms.filter((p) => value.includes(p.code)),
    }));
  }, [value, groups]);

  const handleGroupToggle = (group: string, checked: boolean) => {
    const newValue = value.filter((v) => !v.startsWith(`${group}:`));
    if (checked) {
      newValue.push(wildcard(group));
    }
    onChange?.(newValue);
  };

  const handleIndividualsChange = (group: string, checkedValues: string[]) => {
    const allCodes = groups[group].map((p) => p.code);
    // 移除当前分组的通配符和所有该组的权限码
    const newValue = value.filter((v) => !v.startsWith(`${group}:`));
    if (checkedValues.length === allCodes.length) {
      // 全部选中 → 使用分组通配符
      newValue.push(wildcard(group));
    } else {
      newValue.push(...checkedValues);
    }
    onChange?.(newValue);
  };

  const columns: ProColumnType<GroupRow>[] = [
    {
      title: "分组",
      dataIndex: "group",
      width: 120,
      render: (group, record) => (
        <Checkbox
          checked={record.isGroupSelected}
          indeterminate={!record.isGroupSelected && record.selectedIndividuals.length > 0}
          onChange={(e: CheckboxChangeEvent) =>
            handleGroupToggle(group as string, e.target.checked)
          }
        >
          {group}
        </Checkbox>
      ),
    },
    {
      title: "权限码",
      dataIndex: "permissions",
      // 弹性列：权限标签随弹窗宽度换行，宽度为出现横向滚动时的最小可读宽
      width: 400,
      elastic: true,
      render: (perms: readonly PermissionOption[], record) => {
        const allCodes = perms.map((p) => p.code);
        const checkedValues = record.isGroupSelected
          ? allCodes
          : record.selectedIndividuals.map((p) => p.code);

        return (
          <Checkbox.Group
            value={checkedValues}
            onChange={(vals: string[]) => handleIndividualsChange(record.group, vals)}
            options={perms.map((p) => ({
              label: `${p.name} (${p.code})`,
              value: p.code,
            }))}
          />
        );
      },
    },
  ];

  return (
    <ProTable<GroupRow>
      columns={columns}
      dataSource={groupData}
      pagination={false}
      size="small"
      // 显式表体高度：容器在弹窗内，否则会继承页面骨架注入的表体高度
      scroll={{ y: 320 }}
    />
  );
}
