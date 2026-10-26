/**
 * UI 层剪贴板复制：在 @ucode/hub-lib/clipboard 的 copyToClipboard 之上集成 antd message 提示
 * 基础层为纯逻辑不依赖 UI，本层负责成功/失败/警告三种提示通道
 */
import { copyToClipboard } from "@ucode/hub-lib/clipboard";
import { message } from "./antd-static";

/** copyText 选项 */
export interface CopyTextOptions {
  /** 复制成功提示文案（缺省「已复制」） */
  successMsg?: string;
  /** 复制失败提示文案（缺省「复制失败，请手动复制」） */
  failMsg?: string;
  /** 成功提示通道（缺省 success；如「已复制但需注意」场景用 warning） */
  successType?: "success" | "warning";
}

/**
 * 复制文本到剪贴板并经 antd message 提示结果
 */
export async function copyText(text: string, options?: CopyTextOptions): Promise<void> {
  const ok = await copyToClipboard(text);
  if (!ok) {
    message.error(options?.failMsg ?? "复制失败，请手动复制");
    return;
  }
  const msg = options?.successMsg ?? "已复制";
  if (options?.successType === "warning") {
    message.warning(msg);
  } else {
    message.success(msg);
  }
}
