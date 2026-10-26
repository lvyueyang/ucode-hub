/**
 * 字典创建/编辑弹窗表单
 */

import type { FormInstance } from "antd";
import { Form, Input } from "antd";
import { AdminFormModal, FORM_MODAL_WIDTH } from "#/components/admin";
import type { DictRecord } from "#/shared-services/dict/dict.server";

/** 表单 <form id>：弹窗底部按钮据此触发提交 */
const FORM_ID = "dict-form";

interface DictFormModalProps {
  open: boolean;
  editing: DictRecord | null;
  form: FormInstance;
  /** slug 输入是否禁用（预置字典不可改标识） */
  isSlugDisabled: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}

/** 字典创建/编辑弹窗：名称 + 标识 + 描述 */
export function DictFormModal({
  open,
  editing,
  form,
  isSlugDisabled,
  onCancel,
  onSubmit,
}: DictFormModalProps) {
  return (
    <AdminFormModal
      entityName="字典"
      id={editing?.id}
      open={open}
      onClose={onCancel}
      formId={FORM_ID}
      width={FORM_MODAL_WIDTH.base}
    >
      <Form id={FORM_ID} form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入字典名称" }]}>
          <Input placeholder="字典名称" />
        </Form.Item>
        <Form.Item
          name="slug"
          label="标识 (slug)"
          rules={[{ required: true, message: "请输入字典标识" }]}
        >
          <Input placeholder="唯一标识" disabled={isSlugDisabled} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} placeholder="字典描述（可选）" />
        </Form.Item>
      </Form>
    </AdminFormModal>
  );
}
