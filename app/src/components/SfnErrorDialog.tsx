/**
 * SFn 错误详情弹窗：根级宿主 + 命令式触发
 * 独立于 toast 生命周期（toast 消失后仍可查看），UI 无关：纯 HTML + 语义令牌类
 */
import { copyToClipboard } from "@ucode/hub-lib/clipboard";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SfnErrorInfo } from "#/utils/sfn-error";

/** 打开详情弹窗的自定义事件名 */
const OPEN_EVENT = "hub:sfn-error-details";

/** 命令式打开详情弹窗（供提示内容调用） */
export function openSfnErrorDetails(info: SfnErrorInfo): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SfnErrorInfo>(OPEN_EVENT, { detail: info }));
}

/** 单行详情（可选复制按钮） */
function DetailRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 卸载时清理复制反馈定时器，避免关闭弹窗后仍触发 setState
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    if (!(await copyToClipboard(value))) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-foreground-tertiary">{label}</span>
      <span
        className={`min-w-0 flex-1 select-all break-all text-foreground-secondary${
          mono ? " font-mono" : ""
        }`}
      >
        {value}
      </span>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-foreground-secondary underline underline-offset-2 hover:text-foreground"
        >
          {copied ? "已复制" : "复制"}
        </button>
      )}
    </div>
  );
}

/** 详情弹窗宿主：在根外壳挂载一次，同时覆盖管理端与前台 */
export function SfnErrorDialogHost() {
  const [info, setInfo] = useState<SfnErrorInfo | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      setInfo((event as CustomEvent<SfnErrorInfo>).detail);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  // 弹窗打开时接管 Esc 关闭，并把焦点移入自身
  // （用命令式 focus 而非 autoFocus 属性：属性形态在首帧水合前就会抢焦点）
  useEffect(() => {
    if (!info) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInfo(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [info]);

  // 根外壳返回 <html> 本身，宿主作为其兄弟节点位于 <body> 之外，需 portal 到 body 才能进入布局树
  if (!info || typeof document === "undefined") return null;

  const { requestId, sfnName, rawMessage } = info.details ?? {};

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4">
      {/* 遮罩：点击关闭 */}
      <button
        type="button"
        aria-label="关闭错误详情"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={() => setInfo(null)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md border border-border bg-background p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">错误详情</p>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={() => setInfo(null)}
            className="shrink-0 text-xs text-foreground-secondary hover:text-foreground"
          >
            关闭
          </button>
        </div>
        <p className="mb-3 break-words text-sm leading-5 text-foreground">{info.title}</p>
        <div className="space-y-2 text-xs">
          {requestId && <DetailRow label="请求号" value={requestId} mono copyable />}
          {sfnName && <DetailRow label="SFn 方法名" value={sfnName} />}
          {rawMessage && <DetailRow label="原始信息" value={rawMessage} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
