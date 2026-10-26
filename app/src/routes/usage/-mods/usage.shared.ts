/**
 * 前台「我的用量」页共用：时间段定义、入参 schema 与数值格式化。
 *
 * 时间段只以名字在客户端与 SFn 之间传递，窗口换算留在服务端（`usage.functions.ts`），
 * 因此客户端不接触日期边界，也无法自定义查询区间。
 */
import { z } from "zod";

/** 可选时间段：当天 / 近一周 / 近一月 / 不限 */
export const USAGE_RANGES = ["today", "last7", "last30", "all"] as const;

export type UsageRange = (typeof USAGE_RANGES)[number];

/**
 * 首屏默认时间段取近 7 天：当天可能还没有调用（首屏就撞空态），
 * 而「最近用得怎么样」才是这个页面的常态诉求。
 */
export const DEFAULT_USAGE_RANGE: UsageRange = "last7";

/** SFn 入参：只有时间段名，归属与日期边界都由服务端推导 */
export const usageRangeSchema = z.object({ range: z.enum(USAGE_RANGES) });

/** 时间段的按钮文案（中文即 key） */
export const USAGE_RANGE_LABELS: Record<UsageRange, string> = {
  today: "今天",
  last7: "近 7 天",
  last30: "近 30 天",
  all: "全部",
};

/** 服务层筛选用的日期区间：闭区间含当日，字段缺省即该侧不设边界 */
export type UsageDateRange = {
  /** 起始日（YYYY-MM-DD） */
  startDate?: string;
  /** 截止日（YYYY-MM-DD，含当日） */
  endDate?: string;
};

/** 计数展示：千分位，便于一眼看出量级 */
export const formatCount = (value: number): string => value.toLocaleString("zh-CN");
