/**
 * 前台「我的用量」：本人经中继发起的模型调用量与 token 消耗
 * 未登录跳登录页；切时间段重新取数（窗口换算在服务端，见 -mods/usage.functions.ts）
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@ucode/hub-ui-ssr/ui";
import { useState } from "react";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import type { UsageTotals } from "#/services/usage/usage.server";
import { sfnUnwrap } from "#/utils/sfn-error";
import { UsageTotalsCards } from "./usage/-mods/UsageTotalsCards";
import { getMyUsageTotalsSFn } from "./usage/-mods/usage.functions";
import {
  DEFAULT_USAGE_RANGE,
  USAGE_RANGE_LABELS,
  USAGE_RANGES,
  type UsageRange,
} from "./usage/-mods/usage.shared";

export const Route = createFileRoute("/usage")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (!user) throw redirect({ to: "/login" });
  },
  loader: async () => getMyUsageTotalsSFn({ data: { range: DEFAULT_USAGE_RANGE } }),
  component: UsagePage,
});

function UsagePage() {
  const { t } = useTranslation();
  const initial = Route.useLoaderData();
  const [range, setRange] = useState<UsageRange>(DEFAULT_USAGE_RANGE);
  const [totals, setTotals] = useState<UsageTotals>(initial);
  const [loading, setLoading] = useState(false);

  /** 切换时间段：只在拿到结果后替换汇总，失败保留上一段的数据（统一出口已提示） */
  const selectRange = async (next: UsageRange) => {
    if (next === range || loading) return;
    setRange(next);
    setLoading(true);
    const [result] = await sfnUnwrap(getMyUsageTotalsSFn({ data: { range: next } }), {
      error: t("加载用量失败"),
    });
    setLoading(false);
    if (result) setTotals(result);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("我的用量")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:mt-2">
          {t("本人经中继发起的模型调用量与 token 消耗")}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {USAGE_RANGES.map((item) => (
          <Button
            key={item}
            variant={item === range ? "default" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => void selectRange(item)}
          >
            {t(USAGE_RANGE_LABELS[item])}
          </Button>
        ))}
        {loading && (
          <span role="status" className="text-xs text-muted-foreground">
            {t("加载中…")}
          </span>
        )}
      </div>

      <div aria-busy={loading} className={loading ? "opacity-60" : undefined}>
        {totals.requests === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("该时间段内暂无用量")}
          </div>
        ) : (
          <UsageTotalsCards totals={totals} />
        )}
      </div>
    </main>
  );
}
