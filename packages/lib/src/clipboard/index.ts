/**
 * 剪贴板复制工具：优先 Clipboard API，非安全上下文（HTTP）或复制被拒时退回 execCommand 兜底
 * 纯浏览器侧工具，按需调用，不参与 SSR
 */

/**
 * 复制文本到剪贴板，返回是否成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API 被拒绝（如权限问题）时继续走兜底
  }
  return fallbackCopy(text);
}

/** 基于临时 textarea + execCommand 的兜底复制（Clipboard API 仅 HTTPS/localhost 可用） */
function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // 不可用 display:none（部分浏览器无法从隐藏元素复制），用离屏透明元素
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    // execCommand 为同步 API，无需 await，直接移除临时节点
    document.body.removeChild(textarea);
  }
  return ok;
}
