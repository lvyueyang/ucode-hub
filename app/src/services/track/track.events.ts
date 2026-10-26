/**
 * 埋点事件查询模块：分页查询与已有事件名列表（供筛选下拉）
 */
import { toDayRange } from "@ucode/hub-lib/date-format";
import { and, eq, gte, ilike, lt, or, type SQLWrapper, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { trackEvent as trackEventTable } from "#/db/schema";
import {
  buildSortClause,
  executePaginatedQuery,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type { JsonProperties, TrackEventQuery, TrackEventQueryResult } from "./track.types";

/** 分页查询埋点事件 */
export async function searchTrackEvents(query: TrackEventQuery): Promise<TrackEventQueryResult> {
  const {
    name: eventName,
    userId,
    sessionId,
    keyword,
    startDate,
    endDate,
    page = 1,
    pageSize = 20,
    sortField,
    sortOrder,
  } = query;

  const conditions: (SQLWrapper | undefined)[] = [];

  if (eventName) {
    conditions.push(eq(trackEventTable.name, eventName));
  }
  if (userId) {
    conditions.push(eq(trackEventTable.userId, userId));
  }
  if (sessionId) {
    conditions.push(eq(trackEventTable.sessionId, sessionId));
  }
  if (keyword) {
    conditions.push(
      or(
        ilike(trackEventTable.name, `%${keyword}%`),
        sql`${trackEventTable.properties}::text ILIKE ${`%${keyword}%`}`,
      ),
    );
  }
  if (startDate) {
    conditions.push(gte(trackEventTable.time, toDayRange(startDate).start));
  }
  if (endDate) {
    // endDate 按业务时区包含当天全天：排他上界为次日 00:00
    conditions.push(lt(trackEventTable.time, toDayRange(endDate).end));
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = paginationOffset(page, pageSize);

  const sortFieldMap = { time: trackEventTable.time };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "time");

  const result = await executePaginatedQuery(
    db
      .select()
      .from(trackEventTable)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(trackEventTable).where(whereCondition)),
    page,
    pageSize,
  );

  return {
    records: result.records.map((e) => ({
      ...e,
      properties: e.properties as JsonProperties,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

/** 获取已有的事件名称列表（供筛选下拉） */
export async function getTrackEventNames(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: trackEventTable.name })
    .from(trackEventTable)
    .orderBy(trackEventTable.name);
  return rows.map((r) => r.name);
}
