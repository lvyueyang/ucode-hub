/**
 * 系统配置表格列定义
 * 状态 / 布尔用法统一走 StatusTag，时间列走 ProTable valueType，操作列权限置灰
 */
import { actionsWidth, COLUMN_WIDTH, StatusTag, TableOperate } from "@ucode/hub-ui-spa/table";
import { EditorTypes, FieldTranslationDrawer, type TranslatableField } from "#/components/admin";
import type { ConfigRecord } from "#/shared-services/config/config.server";
import { toBool } from "#/utils/bool";

/** 系统配置可翻译字段定义 */
const CONFIG_TRANSLATABLE_FIELDS: TranslatableField[] = [
  { name: "value", label: "配置值", valueType: "text" },
];

/** 敏感配置是否已配置的展示选项 */
const SECRET_OPTIONS = {
  configured: { label: "已配置", tone: "success" as const },
  unconfigured: { label: "未配置", tone: "neutral" as const },
};

/** 布尔配置值展示选项 */
const BOOL_OPTIONS = {
  true: { label: "是", tone: "success" as const },
  false: { label: "否", tone: "neutral" as const },
};

interface ConfigColumnsOptions {
  onEdit: (record: ConfigRecord) => void;
  onDelete: (record: ConfigRecord) => void;
  /** 权限开关：无权限的操作置灰并提示（服务端 guard 仍为唯一权威） */
  permissions: {
    edit: boolean;
    delete: boolean;
  };
}

const NO_EDIT_PERMISSION = "无「编辑配置」权限";
const NO_DELETE_PERMISSION = "无「删除配置」权限";

/** 系统配置表格列：客户端可见项支持字段翻译 */
export function configColumns(options: ConfigColumnsOptions) {
  const { permissions } = options;
  return [
    {
      // 标识类主列：长度可控，定宽（超长键单行省略，悬停看全串）
      title: "配置键",
      dataIndex: "key",
      key: "key",
      width: 220,
      ellipsis: true,
      render: (key: string) => <code className="text-xs text-primary">{key}</code>,
    },
    {
      title: "配置值",
      dataIndex: "value",
      key: "value",
      // 值长度不可控（密钥 / JSON / 长串）：取长文本档位，超长省略 + Tooltip；余宽归操作列
      width: COLUMN_WIDTH.text,
      ellipsis: true,
      render: (val: string, record: ConfigRecord) => {
        // 敏感配置不回显值，仅展示是否已配置
        if (record.isSecret) {
          return <StatusTag value={val ? "configured" : "unconfigured"} options={SECRET_OPTIONS} />;
        }
        // 布尔类型用状态标签展示：是（绿）/ 否（灰）
        if (record.valueType === "boolean") {
          return <StatusTag value={String(toBool(val))} options={BOOL_OPTIONS} />;
        }
        return val;
      },
    },
    {
      title: "值类型",
      dataIndex: "valueType",
      key: "valueType",
      // 编辑器类型预览（图标 + 文案），实测内容宽 145
      width: 150,
      render: (val: string | null) => <EditorTypes.Preview valueType={val} fallback="Text" />,
    },
    {
      title: "分组",
      dataIndex: "groupName",
      key: "groupName",
      // 按内容实算（分组名 2~5 字）
      width: 90,
      render: (val: string | null) => val || "未分组",
      ellipsis: true,
    },
    {
      title: "客户端可见",
      dataIndex: "clientVisible",
      key: "clientVisible",
      // 表头「客户端可见」5 字需 102，取 110 避免表头折行
      width: 110,
      render: (val: boolean) => <StatusTag value={String(val)} options={BOOL_OPTIONS} />,
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：余宽归它，宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("编辑", "删除", "翻译"),
      elastic: true,
      render: (_: unknown, record: ConfigRecord) => {
        // 敏感配置不参与客户端下发，翻译入口无意义
        const showTranslation = record.clientVisible === true && !record.isSecret;
        return (
          <TableOperate>
            <TableOperate.Edit
              onClick={() => options.onEdit(record)}
              disabled={!permissions.edit}
              disabledReason={NO_EDIT_PERMISSION}
            />
            <TableOperate.Delete
              recordName="该配置"
              disabled={!permissions.delete}
              disabledReason={NO_DELETE_PERMISSION}
              onConfirm={() => options.onDelete(record)}
            />
            {showTranslation && (
              <TableOperate.Custom>
                <FieldTranslationDrawer
                  entityType="system_config"
                  entityId={record.id}
                  fields={CONFIG_TRANSLATABLE_FIELDS}
                  originalValues={{ value: record.value }}
                />
              </TableOperate.Custom>
            )}
          </TableOperate>
        );
      },
    },
  ];
}
