/**
 * 通用消息服务层：消息创建、查询、标记已读、删除 + 外发渠道按用户配置投递
 * 站内信（message 表）为主渠道，恒定义必达；email/webhook/feishu/wecom/dingtalk 为可插拔外发切面。
 */
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "#/db/index";
import type { UserNotifyChannels } from "#/db/schema";
import {
  adminUser,
  clientUser,
  type MessageStatus,
  message,
  type NotifyChannelConfig,
} from "#/db/schema";
import {
  getNotifyChannelsMap,
  getUserConfig,
  setUserConfig,
} from "#/services/user-config/user-config.server";
import { getConfig } from "#/shared-services/config/config.server";
import type { NotifyChannel } from "#/shared-services/notify";
import { sendNotificationChannel } from "#/shared-services/notify";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type { PaginatedResult } from "#/types/query";
import type { UserRef, UserType } from "#/types/user";

/** 创建消息参数 */
export interface CreateMessageParams {
  user: UserRef;
  title: string;
  content?: string;
  type?: string;
  relatedLink?: string;
}

/** 收件箱查询参数 */
export interface GetMessagesParams {
  user: UserRef;
  status?: MessageStatus;
  page?: number;
  pageSize?: number;
}

/** 管理端全量列表查询参数 */
export interface ListMessagesParams {
  userType?: UserType;
  status?: MessageStatus;
  type?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 批量发送消息参数 */
export interface SendMessagesParams {
  userType: UserType;
  userIds: string[];
  title: string;
  content?: string;
  type?: string;
  relatedLink?: string;
}

/** 接收者候选（发送消息表单的选择器数据源） */
export interface RecipientOption {
  id: string;
  label: string;
}

/** 消息行数据 */
export type MessageRecord = typeof message.$inferSelect;

/** 消息行（含用户名称，管理列表展示用） */
export type MessageWithUser = typeof message.$inferSelect & {
  userName: string;
};

/** 用户维度查询条件：用户定位 + 排除软删除 */
function userConditions(user: UserRef): SQL[] {
  return [
    eq(message.userType, user.type),
    eq(message.userId, user.id),
    notDeleted(message.deletedAt),
  ];
}

/** 总闸：外发渠道是否开启 */
async function isNotifyEnabled(): Promise<boolean> {
  return (await getConfig("notify_enabled")) === "true";
}

/** 按用户配置分发外发渠道（失败仅记日志，不阻断） */
async function dispatchExternalChannels(
  channels: UserNotifyChannels | undefined,
  title: string,
  content: string,
): Promise<void> {
  if (!channels) return;
  const entries: [NotifyChannel, NotifyChannelConfig | undefined][] = [
    ["email", channels.email],
    ["feishu", channels.feishu],
    ["wecom", channels.wecom],
    ["dingtalk", channels.dingtalk],
    ["webhook", channels.webhook],
  ];
  for (const [channel, cfg] of entries) {
    if (!cfg?.enabled || !cfg.value) continue;
    await sendNotificationChannel({
      channel,
      value: cfg.value,
      secret: cfg.secret,
      title,
      content,
    });
  }
}

/** 单用户发送：落站内信 + 分发外发渠道 */
export async function createMessage(params: CreateMessageParams): Promise<string> {
  const [record] = await db
    .insert(message)
    .values({
      userId: params.user.id,
      userType: params.user.type,
      title: params.title,
      content: params.content ?? null,
      type: params.type ?? "system",
      status: "unread",
      relatedLink: params.relatedLink ?? null,
    })
    .returning({ id: message.id });

  if (await isNotifyEnabled()) {
    await dispatchExternalChannels(
      (await getNotifyChannelsMap([params.user])).get(`${params.user.type}:${params.user.id}`),
      params.title,
      params.content ?? "",
    );
  }
  return record.id;
}

/**
 * 分页查询用户消息列表
 */
export async function getMessages(
  params: GetMessagesParams,
): Promise<PaginatedResult<typeof message.$inferSelect>> {
  const page = params.page ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = paginationOffset(page, pageSize);

  const conditions = userConditions(params.user);

  if (params.status) {
    conditions.push(eq(message.status, params.status));
  }

  const whereCondition = and(...conditions);

  return executePaginatedQuery(
    db
      .select()
      .from(message)
      .where(whereCondition)
      .orderBy(desc(message.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(message).where(whereCondition)),
    page,
    pageSize,
  );
}

/**
 * 获取用户未读消息数量
 */
export async function getUnreadCount(user: UserRef): Promise<number> {
  return db.$count(
    db
      .select()
      .from(message)
      .where(and(...userConditions(user), eq(message.status, "unread"))),
  );
}

/**
 * 标记单条消息为已读
 */
export async function markAsRead(id: string, user: UserRef): Promise<boolean> {
  const result = await db
    .update(message)
    .set({ status: "read", updatedAt: new Date() })
    .where(and(eq(message.id, id), ...userConditions(user)));

  return (result.rowCount ?? 0) > 0;
}

/**
 * 标记用户所有未读消息为已读
 */
export async function markAllRead(user: UserRef): Promise<number> {
  const result = await db
    .update(message)
    .set({ status: "read", updatedAt: new Date() })
    .where(and(...userConditions(user), eq(message.status, "unread")));

  return result.rowCount ?? 0;
}

/**
 * 软删除单条消息（用户维度校验）
 */
export async function deleteMessage(id: string, user: UserRef): Promise<boolean> {
  const result = await db
    .update(message)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(message.id, id), ...userConditions(user)));

  return (result.rowCount ?? 0) > 0;
}

/**
 * 批量解析用户名称（按类型分查后合并）
 */
async function resolveUserNames(rows: (typeof message.$inferSelect)[]): Promise<MessageWithUser[]> {
  const adminIds = rows.filter((r) => r.userType === "admin").map((r) => r.userId);
  const clientIds = rows.filter((r) => r.userType === "client").map((r) => r.userId);

  const [admins, clients] = await Promise.all([
    adminIds.length > 0
      ? db
          .select({ id: adminUser.id, username: adminUser.username })
          .from(adminUser)
          .where(inArray(adminUser.id, adminIds))
      : Promise.resolve([]),
    clientIds.length > 0
      ? db
          .select({ id: clientUser.id, username: clientUser.username })
          .from(clientUser)
          .where(inArray(clientUser.id, clientIds))
      : Promise.resolve([]),
  ]);

  const nameMap = new Map<string, string>();
  for (const u of admins) nameMap.set(u.id, u.username);
  for (const u of clients) nameMap.set(u.id, u.username);

  return rows.map((row) => ({
    ...row,
    userName: nameMap.get(row.userId) ?? "未知用户",
  }));
}

/**
 * 管理端全量分页查询消息（含用户名称）
 */
export async function listMessages(
  params: ListMessagesParams,
): Promise<PaginatedResult<MessageWithUser>> {
  const page = params.page ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = paginationOffset(page, pageSize);

  const conditions: SQL[] = [notDeleted(message.deletedAt)];
  if (params.userType) {
    conditions.push(eq(message.userType, params.userType));
  }
  if (params.status) {
    conditions.push(eq(message.status, params.status));
  }
  if (params.type) {
    conditions.push(eq(message.type, params.type));
  }
  if (params.keyword) {
    conditions.push(ilike(message.title, `%${params.keyword}%`));
  }

  const whereCondition = and(...conditions);

  const [records, total] = await Promise.all([
    db
      .select()
      .from(message)
      .where(whereCondition)
      .orderBy(desc(message.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(message).where(whereCondition)),
  ]);

  const rows = await resolveUserNames(records);
  return { records: rows, total, page, pageSize };
}

/**
 * 批量发送消息：落站内信（主渠道）+ 按用户配置分发外发渠道，返回发送条数
 */
export async function sendMessages(params: SendMessagesParams): Promise<number> {
  const rows: (typeof message.$inferInsert)[] = params.userIds.map((id) => ({
    userId: id,
    userType: params.userType,
    title: params.title,
    content: params.content ?? null,
    type: params.type ?? "system",
    status: "unread",
    relatedLink: params.relatedLink ?? null,
  }));

  const result = await db.insert(message).values(rows);

  if (await isNotifyEnabled()) {
    const users: UserRef[] = params.userIds.map((id) => ({
      type: params.userType,
      id,
    }));
    const map = await getNotifyChannelsMap(users);
    const title = params.title;
    const content = params.content ?? "";
    await Promise.all(
      users.map((u) => dispatchExternalChannels(map.get(`${u.type}:${u.id}`), title, content)),
    );
  }

  return result.rowCount ?? rows.length;
}

/**
 * 管理端强制软删除任意消息（无用户校验）
 */
export async function deleteMessageById(id: string): Promise<boolean> {
  const result = await db
    .update(message)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(message.id, id), notDeleted(message.deletedAt)));

  return (result.rowCount ?? 0) > 0;
}

/**
 * 按类型 + 关键词搜索用户（发送消息表单的收件人选择器数据源）
 */
export async function searchRecipients(params: {
  userType: UserType;
  keyword?: string;
}): Promise<RecipientOption[]> {
  const keyword = `%${params.keyword ?? ""}%`;
  const limit = 20;

  const adminKeywordCondition = or(
    ilike(adminUser.username, keyword),
    ilike(adminUser.email, keyword),
  );
  const clientKeywordCondition = or(
    ilike(clientUser.username, keyword),
    ilike(clientUser.email, keyword),
  );

  if (params.userType === "admin") {
    const rows = await db
      .select({
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
      })
      .from(adminUser)
      .where(and(notDeleted(adminUser.deletedAt), adminKeywordCondition))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      label: `${r.username}（${r.email}）`,
    }));
  }

  const rows = await db
    .select({
      id: clientUser.id,
      username: clientUser.username,
      email: clientUser.email,
    })
    .from(clientUser)
    .where(and(notDeleted(clientUser.deletedAt), clientKeywordCondition))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, label: `${r.username}（${r.email}）` }));
}

/** 读取用户通知渠道配置（无记录返回空对象） */
export async function getNotifyChannels(user: UserRef): Promise<UserNotifyChannels> {
  const cfg = await getUserConfig(user);
  return cfg.notify_channels ?? {};
}

/** 保存用户通知渠道配置（覆盖 notify_channels 段） */
export async function saveNotifyChannels(
  user: UserRef,
  channels: UserNotifyChannels,
): Promise<void> {
  const cfg = await getUserConfig(user);
  await setUserConfig(user, { ...cfg, notify_channels: channels });
}
