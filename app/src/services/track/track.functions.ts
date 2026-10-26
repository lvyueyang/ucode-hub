/**
 * 埋点事件 Server Function 包装器
 * trackEventSFn 被客户端 SDK 调用，元事件/元属性 SFn 被 admin 多路由共享
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { getTrackEventMetaList, getTrackPropertyMetaList, trackEvent } from "./track.server";
import type { JsonProperties } from "./track.types";

/** 埋点事件上报入参 schema（客户端 SDK 与测试共用） */
export const trackEventSchema = z.object({
  time: z.number(),
  userId: z.string().optional(),
  sessionId: z.string().min(1),
  name: z.string().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).default({}),
});

/**
 * 接收客户端埋点事件（公开接口，无需鉴权）
 * 事件进入内存缓冲队列，异步批量写入数据库
 * 服务端从请求头提取 $ip（通过 x-forwarded-for）和 $user_agent，注入到 properties
 */
export const trackEventSFn = createServerFn({ method: "POST" })
  .validator(trackEventSchema)
  .handler(async ({ data }) => {
    const serverProps: Record<string, unknown> = {};

    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) {
      serverProps.$ip = ip;
    }

    const ua = getRequestHeader("user-agent");
    if (ua) {
      serverProps.$user_agent = ua;
    }

    trackEvent({
      ...data,
      properties: { ...data.properties, ...serverProps } as JsonProperties,
    });
    return { success: true };
  });

/** 获取元事件列表（admin 多路由共享：event-meta 管理页 + 事件查询页） */
export const getTrackEventMetaSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_VIEW)])
  .handler(async () => getTrackEventMetaList());

/** 获取元属性列表（admin 多路由共享：property-meta 管理页 + 事件查询页） */
export const getTrackPropertyMetaSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.TRACK_VIEW)])
  .handler(async () => getTrackPropertyMetaList());
