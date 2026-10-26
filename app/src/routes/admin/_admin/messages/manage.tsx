/**
 * 管理端消息管理页面：全量消息列表 + 向用户发送消息
 */
import { SendOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable, withDisabledReason } from "@ucode/hub-ui-spa/table";
import { Button, Form, Input, Select } from "antd";
import { useCallback, useState } from "react";
import { AdminFilters, AdminListPage, useAdminAuth } from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  deleteAnyMessageSFn,
  listAllMessagesSFn,
  searchRecipientsSFn,
  sendMessageSFn,
} from "#/services/message/message.functions";
import type { MessageWithUser, RecipientOption } from "#/services/message/message.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import { messageManageColumns } from "./-mods/messageManageColumns";
import { SendMessageModal } from "./-mods/SendMessageModal";

export const Route = createFileRoute("/admin/_admin/messages/manage")({
  component: MessageManagePage,
  loader: async () => await listAllMessagesSFn({ data: {} }),
});

/** 全量消息列表筛选条件（空串表示不筛选） */
interface MessageManageFilters {
  userType: "" | "admin" | "client";
  status: "" | "unread" | "read";
  keyword: string;
}

interface SendMessageFormValues {
  userType: "admin" | "client";
  userIds: string[];
  title: string;
  content?: string;
  type?: string;
  relatedLink?: string;
}

const NO_SEND_PERMISSION = "无「发送消息」权限";

function MessageManagePage() {
  const initialData = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [keyword, setKeyword] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendForm] = Form.useForm<SendMessageFormValues>();
  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([]);
  const [recipientSearching, setRecipientSearching] = useState(false);

  const canSend = hasPermission(ADMIN_PERMISSIONS.MESSAGE_SEND);
  const canDelete = hasPermission(ADMIN_PERMISSIONS.MESSAGE_DELETE);

  const list = useListQuery<MessageWithUser, MessageManageFilters>({
    initial: initialData,
    initialFilters: { userType: "", status: "", keyword: "" },
    errorMessage: "查询失败，请稍后重试",
    // 状态列头漏斗 → 业务条件（值未变化时 hook 视为无筛选变更，不会重置页码）
    mapColumnFilters: (columnFilters) => ({
      status: (columnFilters.status?.[0] as MessageManageFilters["status"]) ?? "",
    }),
    fetcher: useCallback(
      ({ page, pageSize, filters }) =>
        listAllMessagesSFn({
          data: {
            userType: filters.userType || undefined,
            status: filters.status || undefined,
            keyword: filters.keyword || undefined,
            page,
            pageSize,
          },
        }),
      [],
    ),
  });

  /** 加载收件人候选（发送消息选择器数据源） */
  const fetchRecipients = useCallback(
    async (searchKeyword?: string) => {
      const userType = (sendForm.getFieldValue("userType") as "admin" | "client") ?? "client";
      setRecipientSearching(true);
      // 候选加载失败无需打扰用户，仅清空列表
      const [options] = await sfnUnwrap(
        searchRecipientsSFn({
          data: { userType, keyword: searchKeyword || undefined },
        }),
        { silent: true },
      );
      setRecipientOptions(options ?? []);
      setRecipientSearching(false);
    },
    [sendForm],
  );

  /** 打开发送弹窗并加载初始候选 */
  const openSendModal = () => {
    sendForm.resetFields();
    setRecipientOptions([]);
    setSendOpen(true);
    void fetchRecipients();
  };

  /** 切换用户类型时重新加载候选 */
  const handleUserTypeChange = () => {
    sendForm.setFieldValue("userIds", []);
    setRecipientOptions([]);
    void fetchRecipients();
  };

  const handleSend = async () => {
    const values = await sendForm.validateFields();
    setSending(true);
    try {
      const { count } = await callSfn(sendMessageSFn({ data: { ...values } }), {
        error: "发送失败，请稍后重试",
      });
      message.success(`已向 ${count} 位用户发送消息`);
      setSendOpen(false);
      await list.reload();
    } catch {
      // callSfn 已提示
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (record: MessageWithUser) => {
    const [, err] = await sfnUnwrap(deleteAnyMessageSFn({ data: { id: record.id } }), {
      error: "删除失败，请稍后重试",
    });
    if (err) return;
    message.success("已删除");
    await list.reload();
  };

  const handleReset = () => {
    setKeyword("");
    list.applyFilters({ userType: "", status: "", keyword: "" });
  };

  const columns = messageManageColumns({
    statusFilter: list.filters.status,
    onDelete: handleDelete,
    permissions: { delete: canDelete },
  });

  return (
    <AdminListPage
      title="消息管理"
      description="查看全部用户消息，并向管理端或客户端用户发送通知"
      extra={withDisabledReason(
        <Button type="primary" icon={<SendOutlined />} disabled={!canSend} onClick={openSendModal}>
          发送消息
        </Button>,
        !canSend,
        NO_SEND_PERMISSION,
      )}
      filters={
        <AdminFilters onReset={handleReset}>
          <Select
            value={list.filters.userType}
            onChange={(value) => list.applyFilters({ userType: value })}
            options={[
              { label: "全部用户", value: "" },
              { label: "管理端", value: "admin" },
              { label: "客户端", value: "client" },
            ]}
            style={{ width: 130 }}
          />
          <Input.Search
            placeholder="搜索消息标题..."
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(value) => list.applyFilters({ keyword: value })}
            style={{ width: 260 }}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无消息" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />

      <SendMessageModal
        open={sendOpen}
        sending={sending}
        form={sendForm}
        recipientOptions={recipientOptions}
        isSearching={recipientSearching}
        onUserTypeChange={handleUserTypeChange}
        onRecipientSearch={(kw: string) => void fetchRecipients(kw)}
        onOk={() => void handleSend()}
        onCancel={() => setSendOpen(false)}
      />
    </AdminListPage>
  );
}
