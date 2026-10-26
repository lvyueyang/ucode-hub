/**
 * 字典条目表格列定义
 * 排序权重 / 启用状态为通用态（单元格内联编辑）；时间列走 ProTable valueType；预置字典条目禁用删除
 */
import {
  actionsWidth,
  COLUMN_WIDTH,
  DetailGrid,
  formatDateTimeValue,
  PublishSwitchCell,
  SortOrderCell,
  TableOperate,
} from "@ucode/hub-ui-spa/table";
import { Tag } from "antd";
import { EditorTypes, FieldTranslationDrawer } from "#/components/admin";
import type { DictItemRecord } from "#/shared-services/dict/dict.server";
import { isPresetDict } from "./dict.utils";

/** 字典条目可翻译字段定义 */
const DICT_ITEM_TRANSLATABLE_FIELDS = [
  { name: "label", label: "标签", valueType: "input" as const },
];

/**
 * 行展开面板：列表放不下的扩展配置与时间（额外类型 / 额外值 / 颜色 / 创建与更新时间）
 * 时间值复用 ProTable 的格式化实现，避免此处再手写 dayjs
 */
export function renderDictItemDetailPanel(record: DictItemRecord) {
  return (
    <DetailGrid
      items={[
        {
          key: "extraType",
          label: "额外类型",
          fieldKey: "extraType",
          value: <EditorTypes.Preview valueType={record.extraType} />,
        },
        {
          key: "extra",
          label: "额外值",
          fieldKey: "extra",
          value: record.extra || null,
        },
        {
          key: "color",
          label: "颜色",
          fieldKey: "color",
          value: record.color ? <Tag color={record.color}>{record.color}</Tag> : null,
        },
        {
          key: "createdAt",
          label: "创建时间",
          fieldKey: "createdAt",
          value: formatDateTimeValue(record.createdAt),
        },
        {
          key: "updatedAt",
          label: "更新时间",
          fieldKey: "updatedAt",
          value: formatDateTimeValue(record.updatedAt),
        },
      ]}
    />
  );
}

interface DictItemColumnsHandlers {
  /** 列排序属性生成器（来自 useListQuery.sortProps） */
  sortProps: (field: string) => {
    sorter: true;
    sortOrder?: "ascend" | "descend";
  };
  /** 单元格内修改排序权重 */
  onChangeSortOrder: (record: DictItemRecord, next: number) => Promise<void>;
  /** 单元格内切换启用状态 */
  onToggleStatus: (record: DictItemRecord, next: boolean) => Promise<void>;
  /** 编辑条目 */
  onEdit: (record: DictItemRecord) => void;
  /** 删除条目 */
  onDelete: (record: DictItemRecord) => Promise<void>;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    editItem: boolean;
    deleteItem: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑字典条目」权限";
const NO_DELETE_PERMISSION = "无「删除字典条目」权限";

/** 字典条目表格列（排序/状态行内编辑，预置字典条目禁止删除） */
export function dictItemColumns(handlers: DictItemColumnsHandlers) {
  const { permissions } = handlers;
  return [
    {
      // 标识类主列：标签长度可控，定宽（超长标签单行省略，悬停看全串）
      title: "标签",
      dataIndex: "label",
      key: "label",
      width: 240,
      ellipsis: true,
    },
    {
      title: "值",
      dataIndex: "value",
      key: "value",
      // 值长度不可控：取长文本档位，超长省略 + Tooltip；余宽归操作列
      width: COLUMN_WIDTH.text,
      render: (val: string) => <code className="text-xs">{val}</code>,
      ellipsis: true,
    },
    {
      title: "排序",
      dataIndex: "sortOrder",
      key: "sortOrder",
      width: 115,
      ...handlers.sortProps("sortOrder"),
      render: (_: unknown, record: DictItemRecord) => (
        <SortOrderCell
          value={record.sortOrder}
          onSubmit={(next) => handlers.onChangeSortOrder(record, next)}
          disabled={!permissions.editItem}
          disabledReason={NO_EDIT_PERMISSION}
        />
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (_: unknown, record: DictItemRecord) => (
        <PublishSwitchCell
          published={record.status === "active"}
          labels={{ on: "启用", off: "禁用" }}
          onToggle={(next) => handlers.onToggleStatus(record, next)}
          disabled={!permissions.editItem}
          disabledReason={NO_EDIT_PERMISSION}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：余宽归它，宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("编辑", "删除", "翻译"),
      elastic: true,
      render: (_: unknown, record: DictItemRecord) => (
        <TableOperate>
          <TableOperate.Edit
            onClick={() => handlers.onEdit(record)}
            disabled={!permissions.editItem}
            disabledReason={NO_EDIT_PERMISSION}
          />
          <TableOperate.Custom>
            <FieldTranslationDrawer
              entityType="dict_item"
              entityId={record.id}
              fields={DICT_ITEM_TRANSLATABLE_FIELDS}
              originalValues={{ label: record.label ?? "" }}
            />
          </TableOperate.Custom>
          {!isPresetDict(record.dictSlug) && (
            <TableOperate.Delete
              recordName="该条目"
              disabled={!permissions.deleteItem}
              disabledReason={NO_DELETE_PERMISSION}
              onConfirm={() => handlers.onDelete(record)}
            />
          )}
        </TableOperate>
      ),
    },
  ];
}
