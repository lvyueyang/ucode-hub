/**
 * 字典类型侧栏列表：选择、编辑、删除
 * 新建入口统一放页面标题栏，避免与列表页主操作重复；容器由 AdminSplitPanel 提供
 */
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { withDisabledReason } from "@ucode/hub-ui-spa/table";
import { Button, Popconfirm } from "antd";
import { AdminSplitPanel } from "#/components/admin";
import type { DictRecord } from "#/shared-services/dict/dict.server";
import { isPresetDict } from "./dict.utils";

interface DictListPanelProps {
  dicts: DictRecord[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onEdit: (record: DictRecord) => void;
  onDelete: (record: DictRecord) => void;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    edit: boolean;
    delete: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑字典」权限";
const NO_DELETE_PERMISSION = "无「删除字典」权限";

/** 字典类型侧栏列表：点击选择，行内编辑 / 删除（预置字典不可删） */
export function DictListPanel({
  dicts,
  selectedSlug,
  onSelect,
  onEdit,
  onDelete,
  permissions,
}: DictListPanelProps) {
  if (dicts.length === 0) {
    return <div className="p-4 text-center text-sm text-foreground-tertiary">暂无字典</div>;
  }

  return (
    <>
      {dicts.map((record) => {
        const canDelete = permissions.delete && !isPresetDict(record.slug);
        return (
          <AdminSplitPanel.Item
            key={record.id}
            primary={record.name}
            secondary={record.slug}
            active={selectedSlug === record.slug}
            onSelect={() => onSelect(record.slug)}
            actions={
              <>
                {withDisabledReason(
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    // 静默态：默认弱化，行内 hover / 键盘聚焦时才提亮（antd 层级在 tailwind 之前，用 enabled 变体避免覆盖禁用色）
                    className="enabled:text-foreground-tertiary enabled:hover:text-primary"
                    disabled={!permissions.edit}
                    onClick={() => onEdit(record)}
                  />,
                  !permissions.edit,
                  NO_EDIT_PERMISSION,
                )}
                {!isPresetDict(record.slug) &&
                  withDisabledReason(
                    <Popconfirm
                      title="确定删除该字典及所有条目？"
                      disabled={!canDelete}
                      onConfirm={() => onDelete(record)}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        className="enabled:text-foreground-tertiary enabled:hover:text-danger"
                        disabled={!canDelete}
                      />
                    </Popconfirm>,
                    !canDelete,
                    NO_DELETE_PERMISSION,
                  )}
              </>
            }
          />
        );
      })}
    </>
  );
}
