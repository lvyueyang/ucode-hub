/**
 * AI 厂商管理页面：多厂商配置 CRUD（底层均为 OpenAI 兼容协议）
 * 配置为对象形式：{ [厂商id]: { name, baseUrl, apiKey, default?, models } }
 */
import { CheckCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import {
  actionsWidth,
  COLUMN_WIDTH,
  ProTable,
  StatusTag,
  type StatusTagOption,
  TableOperate,
  withDisabledReason,
} from "@ucode/hub-ui-spa/table";
import { Button, Tag, Typography } from "antd";
import { useState } from "react";
import { AdminListPage, useAdminAuth } from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import type { AiProviderConfig, AiProviderView } from "#/shared-services/ai/ai.schemas";
import { getAiProvidersSFn, saveAiProvidersSFn } from "#/shared-services/ai/ai-providers.functions";
import { callSfn } from "#/utils/sfn-error";
import { AiProviderFormModal } from "./-mods/AiProviderFormModal";

const { Text } = Typography;

export const Route = createFileRoute("/admin/_admin/ai-providers/")({
  component: AiProvidersPage,
  loader: async () => await getAiProvidersSFn(),
});

/** 默认厂商展示选项 */
const DEFAULT_OPTIONS: Record<string, StatusTagOption> = {
  true: { label: "默认", tone: "info" },
};

const NO_MANAGE_PERMISSION = "无「AI 厂商管理」权限";

/** 视图 → 持久化对象（去掉 id 字段，id 作为对象键；models 平移为对象） */
function toProviderConfig(view: AiProviderView): AiProviderConfig {
  return {
    name: view.name,
    baseUrl: view.baseUrl,
    apiKey: view.apiKey,
    default: view.default,
    models: Object.fromEntries(
      view.models.map((m) => [
        m.id,
        {
          name: m.name,
          default: m.default,
          contextLimit: m.contextLimit,
          outputLimit: m.outputLimit,
          jsonOutput: m.jsonOutput,
          toolCalls: m.toolCalls,
          reasoning: m.reasoning,
          input: m.input,
          output: m.output,
        },
      ]),
    ),
  };
}

function AiProvidersPage() {
  const loaderData = Route.useLoaderData() as AiProviderView[];
  const { hasPermission } = useAdminAuth();
  const [providers, setProviders] = useState<AiProviderView[]>(loaderData);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiProviderView | null>(null);

  const canManage = hasPermission(ADMIN_PERMISSIONS.AI_PROVIDER_MANAGE);

  /** 整列表覆盖保存（厂商配置以对象形式存于系统配置，无分页概念） */
  const save = async (next: AiProviderView[]) => {
    try {
      const providersObj = Object.fromEntries(next.map((p) => [p.id, toProviderConfig(p)]));
      await callSfn(saveAiProvidersSFn({ data: { providers: providersObj } }));
      setProviders(next);
      message.success("AI 厂商配置已保存");
    } catch {
      // callSfn 已提示
    }
  };

  const handleSubmit = (provider: AiProviderView) => {
    let next: AiProviderView[];
    const exists = providers.some((p) => p.id === provider.id);
    if (exists) {
      next = providers.map((p) => (p.id === provider.id ? provider : p));
    } else {
      next = [...providers, provider];
    }
    // 仅保留一个默认；新增/编辑设为默认时取消其它 default
    if (provider.default) {
      next = next.map((p) => ({ ...p, default: p.id === provider.id }));
    } else if (!next.some((p) => p.default)) {
      // 无默认则让首个成为默认
      next = next.map((p, i) => ({ ...p, default: i === 0 }));
    }
    void save(next);
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = (record: AiProviderView) => {
    const next = providers.filter((p) => p.id !== record.id);
    void save(next);
  };

  const handleSetDefault = (record: AiProviderView) => {
    const next = providers.map((p) => ({
      ...p,
      default: p.id === record.id,
    }));
    void save(next);
  };

  const columns = [
    {
      title: "厂商 ID",
      dataIndex: "id",
      key: "id",
      width: COLUMN_WIDTH.id,
      ellipsis: true,
    },
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: COLUMN_WIDTH.shortText,
      ellipsis: true,
    },
    {
      title: "API 基础地址",
      dataIndex: "baseUrl",
      key: "baseUrl",
      // 地址长度不可控，按内容取宽并省略 + Tooltip
      width: 220,
      render: (val: string) => <Text className="text-xs">{val}</Text>,
      ellipsis: true,
    },
    {
      title: "模型",
      dataIndex: "models",
      key: "models",
      width: 200,
      render: (models: AiProviderView["models"]) => (
        <div className="flex flex-wrap gap-1">
          {models.map((m) => (
            <Tag key={m.id} color={m.default ? "blue" : undefined}>
              {m.id}
              {m.default ? "（默认）" : ""}
            </Tag>
          ))}
        </div>
      ),
      ellipsis: true,
    },
    {
      title: "默认",
      dataIndex: "default",
      key: "default",
      width: COLUMN_WIDTH.status,
      render: (val: boolean) => <StatusTag value={String(!!val)} options={DEFAULT_OPTIONS} />,
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：宽度为出现横向滚动时的按钮所需宽，大屏余宽归它
      width: actionsWidth("编辑", "设为默认", "删除"),
      elastic: true,
      render: (_: unknown, record: AiProviderView) => (
        <TableOperate>
          <TableOperate.Edit
            onClick={() => {
              setEditing(record);
              setModalOpen(true);
            }}
            disabled={!canManage}
            disabledReason={NO_MANAGE_PERMISSION}
          />
          <TableOperate.Custom>
            {withDisabledReason(
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                disabled={!canManage || !!record.default}
                onClick={() => handleSetDefault(record)}
              >
                设为默认
              </Button>,
              !canManage,
              NO_MANAGE_PERMISSION,
            )}
          </TableOperate.Custom>
          <TableOperate.Delete
            recordName={`厂商 ${record.name}`}
            disabled={!canManage}
            disabledReason={NO_MANAGE_PERMISSION}
            onConfirm={() => handleDelete(record)}
          />
        </TableOperate>
      ),
    },
  ];

  return (
    <AdminListPage
      title="AI 厂商管理"
      description="配置多个 OpenAI 兼容 API 厂商（DeepSeek / Moonshot / Qwen / 本地 vLLM 等），并指定默认厂商与各模型能力位。"
      extra={withDisabledReason(
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canManage}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          新增厂商
        </Button>,
        !canManage,
        NO_MANAGE_PERMISSION,
      )}
    >
      <ProTable
        rowKey="id"
        columns={columns}
        dataSource={providers}
        pagination={false}
        locale={{ emptyText: "尚未配置 AI 厂商，点击右上角「新增厂商」开始" }}
      />
      <AiProviderFormModal
        open={modalOpen}
        editing={editing}
        onSubmit={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      />
    </AdminListPage>
  );
}
