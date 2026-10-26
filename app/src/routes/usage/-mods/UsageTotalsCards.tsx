/**
 * 「我的用量」汇总卡：请求数、失败数与 token 消耗按同一时间段口径呈现
 */
import { Card, CardContent, CardHeader, CardTitle } from "@ucode/hub-ui-ssr/ui";
import { useTranslation } from "#/components/providers";
import type { UsageTotals } from "#/services/usage/usage.server";
import { formatCount } from "./usage.shared";

/** 一项汇总：`label` 是 i18n key，`hint` 已按当前语言渲染好 */
type SummaryItem = {
  /** 卡片标题（i18n key） */
  label: string;
  /** 主数值，已格式化 */
  value: string;
  /** 补充说明，无则不渲染 */
  hint?: string;
};

/** 汇总卡列表：与页头时间段同口径（服务层用同一份 where 算出的 totals） */
export function UsageTotalsCards({ totals }: { totals: UsageTotals }) {
  const { t } = useTranslation();

  const failureRate = totals.requests > 0 ? (totals.errorRequests / totals.requests) * 100 : 0;
  const items: SummaryItem[] = [
    { label: "请求数", value: formatCount(totals.requests) },
    {
      label: "失败数",
      value: formatCount(totals.errorRequests),
      hint: t("失败率 {{rate}}%", { rate: failureRate.toFixed(1) }),
    },
    { label: "输入 Token", value: formatCount(totals.promptTokens) },
    { label: "输出 Token", value: formatCount(totals.completionTokens) },
    { label: "合计 Token", value: formatCount(totals.totalTokens) },
    { label: "平均耗时", value: `${formatCount(totals.avgLatencyMs)} ms` },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              {t(item.label)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
            {item.hint && <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
