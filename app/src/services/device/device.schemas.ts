/**
 * 设备域的 zod Schema 单一来源。
 *
 * 分三组：管理端列表与单条操作、前台自助（改名 / 吊销）、外部客户端接入（登录 + 登记）。
 * 外部接入的登录沿用「用户名 + 密码」，管理端与客户端账号都认（见 `routes/api/v1/auth/login`）。
 */
import { z } from "zod";

import { listSchema } from "#/validators/common.schemas";

const deviceStatusSchema = z.enum(["active", "revoked"]);

/** 管理端设备列表查询：通用分页 + 状态 / 归属端筛选（关键词走基座字段） */
export const deviceListSchema = listSchema.extend({
  status: deviceStatusSchema.optional(),
  ownerType: z.enum(["admin", "client"]).optional(),
});

/** 设备改名（管理端与前台共用同一约束） */
export const deviceRenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
});

/** 设备吊销（令牌立即失效，记录保留） */
export const deviceRevokeSchema = z.object({ id: z.string().min(1) });

/** 设备记录软删除（管理端清理用） */
export const deviceDeleteSchema = z.object({ id: z.string().min(1) });

/** 外部客户端登录 hub：换取调用设备接口的 Bearer 令牌 */
export const deviceLoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

/** 外部客户端登记本机为设备：同一用户名下同名设备视为同一台，登记即轮换令牌 */
export const deviceRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.string().max(50).optional(),
  clientVersion: z.string().max(50).optional(),
});
