/**
 * 消息 Server Functions：客户端自助 + 管理端个人收件箱 + 管理端消息管理 + 用户通知渠道配置
 */
import { createServerFn } from "@tanstack/react-start";
import type { UserNotifyChannels } from "#/db/schema";
import { adminAuthGuard, adminPermGuard } from "#/middleware/admin-auth";
import { clientAuthGuard } from "#/middleware/client-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";
import {
  adminMessageListSchema,
  messageIdSchema,
  messageListSchema,
  notifyChannelsSchema,
  searchRecipientsSchema,
  sendMessageSchema,
} from "./message.schemas";
import {
  deleteMessage,
  deleteMessageById,
  getMessages,
  getNotifyChannels,
  getUnreadCount,
  listMessages,
  markAllRead,
  markAsRead,
  saveNotifyChannels,
  searchRecipients,
  sendMessages,
} from "./message.server";

/** 邮件渠道回填注册邮箱默认值（value 未设置时） */
function normalizeChannels(channels: UserNotifyChannels, defaultEmail: string): UserNotifyChannels {
  if (channels.email?.value) return channels;
  return {
    ...channels,
    email: {
      enabled: channels.email?.enabled ?? false,
      value: defaultEmail,
      secret: channels.email?.secret,
    },
  };
}

/** 分页查询自己的消息 */
export const getMyMessagesSFn = createServerFn({ method: "GET" })
  .middleware([clientAuthGuard])
  .validator(messageListSchema)
  .handler(async ({ data, context }) =>
    getMessages({
      user: { type: "client", id: context.userId },
      status: data.status,
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

/** 查询自己的未读消息数 */
export const getMyUnreadCountSFn = createServerFn({ method: "GET" })
  .middleware([clientAuthGuard])
  .handler(async ({ context }) => getUnreadCount({ type: "client", id: context.userId }));

/** 标记自己的一条消息为已读 */
export const markMyMessageAsReadSFn = createServerFn({ method: "POST" })
  .middleware([clientAuthGuard])
  .validator(messageIdSchema)
  .handler(async ({ data, context }) => {
    const ok = await markAsRead(data.id, {
      type: "client",
      id: context.userId,
    });
    return { success: ok };
  });

/** 标记自己的全部未读消息为已读 */
export const markAllMyMessagesAsReadSFn = createServerFn({ method: "POST" })
  .middleware([clientAuthGuard])
  .handler(async ({ context }) => {
    const count = await markAllRead({ type: "client", id: context.userId });
    return { count };
  });

/** 删除自己的一条消息 */
export const deleteMyMessageSFn = createServerFn({ method: "POST" })
  .middleware([clientAuthGuard])
  .validator(messageIdSchema)
  .handler(async ({ data, context }) => {
    const ok = await deleteMessage(data.id, {
      type: "client",
      id: context.userId,
    });
    return { success: ok };
  });

/** 查询自己的通知渠道配置（邮件 value 回填注册邮箱） */
export const getMyNotifyChannelsSFn = createServerFn({ method: "GET" })
  .middleware([clientAuthGuard])
  .handler(async ({ context }) =>
    normalizeChannels(
      await getNotifyChannels({ type: "client", id: context.userId }),
      context.email,
    ),
  );

/** 保存自己的通知渠道配置 */
export const saveMyNotifyChannelsSFn = createServerFn({ method: "POST" })
  .middleware([clientAuthGuard])
  .validator(notifyChannelsSchema)
  .handler(async ({ data, context }) => {
    await saveNotifyChannels({ type: "client", id: context.userId }, data);
    return { success: true };
  });

/** 分页查询自己的消息 */
export const getAdminMessagesSFn = createServerFn({ method: "GET" })
  .middleware([adminAuthGuard])
  .validator(messageListSchema)
  .handler(async ({ data, context }) =>
    getMessages({
      user: { type: "admin", id: context.user.id },
      status: data.status,
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

/** 查询自己的未读消息数 */
export const getAdminUnreadCountSFn = createServerFn({ method: "GET" })
  .middleware([adminAuthGuard])
  .handler(async ({ context }) => getUnreadCount({ type: "admin", id: context.user.id }));

/** 标记自己的一条消息为已读 */
export const markAdminMessageAsReadSFn = createServerFn({ method: "POST" })
  .middleware([adminAuthGuard])
  .validator(messageIdSchema)
  .handler(async ({ data, context }) => {
    const ok = await markAsRead(data.id, {
      type: "admin",
      id: context.user.id,
    });
    return { success: ok };
  });

/** 标记自己的全部未读消息为已读 */
export const markAllAdminMessagesAsReadSFn = createServerFn({ method: "POST" })
  .middleware([adminAuthGuard])
  .handler(async ({ context }) => {
    const count = await markAllRead({ type: "admin", id: context.user.id });
    return { count };
  });

/** 删除自己的一条消息 */
export const deleteAdminMessageSFn = createServerFn({ method: "POST" })
  .middleware([adminAuthGuard])
  .validator(messageIdSchema)
  .handler(async ({ data, context }) => {
    const ok = await deleteMessage(data.id, {
      type: "admin",
      id: context.user.id,
    });
    return { success: ok };
  });

/** 查询管理端自己的通知渠道配置（邮件 value 回填注册邮箱） */
export const getAdminNotifyChannelsSFn = createServerFn({ method: "GET" })
  .middleware([adminAuthGuard])
  .handler(async ({ context }) =>
    normalizeChannels(
      await getNotifyChannels({ type: "admin", id: context.user.id }),
      context.user.email,
    ),
  );

/** 保存管理端自己的通知渠道配置 */
export const saveAdminNotifyChannelsSFn = createServerFn({ method: "POST" })
  .middleware([adminAuthGuard])
  .validator(notifyChannelsSchema)
  .handler(async ({ data, context }) => {
    await saveNotifyChannels({ type: "admin", id: context.user.id }, data);
    return { success: true };
  });

/** 全量分页查询所有用户消息 */
export const listAllMessagesSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.MESSAGE_VIEW)])
  .validator(adminMessageListSchema)
  .handler(async ({ data }) =>
    listMessages({
      userType: data.userType,
      status: data.status,
      type: data.type,
      keyword: data.keyword,
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

/** 向用户批量发送消息（站内信 + 按用户配置分发外发渠道） */
export const sendMessageSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.MESSAGE_SEND)])
  .validator(sendMessageSchema)
  .handler(async ({ data, context }) => {
    const count = await sendMessages({ ...data });
    logCrud(
      context.user,
      "message",
      "send_message",
      { id: data.userIds.join(","), name: data.title },
      {
        detail: {
          userType: data.userType,
          recipientCount: count,
        },
      },
    );
    return { count };
  });

/** 强制删除任意消息 */
export const deleteAnyMessageSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.MESSAGE_DELETE)])
  .validator(messageIdSchema)
  .handler(async ({ data, context }) => {
    const ok = await deleteMessageById(data.id);
    logCrud(context.user, "message", "delete", { id: data.id });
    return { success: ok };
  });

/** 搜索消息接收者（发送消息表单的选择器数据源） */
export const searchRecipientsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.MESSAGE_SEND)])
  .validator(searchRecipientsSchema)
  .handler(async ({ data }) =>
    searchRecipients({ userType: data.userType, keyword: data.keyword }),
  );
