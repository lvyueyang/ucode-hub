/**
 * 埋点事件服务层入口：事件上报缓冲写入 + 各子模块统一导出（barrel）
 * 事件校验/频控/时间钳制 → track.validate；元数据管理 → track.meta；查询分析 → track.analytics
 */
import { BatchWriter, type BatchWriterEvent } from "@ucode/hub-lib/batch-writer";
import { db } from "#/db/index";
import { trackEvent as trackEventTable } from "#/db/schema";
import { logger } from "#/shared-services/logger";
import {
  getTrackPropertyDataType,
  isTrackEventNameRegistered,
  isTrackMetaCacheLoaded,
  isTrackPropertyKeyRegistered,
  loadTrackMetaCache,
} from "./track.meta";
import type { TrackEventInput } from "./track.types";
import {
  clampTrackEventTime,
  isTrackSessionRateLimited,
  isValidPropertyValue,
} from "./track.validate";

interface TrackEventBufferItem {
  time: Date;
  userId: string | null;
  sessionId: string;
  name: string;
  properties: Record<string, unknown>;
}

/** 包装 batch-writer 事件到 app 日志单例（warn → info 级别告警，error → error 级别） */
const logBatchEvent = (event: BatchWriterEvent): void => {
  if (event.level === "warn") {
    logger.warn(event.message);
  } else {
    logger.error(
      {
        error: event.error instanceof Error ? event.error.message : String(event.error),
      },
      event.message,
    );
  }
};

/** 埋点事件批量写入器：满 100 条或 5 秒定时刷新，上限 1000 */
const eventWriter = new BatchWriter<TrackEventBufferItem>({
  logLabel: "埋点事件",
  onEvent: logBatchEvent,
  insertFn: async (batch) => {
    await db.insert(trackEventTable).values(
      batch.map((item) => ({
        time: item.time,
        userId: item.userId,
        sessionId: item.sessionId,
        name: item.name,
        properties: item.properties,
      })),
    );
  },
});

/**
 * 埋点事件入口（浏览器匿名路径）：经 per-session 频控
 * 依次校验：频控 → 事件名 → 属性键 → 属性值类型 → 安全限制，不合法则记录日志后丢弃
 */
export function trackEvent(input: TrackEventInput): void {
  trackEventInternal(input, false);
}

/**
 * 服务端可信事件入口：面向低频可信的服务端调用，跳过匿名 per-session 频控
 * （服务端事件不依赖浏览器会话），其余校验与 trackEvent 一致
 */
export function trackServerEvent(input: TrackEventInput): void {
  trackEventInternal(input, true);
}

/** 埋点事件入队内部实现：skipRateLimit 为 true 时跳过 per-session 频控 */
function trackEventInternal(input: TrackEventInput, skipRateLimit: boolean): void {
  // 频控：单会话超限直接丢弃（服务端可信事件跳过）
  if (!skipRateLimit && isTrackSessionRateLimited(input.sessionId)) {
    logger.warn({ sessionId: input.sessionId, ip: input.ip }, "埋点事件被丢弃：会话上报频率超限");
    return;
  }

  // 时间钳制：异常客户端时间以服务端时间为准
  const time = clampTrackEventTime(input.time);
  if (time !== input.time) {
    logger.warn(
      { originalTime: input.time, sessionId: input.sessionId, ip: input.ip },
      "埋点事件时间超出合理区间，已改用服务端时间",
    );
  }

  // 缓存未就绪时不校验，允许写入（启动阶段兜底）
  if (!isTrackMetaCacheLoaded()) {
    loadTrackMetaCache().catch((err) => {
      logger.warn({ error: (err as Error).message }, "元数据缓存加载失败");
    });
    pushToBuffer(input, time);
    return;
  }

  // 校验事件名是否在元事件中注册
  if (!isTrackEventNameRegistered(input.name)) {
    logger.warn(
      { name: input.name, sessionId: input.sessionId, ip: input.ip },
      "埋点事件被丢弃：事件名未注册",
    );
    return;
  }

  // 校验属性键和值类型
  for (const key of Object.keys(input.properties)) {
    const value = input.properties[key];

    // $ 开头的系统属性只校验键是否存在，不做类型校验（服务端补齐）
    if (key.startsWith("$")) {
      if (!isTrackPropertyKeyRegistered(key)) {
        logger.warn(
          { name: input.name, key, sessionId: input.sessionId, ip: input.ip },
          "埋点事件被丢弃：系统属性键未注册",
        );
        return;
      }
      continue;
    }

    const expectedType = getTrackPropertyDataType(key);
    if (!expectedType) {
      logger.warn(
        { name: input.name, key, sessionId: input.sessionId, ip: input.ip },
        "埋点事件被丢弃：属性键未注册",
      );
      return;
    }

    if (!isValidPropertyValue(value, expectedType)) {
      logger.warn(
        {
          name: input.name,
          key,
          expectedType,
          actualType: typeof value,
          sessionId: input.sessionId,
          ip: input.ip,
        },
        "埋点事件被丢弃：属性值类型校验失败",
      );
      return;
    }
  }

  pushToBuffer(input, time);
}

function pushToBuffer(input: TrackEventInput, time: number): void {
  eventWriter.push({
    time: new Date(time),
    userId: input.userId ?? null,
    sessionId: input.sessionId,
    name: input.name,
    properties: input.properties,
  });
}

/** 强制刷新缓冲（服务关闭前兜底；失败仅记日志，不阻断优雅关闭） */
export async function flushTrackEvents(): Promise<void> {
  try {
    await eventWriter.shutdown();
  } catch (err) {
    logger.error({ err }, "埋点事件缓冲刷入失败（优雅关闭继续）");
  }
}

export { getTrackAnalytics } from "./track.analytics";
export { getTrackEventNames, searchTrackEvents } from "./track.events";
export {
  createTrackEventMeta,
  createTrackPropertyMeta,
  deleteTrackEventMeta,
  deleteTrackPropertyMeta,
  ensurePresetEvents,
  ensurePresetProperties,
  getTrackEventMeta,
  getTrackEventMetaList,
  getTrackPropertyMeta,
  getTrackPropertyMetaList,
  loadTrackMetaCache,
  resetTrackMetaCacheForTest,
  updateTrackEventMeta,
  updateTrackPropertyMeta,
} from "./track.meta";
export type {
  AnalyticsDelta,
  DimensionDistributionItem,
  EventRankingItem,
  JsonProperties,
  JsonValue,
  TimeSeriesPoint,
  TopPageItem,
  TrackAnalyticsQuery,
  TrackAnalyticsResult,
  TrackEventInput,
  TrackEventMetaInput,
  TrackEventMetaRecord,
  TrackEventQuery,
  TrackEventQueryResult,
  TrackEventRecord,
  TrackPropertyMetaInput,
  TrackPropertyMetaRecord,
} from "./track.types";
export { ANALYTICS_DIMENSION_KEYS } from "./track.types";
export {
  clearTrackRateLimit,
  TRACK_RATE_LIMIT,
} from "./track.validate";
