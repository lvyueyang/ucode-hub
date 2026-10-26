/**
 * 元事件管理页面：CRUD 元事件定义
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
import { Button, Form, Input, Tag } from "antd";
import { useState } from "react";
import { AdminFormModal, AdminListPage, FORM_MODAL_WIDTH } from "#/components/admin";
import { getTrackEventMetaSFn } from "#/services/track/track.functions";
import type { TrackEventMetaRecord as PresetEventRecord } from "#/services/track/track.types";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import {
  createEventMetaSFn,
  deleteEventMetaSFn,
  updateEventMetaSFn,
} from "./-mods/event-meta.functions";

/** 元事件来源 → 展示配置（系统预置 / 自定义） */
const META_SOURCE_OPTIONS: Record<string, StatusTagOption> = {
  true: { label: "系统预置", tone: "info" },
  false: { label: "自定义", tone: "success" },
};

export const Route = createFileRoute("/admin/_admin/track/event-meta/")({
  component: PresetEventsPage,
  loader: async () => getTrackEventMetaSFn(),
});

function PresetEventsPage() {
  const initialEvents = Route.useLoaderData();
  const [events, setEvents] = useState<PresetEventRecord[]>(initialEvents);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PresetEventRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const refresh = async () => {
    const [data] = await sfnUnwrap(getTrackEventMetaSFn());
    if (data !== null) setEvents(data);
  };

  const handleCreate = () => {
    setEditingEvent(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: PresetEventRecord) => {
    setEditingEvent(record);
    form.setFieldsValue({
      label: record.label,
      category: record.category,
      description: record.description ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingEvent) {
        const [, err] = await sfnUnwrap(
          updateEventMetaSFn({
            data: { name: editingEvent.name, ...values },
          }),
        );
        if (err) return; // SFn 失败已提示
        message.success("元事件已更新");
      } else {
        const [, err] = await sfnUnwrap(createEventMetaSFn({ data: values }));
        if (err) return; // SFn 失败已提示
        message.success("元事件已创建");
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

  const handleDelete = async (name: string) => {
    try {
      const result = await callSfn(deleteEventMetaSFn({ data: { name } }));
      if (result) {
        message.success("元事件已删除");
        await refresh();
      } else {
        message.error("预置事件不可删除");
      }
    } catch {
      // callSfn 已提示
    }
  };

  const columns = [
    {
      title: "事件标识",
      dataIndex: "name",
      key: "name",
      width: COLUMN_WIDTH.id,
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
      title: "分类",
      dataIndex: "category",
      key: "category",
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
      render: (_: unknown, record: PresetEventRecord) => (
        <TableOperate>
          <TableOperate.Edit onClick={() => handleEdit(record)} />
          {!record.isPreset && (
            <TableOperate.Delete
              recordName="此元事件"
              onConfirm={() => handleDelete(record.name)}
            />
          )}
        </TableOperate>
      ),
    },
  ];

  return (
    <AdminListPage
      title="元事件管理"
      description="管理系统预置和自定义的事件类型定义"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建事件
        </Button>
      }
    >
      <ProTable
        columns={columns}
        dataSource={events}
        rowKey="name"
        locale={{ emptyText: "暂无元事件" }}
      />

      <AdminFormModal
        title={editingEvent ? "编辑元事件" : "新建元事件"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onOk={handleSubmit}
        submitting={saving}
        width={FORM_MODAL_WIDTH.base}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="事件标识"
            rules={[{ required: true, message: "请输入事件标识" }]}
          >
            <Input placeholder="如：PageView" disabled={!!editingEvent} />
          </Form.Item>
          <Form.Item
            name="label"
            label="显示名称"
            rules={[{ required: true, message: "请输入显示名称" }]}
          >
            <Input placeholder="如：页面浏览" />
          </Form.Item>
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: "请选择分类" }]}
          >
            <Input placeholder="如：页面交互" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="事件描述（可选）" />
          </Form.Item>
        </Form>
      </AdminFormModal>
    </AdminListPage>
  );
}
