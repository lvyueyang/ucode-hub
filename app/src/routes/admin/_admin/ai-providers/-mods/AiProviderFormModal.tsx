/**
 * AI 厂商 新增/编辑弹窗
 * 厂商级字段（name/baseUrl/apiKey/default）+ Form.List 动态模型列表（每模型带能力位元数据）
 */
import { DeleteOutlined, PlusOutlined, SyncOutlined } from "@ant-design/icons";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Button, Card, Col, Divider, Form, Input, InputNumber, Row, Select, Switch } from "antd";
import { useEffect, useMemo, useState } from "react";
import { AdminFormModal, FORM_MODAL_WIDTH } from "#/components/admin";
import type { AiProviderView } from "#/shared-services/ai/ai.schemas";
import { fetchProviderModelsSFn } from "#/shared-services/ai/ai-providers.functions";
import { callSfn } from "#/utils/sfn-error";
import {
  type FormInitialValues,
  type FormValues,
  MODALITY_OPTIONS,
  type ModelFormValues,
} from "./ai-provider-form.model";

interface AiProviderFormProps {
  open: boolean;
  editing: AiProviderView | null;
  onSubmit: (provider: AiProviderView) => void;
  onCancel: () => void;
}

/**
 * AI 厂商 新增/编辑弹窗（外层）
 * 每次打开自增 seq 作 key，令内容组件整体重挂载（新建表单实例）。
 * 表单实例每开必新建，保证：编辑能回显 Form.List 嵌套值、新增不残留上次表单数据。
 * 注意：表单不得设 preserve={false，否则 destroyOnHidden 重挂载后 Form.List 嵌套字段值会丢失。
 */
export function AiProviderFormModal({ open, editing, onSubmit, onCancel }: AiProviderFormProps) {
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    if (open) setSeq((s) => s + 1);
  }, [open]);

  return (
    <AiProviderFormContent
      key={seq}
      open={open}
      editing={editing}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

function AiProviderFormContent({ open, editing, onSubmit, onCancel }: AiProviderFormProps) {
  const [form] = Form.useForm<FormValues>();
  const [fetching, setFetching] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // 编辑以 editing 为初始值；新增预置一个空模型行。
  // 宿主通过 key 每次打开重建本组件（新 form 实例），挂载时 initialValues 即生效。
  const initialValues = useMemo<FormInitialValues>(
    () => (editing ? { ...editing, id: editing.id } : { models: [{ id: "" }] }),
    [editing],
  );

  /** 拉取 OpenAI 兼容 /models 端点，把可用模型合并进模型列表（去重，空行用首个填充） */
  const handleFetchModels = async () => {
    const values = form.getFieldsValue(["baseUrl", "apiKey"]);
    if (!values.baseUrl?.trim() || !values.apiKey?.trim()) {
      message.warning("请先填写 API 基础地址与 API 密钥");
      return;
    }
    setFetching(true);
    try {
      const { models } = await callSfn(
        fetchProviderModelsSFn({
          data: {
            baseUrl: values.baseUrl.trim(),
            apiKey: values.apiKey.trim(),
          },
        }),
      );
      setAvailableModels(models);
      const existing = (form.getFieldValue("models") as ModelFormValues[]) ?? [];
      const existingIds = new Set(existing.map((m) => m.id.trim()).filter(Boolean));
      const toAdd = models.filter((id) => !existingIds.has(id));
      if (!toAdd.length) {
        message.success(`已拉取 ${models.length} 个模型`);
        return;
      }
      const emptyIdx = existing.findIndex((m) => !m.id.trim());
      const next = [...existing];
      if (emptyIdx >= 0) {
        // 用首个拉取结果填充空行，其余追加
        const [first, ...rest] = toAdd;
        next[emptyIdx] = { id: first, name: first };
        for (const id of rest) next.push({ id, name: id });
      } else {
        for (const id of toAdd) next.push({ id, name: id });
      }
      form.setFieldsValue({ models: next });
      message.success(`已拉取 ${models.length} 个模型，新增 ${toAdd.length} 个`);
    } catch {
      // callSfn 已提示
    } finally {
      setFetching(false);
    }
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    const trimmed: FormValues = {
      ...values,
      id: values.id.trim(),
      name: values.name.trim(),
      baseUrl: values.baseUrl.trim(),
      apiKey: values.apiKey.trim(),
      default: values.default ?? false,
      models: (values.models ?? []).map((m) => ({ ...m, id: m.id.trim() })).filter((m) => m.id),
    };
    if (!trimmed.models.length) {
      form.setFields([{ name: "models", errors: ["至少配置一个模型"] }]);
      return;
    }
    onSubmit(trimmed as AiProviderView);
  };

  return (
    <AdminFormModal
      entityName="AI 厂商"
      id={editing?.id}
      open={open}
      onOk={handleOk}
      onClose={onCancel}
      width={FORM_MODAL_WIDTH.wide}
    >
      <Form form={form} layout="vertical" initialValues={initialValues}>
        <AutofillBlocker />
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="id"
              label="厂商 ID"
              rules={[
                { required: true, message: "请输入厂商 ID" },
                { max: 64, message: "最多 64 字符" },
                { pattern: /^[^/#]+$/, message: "厂商 ID 不能包含 / 或 #" },
              ]}
              tooltip="调用侧引用标识，如 deepseek / moonshot"
            >
              <Input placeholder="如 deepseek" disabled={!!editing} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="name"
              label="厂商名称"
              rules={[{ required: true, message: "请输入厂商名称" }]}
            >
              <Input placeholder="如 DeepSeek" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="baseUrl"
              label="API 基础地址"
              rules={[{ required: true, message: "请输入 API 基础地址" }]}
            >
              <Input placeholder="如 https://api.deepseek.com/v1" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="apiKey"
              label="API 密钥"
              rules={[{ required: true, message: "请输入 API 密钥" }]}
            >
              <Input.Password placeholder="sk-..." />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="default" label="设为默认厂商" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Divider titlePlacement="left" plain>
          <div className="flex items-center gap-2">
            <span>模型列表</span>
            <Button
              size="small"
              type="link"
              icon={<SyncOutlined />}
              loading={fetching}
              onClick={handleFetchModels}
            >
              拉取模型列表
            </Button>
          </div>
        </Divider>
        {availableModels.length > 0 && (
          <div className="mb-3 text-xs text-foreground-secondary">
            已拉取 {availableModels.length} 个模型，已自动填充到下方模型列表，可按需增删改
          </div>
        )}

        <Form.List name="models">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }, index) => (
                <Card
                  key={key}
                  size="small"
                  className="mb-3"
                  title={`模型 ${index + 1}`}
                  extra={
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                    >
                      删除
                    </Button>
                  }
                >
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        {...restField}
                        name={[name, "id"]}
                        label="模型名"
                        rules={[
                          { required: true, message: "请输入模型名" },
                          { pattern: /^[^#]+$/, message: "模型名不能包含 #" },
                        ]}
                        tooltip="发送给上游的真实模型 ID，如 deepseek-chat"
                      >
                        <Input placeholder="如 deepseek-chat" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item {...restField} name={[name, "name"]} label="展示名">
                        <Input placeholder="如 DeepSeek Chat" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "contextLimit"]}
                        label="上下文长度"
                        tooltip="token 数，用于 UI 展示与超限提示"
                      >
                        <InputNumber className="w-full" min={1} placeholder="如 65536" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "outputLimit"]}
                        label="输出长度"
                        tooltip="token 数，用于 UI 展示与超限提示"
                      >
                        <InputNumber className="w-full" min={1} placeholder="如 8192" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "default"]}
                        label="默认模型"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Divider plain className="my-2" />
                  <div className="mb-1 text-xs text-foreground-secondary">
                    能力位（声明后按对应请求形态调用，未声明走乐观默认）
                  </div>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "reasoning"]}
                        label="思考模式"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "jsonOutput"]}
                        label="JSON 输出"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "toolCalls"]}
                        label="工具调用"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item {...restField} name={[name, "input"]} label="输入模态">
                        <Select
                          mode="multiple"
                          allowClear
                          options={MODALITY_OPTIONS}
                          placeholder="如 文本"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item {...restField} name={[name, "output"]} label="输出模态">
                        <Select
                          mode="multiple"
                          allowClear
                          options={MODALITY_OPTIONS}
                          placeholder="如 文本"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ id: "" })}>
                添加模型
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </AdminFormModal>
  );
}
