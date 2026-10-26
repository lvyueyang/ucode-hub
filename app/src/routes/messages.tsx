/**
 * 客户端消息中心页面（SSR）
 * 列表分页展示消息，支持标记已读/删除；含「通知渠道设置」
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@ucode/hub-ui-ssr/ui";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { NotifyChannelSettings } from "#/components/client/NotifyChannelSettings";
import { useTranslation } from "#/components/providers";
import { MESSAGE_TYPE_LABELS } from "#/constants/message-types";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import {
  deleteMyMessageSFn,
  getMyMessagesSFn,
  getMyUnreadCountSFn,
  markAllMyMessagesAsReadSFn,
  markMyMessageAsReadSFn,
} from "#/services/message/message.functions";
import type { MessageRecord } from "#/services/message/message.server";
import { sfnUnwrap } from "#/utils/sfn-error";

export const Route = createFileRoute("/messages")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (!user) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const [result, unread] = await Promise.all([
      getMyMessagesSFn({ data: { page: 1 } }),
      getMyUnreadCountSFn(),
    ]);
    return { result, unread };
  },
  component: MessagesPage,
});

const PAGE_SIZE = 10;

/** 消息类型点颜色映射 */
const TYPE_DOT_COLORS: Record<string, string> = {
  system: "bg-neutral-400",
};

function MessagesPage() {
  const { t } = useTranslation();
  const initial = Route.useLoaderData();
  const [records, setRecords] = useState<MessageRecord[]>(initial.result.records);
  const [page, setPage] = useState(initial.result.page);
  const [total, setTotal] = useState(initial.result.total);
  const [unread, setUnread] = useState(initial.unread);
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [loading, setLoading] = useState(false);

  /** 拉取消息列表 */
  const load = useCallback(async (p: number, s: typeof status) => {
    setLoading(true);
    const [result] = await sfnUnwrap(
      getMyMessagesSFn({
        data: {
          page: p,
          pageSize: PAGE_SIZE,
          status: s === "all" ? undefined : s,
        },
      }),
    );
    setLoading(false);
    if (!result) return;
    setRecords(result.records);
    setPage(result.page);
    setTotal(result.total);
  }, []);

  /** 刷新未读数 */
  const refreshUnread = useCallback(async () => {
    // 未读数获取失败不阻塞操作，静默处理
    const [count] = await sfnUnwrap(getMyUnreadCountSFn(), {
      silent: true,
    });
    if (count === null) return;
    setUnread(count);
  }, []);

  /** 标记单条已读 */
  const handleMarkRead = async (id: string) => {
    const [, err] = await sfnUnwrap(markMyMessageAsReadSFn({ data: { id } }));
    if (err) return;
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, status: "read" } : r)));
    await refreshUnread();
  };

  const handleMarkAllRead = async () => {
    const [, err] = await sfnUnwrap(markAllMyMessagesAsReadSFn());
    if (err) return;
    setRecords((prev) => prev.map((r) => ({ ...r, status: "read" })));
    await refreshUnread();
    toast.success(t("已全部标记为已读"));
  };

  const handleDelete = async (id: string) => {
    const [result] = await sfnUnwrap(deleteMyMessageSFn({ data: { id } }));
    if (!result) return;
    if (result.success) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((v: number) => Math.max(0, v - 1));
      await refreshUnread();
      toast.success(t("已删除"));
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("消息中心")}
          </h1>
          <div className="mt-2">
            <NotifyChannelSettings />
          </div>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            {t("全部已读")}
          </Button>
        )}
      </header>

      {/* 状态筛选 */}
      <div className="mb-4 flex items-center gap-2">
        {(["all", "unread", "read"] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStatus(s);
              void load(1, s);
            }}
          >
            {s === "all" && t("全部")}
            {s === "unread" && `${t("未读")}${unread > 0 ? ` (${unread})` : ""}`}
            {s === "read" && t("已读")}
          </Button>
        ))}
      </div>

      {/* 消息列表 */}
      <div className="space-y-3">
        {records.map((msg) => {
          return (
            <Card key={msg.id} className={msg.status === "unread" ? "border-primary/60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {msg.status === "unread" && (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[msg.type] ?? "bg-neutral-400"}`}
                      />
                    )}
                    <span className="truncate">{msg.title}</span>
                  </CardTitle>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {MESSAGE_TYPE_LABELS[msg.type] ?? msg.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {msg.content && (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{msg.content}</p>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <time className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString("zh-CN")}
                  </time>
                  <div className="flex items-center gap-2">
                    {msg.status === "unread" && (
                      <Button variant="ghost" size="sm" onClick={() => void handleMarkRead(msg.id)}>
                        {t("已读")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleDelete(msg.id)}
                    >
                      {t("删除")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {records.length === 0 && !loading && (
          <div className="py-16 text-center text-sm text-muted-foreground">{t("暂无消息")}</div>
        )}
      </div>

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1, status)}
          >
            {t("上一页")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
            onClick={() => void load(page + 1, status)}
          >
            {t("下一页")}
          </Button>
        </div>
      )}
    </main>
  );
}
