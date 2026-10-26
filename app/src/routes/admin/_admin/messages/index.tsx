/**
 * 管理端个人收件箱页面：查看、已读、删除自己的消息
 */
import { CheckOutlined, SettingOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable } from "@ucode/hub-ui-spa/table";
import { Button } from "antd";
import { useCallback, useEffect, useState } from "react";
import { AdminListPage } from "#/components/admin";
import {
  deleteAdminMessageSFn,
  getAdminMessagesSFn,
  getAdminUnreadCountSFn,
  markAdminMessageAsReadSFn,
  markAllAdminMessagesAsReadSFn,
} from "#/services/message/message.functions";
import type { MessageRecord } from "#/services/message/message.server";
import { sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import { messageInboxColumns } from "./-mods/messageInboxColumns";
import { NotifyChannelSettingsModal } from "./-mods/NotifyChannelSettingsModal";

export const Route = createFileRoute("/admin/_admin/messages/")({
  component: AdminInboxPage,
  loader: async () => await getAdminMessagesSFn({ data: {} }),
});

/** 收件箱状态筛选（空串表示全部） */
type InboxStatus = "" | "unread" | "read";

/** 收件箱筛选条件 */
interface InboxFilters {
  status: InboxStatus;
}

function AdminInboxPage() {
  const initialData = Route.useLoaderData();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const list = useListQuery<MessageRecord, InboxFilters>({
    initial: initialData,
    initialFilters: { status: "" },
    errorMessage: "加载消息失败",
    // 状态列头漏斗 → 业务条件（值未变化时 hook 视为无筛选变更，不会重置页码）
    mapColumnFilters: (columnFilters) => ({
      status: (columnFilters.status?.[0] as InboxStatus) ?? "",
    }),
    fetcher: useCallback(
      ({ page, pageSize, filters }) =>
        getAdminMessagesSFn({
          data: {
            status: filters.status || undefined,
            page,
            pageSize,
          },
        }),
      [],
    ),
  });

  /** 未读数为辅助信息，失败无需打扰用户 */
  const fetchUnreadCount = useCallback(async () => {
    const [count] = await sfnUnwrap(getAdminUnreadCountSFn(), { silent: true });
    if (count !== null) setUnreadCount(count);
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  const handleMarkRead = async (record: MessageRecord) => {
    const [, err] = await sfnUnwrap(markAdminMessageAsReadSFn({ data: { id: record.id } }), {
      error: "标记已读失败",
    });
    if (err) return;
    await list.reload();
    void fetchUnreadCount();
  };

  const handleMarkAllRead = async () => {
    const [, err] = await sfnUnwrap(markAllAdminMessagesAsReadSFn());
    if (err) return;
    message.success("已全部标记为已读");
    await list.reload();
    void fetchUnreadCount();
  };

  const handleDelete = async (record: MessageRecord) => {
    const [, err] = await sfnUnwrap(deleteAdminMessageSFn({ data: { id: record.id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("已删除");
    await list.reload();
    void fetchUnreadCount();
  };

  const columns = messageInboxColumns(
    {
      onMarkRead: handleMarkRead,
      onDelete: handleDelete,
    },
    { statusFilter: list.filters.status },
  );

  return (
    <AdminListPage
      title="我的消息"
      description="查看系统推送给你的通知消息"
      extra={
        <>
          <Button icon={<SettingOutlined />} onClick={() => setNotifyOpen(true)}>
            通知设置
          </Button>
          {unreadCount > 0 && (
            <Button icon={<CheckOutlined />} onClick={() => void handleMarkAllRead()}>
              全部已读
            </Button>
          )}
        </>
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
      <NotifyChannelSettingsModal open={notifyOpen} onClose={() => setNotifyOpen(false)} />
    </AdminListPage>
  );
}
