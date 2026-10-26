/**
 * 消息模块 zod 校验 schema：收件箱查询、管理列表、发送、收件人搜索、用户通知渠道配置
 */
import { z } from "zod";
import { listSchema } from "#/validators/common.schemas";

/** 用户端类型 */
const userTypeSchema = z.enum(["admin", "client"]);

/** 消息状态 */
const statusSchema = z.enum(["unread", "read"]);

/** 收件箱消息列表查询（客户端 / 管理端自助共用）：通用分页参数 + 状态筛选 */
export const messageListSchema = listSchema.extend({
  status: statusSchema.optional(),
});

/** 单条消息操作（标记已读 / 删除） */
export const messageIdSchema = z.object({
  id: z.string().min(1),
});

/** 管理端全量消息列表查询：通用分页参数 + 用户 / 状态 / 关键词筛选 */
export const adminMessageListSchema = listSchema.extend({
  userType: userTypeSchema.optional(),
  status: statusSchema.optional(),
  type: z.string().max(50).optional(),
  keyword: z.string().max(100).optional(),
});

/** 发送消息（管理端向用户批量发送） */
export const sendMessageSchema = z.object({
  userType: userTypeSchema,
  userIds: z.array(z.string().uuid()).min(1).max(100),
  title: z.string().min(1).max(200),
  content: z.string().max(2000).optional(),
  type: z.string().max(50).optional(),
  relatedLink: z.string().max(500).optional(),
});

/** 搜索消息接收者（发送消息表单的选择器数据源） */
export const searchRecipientsSchema = z.object({
  userType: userTypeSchema,
  keyword: z.string().max(50).optional(),
});

/** 单渠道配置：enabled 允许缺省（缺失视为停用，由调用方兜底） */
const notifyChannelConfigSchema = z.object({
  enabled: z.boolean().optional(),
  value: z.string().max(500).optional(),
  secret: z.string().max(500).optional(),
});

/** 用户通知渠道配置（外发渠道段） */
export const notifyChannelsSchema = z.object({
  email: notifyChannelConfigSchema.optional(),
  feishu: notifyChannelConfigSchema.optional(),
  wecom: notifyChannelConfigSchema.optional(),
  dingtalk: notifyChannelConfigSchema.optional(),
  webhook: notifyChannelConfigSchema.optional(),
  sms: notifyChannelConfigSchema.optional(),
});
