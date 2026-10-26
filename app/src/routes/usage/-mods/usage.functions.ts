/**
 * 前台「我的用量」路由共享 Server Function
 *
 * 自助查询只认当前登录用户：归属由上下文推导后传给服务层，请求体里不接受 owner / accountId，
 * 查询窗口也只接受时间段名（换算在服务端做），因此客户端权限码即使为空集合也不影响越权防护。
 */

import { createServerFn } from "@tanstack/react-start";
import { parseDateOnly, toDateString } from "@ucode/hub-lib/date-format";
import { clientAuthGuard } from "#/middleware/client-auth";
import { usageTotalsForOwner } from "#/services/usage/usage.server";
import { type UsageDateRange, type UsageRange, usageRangeSchema } from "./usage.shared";

/** 各时间段的跨度（含当天）：`today` 1 天、`last7` 7 天、`last30` 30 天 */
const RANGE_DAYS: Record<Exclude<UsageRange, "all">, number> = {
  today: 1,
  last7: 7,
  last30: 30,
};

/**
 * 按业务时区在日期字符串上加减天数：先折成该时区当日 00:00 的绝对时刻，再走 UTC 日历位移，
 * 与服务器本地时区无关（跨月、跨年与本地是否有夏令时都不影响结果）。
 */
const shiftDate = (dateStr: string, days: number): string => {
  const date = parseDateOnly(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
};

/**
 * 时间段 → 服务层筛选的日期区间（闭区间含当日；`all` 不带边界）
 * `today` 取业务时区的当天，与用量落库 / 查询的日期口径一致。
 * @param now 当前时刻，注入以便测试
 */
export const resolveUsageDateRange = (
  range: UsageRange,
  now: Date = new Date(),
): UsageDateRange => {
  if (range === "all") return {};
  const today = toDateString(now);
  return { startDate: shiftDate(today, 1 - RANGE_DAYS[range]), endDate: today };
};

/** 本人在指定时间段的用量汇总；`requests` 为 0 即无用量，由页面渲染空态 */
export const getMyUsageTotalsSFn = createServerFn({ method: "GET" })
  .middleware([clientAuthGuard])
  .validator(usageRangeSchema)
  .handler(async ({ data, context }) =>
    usageTotalsForOwner({ type: "client", id: context.userId }, resolveUsageDateRange(data.range)),
  );
