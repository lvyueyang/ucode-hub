/**
 * 字典条目创建/编辑弹窗表单（含高级配置区）
 */
import { CaretDownOutlined, CaretUpOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { Button, Col, ColorPicker, Divider, Form, Input, InputNumber, Row } from "antd";
import { AdminFormModal, EditorTypes, FORM_MODAL_WIDTH } from "#/components/admin";
import type { EditorType } from "#/constants/editor-types";
import type { DictItemRecord } from "#/shared-services/dict/dict.server";

/** 表单 <form id>：弹窗底部按钮据此触发提交 */
const FORM_ID = "dict-item-form";

interface DictItemFormModalProps {
  open: boolean;
  editing: DictItemRecord | null;
  form: FormInstance;
  /** 值输入是否禁用（预置字典条目不可改值） */
  isValueDisabled: boolean;
  isAdvancedExpanded: boolean;
  onToggleAdvanced: () => void;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}

/** 字典条目创建/编辑弹窗：标签/值 + 高级配置（排序、颜色、额外类型与值） */
export function DictItemFormModal({
  open,
  editing,
  form,
  isValueDisabled,
  isAdvancedExpanded,
  onToggleAdvanced,
  onCancel,
  onSubmit,
}: DictItemFormModalProps) {
  const watchedExtraType = Form.useWatch("extraType", form) as EditorType | undefined;

  return (
    <AdminFormModal
      entityName="条目"
      id={editing?.id}
      open={open}
      onClose={onCancel}
      formId={FORM_ID}
      width={isAdvancedExpanded ? FORM_MODAL_WIDTH.wide : FORM_MODAL_WIDTH.base}
    >
      <Form
        id={FORM_ID}
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        initialValues={{ sortOrder: 0 }}
      >
        <Form.Item name="label" label="标签" rules={[{ required: true, message: "请输入标签" }]}>
          <Input placeholder="显示名称" />
        </Form.Item>
        <Form.Item name="value" label="值" rules={[{ required: true, message: "请输入值" }]}>
          <Input placeholder="存储值" disabled={isValueDisabled} />
        </Form.Item>
        <Divider plain style={{ margin: "8px 0 12px" }}>
          <Button
            type="link"
            size="small"
            className="px-0 text-xs"
            icon={isAdvancedExpanded ? <CaretUpOutlined /> : <CaretDownOutlined />}
            onClick={onToggleAdvanced}
          >
            高级配置
          </Button>
        </Divider>
        {isAdvancedExpanded && (
          <>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="sortOrder" label="排序">
                  <InputNumber className="w-full" min={0} placeholder="排序序号" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="color"
                  label="颜色"
                  getValueFromEvent={(color: { toHexString?: () => string } | string) =>
                    typeof color === "string" ? color : (color?.toHexString?.() ?? undefined)
                  }
                >
                  <ColorPicker allowClear format="hex" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="extraType" label="额外类型">
              <EditorTypes.Select allowClear />
            </Form.Item>
            {watchedExtraType ? (
              <Form.Item name="extra" label="额外值">
                <EditorTypes.Editor type={watchedExtraType} placeholder="额外扩展值" />
              </Form.Item>
            ) : (
              <Form.Item name="extra" label="额外值">
                <Input.TextArea rows={3} placeholder="额外扩展值（选择额外类型后可切换编辑器）" />
              </Form.Item>
            )}
          </>
        )}
      </Form>
    </AdminFormModal>
  );
}
