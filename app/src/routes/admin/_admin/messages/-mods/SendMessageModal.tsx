/**
 * 消息管理：发送消息弹窗
 */

import type { FormInstance } from "antd";
import { Form, Input, Radio, Select } from "antd";
import { AdminFormModal, FORM_MODAL_WIDTH } from "#/components/admin";
import type { RecipientOption } from "#/services/message/message.server";

interface SendMessageModalProps {
  open: boolean;
  sending: boolean;
  form: FormInstance;
  recipientOptions: RecipientOption[];
  isSearching: boolean;
  onUserTypeChange: () => void;
  onRecipientSearch: (keyword: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

/** 发送消息弹窗：接收者类型 + 远程搜索多选 + 标题/内容/链接 */
export function SendMessageModal({
  open,
  sending,
  form,
  recipientOptions,
  isSearching,
  onUserTypeChange,
  onRecipientSearch,
  onOk,
  onCancel,
}: SendMessageModalProps) {
  return (
    <AdminFormModal
      title="发送消息"
      open={open}
      onOk={onOk}
      onClose={onCancel}
      submitting={sending}
      okText="发送"
      width={FORM_MODAL_WIDTH.base}
    >
      <Form form={form} layout="vertical" initialValues={{ userType: "client" }}>
        <Form.Item
          name="userType"
          label="用户类型"
          rules={[{ required: true, message: "请选择用户类型" }]}
        >
          <Radio.Group onChange={onUserTypeChange}>
            <Radio value="client">客户端用户</Radio>
            <Radio value="admin">管理端用户</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="userIds" label="用户" rules={[{ required: true, message: "请选择用户" }]}>
          <Select
            mode="multiple"
            placeholder="输入用户名或邮箱搜索，可多选"
            options={recipientOptions}
            loading={isSearching}
            onSearch={onRecipientSearch}
            notFoundContent={isSearching ? null : "未找到匹配用户"}
            filterOption={false}
            showSearch
            optionFilterProp="label"
            style={{ width: "100%" }}
          />
        </Form.Item>

        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
          <Input placeholder="消息标题（必填）" maxLength={200} />
        </Form.Item>

        <Form.Item name="content" label="内容">
          <Input.TextArea rows={3} placeholder="消息内容（选填）" maxLength={2000} showCount />
        </Form.Item>

        <Form.Item name="type" label="消息类型" initialValue="system">
          <Input placeholder="消息类型（默认 system）" />
        </Form.Item>

        <Form.Item name="relatedLink" label="相关链接">
          <Input placeholder="跳转链接（选填）" />
        </Form.Item>
      </Form>
    </AdminFormModal>
  );
}
