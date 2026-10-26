/**
 * 系统配置创建/编辑弹窗表单
 */

import type { FormInstance } from "antd";
import { Form, Input, Switch } from "antd";
import { AdminFormModal, EditorTypes, FORM_MODAL_WIDTH } from "#/components/admin";
import type { EditorType } from "#/constants/editor-types";
import type { ConfigRecord } from "#/shared-services/config/config.server";

/** 表单 <form id>：弹窗底部按钮据此触发提交 */
const FORM_ID = "config-form";

interface ConfigFormModalProps {
  open: boolean;
  editing: ConfigRecord | null;
  form: FormInstance;
  onCancel: () => void;
  onSubmit: () => void;
}

/** 系统配置创建/编辑弹窗：键 + 值类型联动编辑器 + 分组/可见性 */
export function ConfigFormModal({ open, editing, form, onCancel, onSubmit }: ConfigFormModalProps) {
  const watchedValueType = Form.useWatch("valueType", form) as EditorType | undefined;
  /** 编辑敏感配置时值可留空表示保留原密文，不强制填写 */
  const isSecretEditing = editing?.isSecret === true;
  const valueRules = isSecretEditing ? [] : [{ required: true, message: "请输入配置值" }];

  return (
    <AdminFormModal
      entityName="配置"
      id={editing?.id}
      open={open}
      onClose={onCancel}
      formId={FORM_ID}
      width={FORM_MODAL_WIDTH.base}
    >
      <Form id={FORM_ID} form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="key"
          label="配置键"
          rules={[
            { required: true, message: "请输入配置键" },
            { max: 100, message: "配置键不能超过100个字符" },
          ]}
        >
          <Input disabled={!!editing} placeholder="配置键" style={{ fontFamily: "monospace" }} />
        </Form.Item>
        <Form.Item name="valueType" label="值类型">
          <EditorTypes.Select allowClear placeholder="默认文本" />
        </Form.Item>
        {watchedValueType ? (
          <Form.Item name="value" label="配置值" rules={valueRules}>
            <EditorTypes.Editor
              type={watchedValueType}
              placeholder={isSecretEditing ? "留空则保留原值" : "配置值"}
            />
          </Form.Item>
        ) : (
          <Form.Item name="value" label="配置值" rules={valueRules}>
            <Input.TextArea rows={4} placeholder={isSecretEditing ? "留空则保留原值" : "配置值"} />
          </Form.Item>
        )}
        <Form.Item name="groupName" label="配置分组">
          <Input placeholder="分组（可选，为空归入未分组）" />
        </Form.Item>
        <Form.Item name="clientVisible" label="客户端可见" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item
          name="isSecret"
          label="敏感配置"
          valuePropName="checked"
          tooltip="敏感值加密入库、管理端脱敏展示，且不参与客户端可见配置下发；创建后不可修改"
        >
          <Switch disabled={!!editing} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} placeholder="描述（可选）" />
        </Form.Item>
      </Form>
    </AdminFormModal>
  );
}
