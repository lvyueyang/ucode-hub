/**
 * SFn 错误提示内容：正面单行展示可读消息与「详情」按钮，点击弹出详情弹窗
 * 仅展示非敏感信息（详情由 utils/sfn-error 组装，生产环境不携带原始技术信息）
 */
import type { SfnErrorInfo } from "#/utils/sfn-error";
import { openSfnErrorDetails } from "./SfnErrorDialog";

export function SfnErrorNotice({ info }: { info: SfnErrorInfo }) {
  const hasDetails = Boolean(info.details);

  return (
    <div className="flex items-center gap-2">
      <span className="line-clamp-2 min-w-0 flex-1 break-words leading-5">{info.title}</span>
      {hasDetails && (
        <button
          type="button"
          onClick={() => openSfnErrorDetails(info)}
          className="shrink-0 whitespace-nowrap text-xs leading-5 underline underline-offset-2 opacity-70 transition-opacity hover:opacity-100"
        >
          详情
        </button>
      )}
    </div>
  );
}
