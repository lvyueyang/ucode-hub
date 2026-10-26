/**
 * 元属性管理页面：CRUD 元属性定义
 */
import { PlusOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import {
  actionsWidth,
  COLUMN_WIDTH,
  ProTable,
  StatusTag,
  type StatusTagOption,
  TableOperate,
} from "@ucode/hub-ui-spa/table";
import { Button, Form, Input, Select, Tag } from "antd";
import { useState } from "react";
import { AdminFormModal, AdminListPage, FORM_MODAL_WIDTH } from "#/components/admin";
import { getTrackPropertyMetaSFn } from "#/services/track/track.functions";
import type { TrackPropertyMetaRecord as PresetPropertyRecord } from "#/services/track/track.types";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import {
  createPropertyMetaSFn,
  deletePropertyMetaSFn,
  PROPERTY_DATA_TYPES,
  updatePropertyMetaSFn,
} from "./-mods/property-meta.functions";

/** 元属性来源 → 展示配置（系统预置 / 自定义） */
const META_SOURCE_OPTIONS: Record<string, StatusTagOption> = {
  true: { label: "系统预置", tone: "info" },
  false: { label: "自定义", tone: "success" },
};

export const Route = createFileRoute("/admin/_admin/track/property-meta/")({
  component: PresetPropertiesPage,
  loader: async () => getTrackPropertyMetaSFn(),
});

function PresetPropertiesPage() {
  const initialProperties = Route.useLoaderData();
  const [properties, setProperties] = useState<PresetPropertyRecord[]>(initialProperties);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<PresetPropertyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const refresh = async () => {
    const [data] = await sfnUnwrap(getTrackPropertyMetaSFn());
    if (data !== null) setProperties(data);
  };

  const handleCreate = () => {
    setEditingProp(null);
    form.resetFields();
    form.setFieldsValue({ dataType: "string" });
    setModalOpen(true);
  };

  const handleEdit = (record: PresetPropertyRecord) => {
    setEditingProp(record);
    form.setFieldsValue({
      label: record.label,
      dataType: record.dataType,
      description: record.description ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingProp) {
        const [, err] = await sfnUnwrap(
          updatePropertyMetaSFn({
            data: { key: editingProp.key, ...values },
          }),
        );
        if (err) return; // SFn 失败已提示
        message.success("元属性已更新");
      } else {
        const [, err] = await sfnUnwrap(createPropertyMetaSFn({ data: values }));
        if (err) return; // SFn 失败已提示
        message.success("元属性已创建");
      }
      setModalOpen(false);
      await refresh();
    } catch (err) {
      // 非 SFn 错误（表单校验等）沿用原提示
      if (err instanceof Error && err.message) {
        message.error(err.message);
      } else {
        message.error("操作失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const result = await callSfn(deletePropertyMetaSFn({ data: { key } }));
      if (result) {
        message.success("元属性已删除");
        await refresh();
      } else {
        message.error("预置属性不可删除");
      }
    } catch {
      // callSfn 已提示
    }
  };

  const columns = [
    {
      title: "属性键",
      dataIndex: "key",
      key: "key",
      width: 160,
      render: (v: string) => <code className="text-xs">{v}</code>,
    },
    {
      title: "显示名称",
      dataIndex: "label",
      key: "label",
      // 按内容实算（2~4 字名称）
      width: 120,
    },
    {
      title: "数据类型",
      dataIndex: "dataType",
      key: "dataType",
      // 按内容实算（2~5 字标签）
      width: 110,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      // 次要长文本：受预算限制取 200，靠 ellipsis + Tooltip 兜住全文
      width: 200,
      ellipsis: true,
    },
    {
      title: "类型",
      dataIndex: "isPreset",
      key: "isPreset",
      width: COLUMN_WIDTH.status,
      render: (v: boolean) => <StatusTag value={v} options={META_SOURCE_OPTIONS} />,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute" as const,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute" as const,
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 弹性列：宽度为出现横向滚动时的按钮所需宽，大屏余宽归它
      width: actionsWidth("编辑", "删除"),
      elastic: true,
      render: (_: unknown, record: PresetPropertyRecord) => (
        <TableOperate>
          <TableOperate.Edit onClick={() => handleEdit(record)} />
          {!record.isPreset && (
            <TableOperate.Delete recordName="此元属性" onConfirm={() => handleDelete(record.key)} />
          )}
        </TableOperate>
      ),
    },
  ];

  return (
    <AdminListPage
      title="元属性管理"
      description="管理系统预置和自定义的事件属性字段定义"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建属性
        </Button>
      }
    >
      <ProTable
        columns={columns}
        dataSource={properties}
        rowKey="key"
        locale={{ emptyText: "暂无元属性" }}
      />

      <AdminFormModal
        title={editingProp ? "编辑元属性" : "新建元属性"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onOk={handleSubmit}
        submitting={saving}
        width={FORM_MODAL_WIDTH.base}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="key"
            label="属性键"
            rules={[{ required: true, message: "请输入属性键" }]}
          >
            <Input placeholder="如：page_name" disabled={!!editingProp} />
          </Form.Item>
          <Form.Item
            name="label"
            label="显示名称"
            rules={[{ required: true, message: "请输入显示名称" }]}
          >
            <Input placeholder="如：页面名称" />
          </Form.Item>
          <Form.Item name="dataType" label="数据类型">
            <Select
              options={PROPERTY_DATA_TYPES.map((t) => ({
                label: t.label,
                value: t.value,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="属性描述（可选）" />
          </Form.Item>
        </Form>
      </AdminFormModal>
    </AdminListPage>
  );
}
