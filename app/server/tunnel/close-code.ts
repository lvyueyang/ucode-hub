/**
 * WebSocket 关闭码的归一：对端给的值不一定能原样转发。
 *
 * 1005 / 1006 是本地状态（没有收到关闭帧 / 连接异常断开），1015 是 TLS 握手失败，
 * 按 RFC 6455 都不允许出现在发出的关闭帧里；越界或缺失的一律按正常关闭处理。
 */
const UNSENDABLE_CLOSE_CODES = new Set([1004, 1005, 1006, 1015]);

export const normalizeCloseCode = (code: number | undefined): number => {
  if (code === undefined || code < 1000 || code > 4999) return 1000;
  return UNSENDABLE_CLOSE_CODES.has(code) ? 1000 : code;
};

/** 关闭原因的上限：WebSocket 关闭帧的控制帧载荷只有 125 字节，留出编码余量 */
export const MAX_CLOSE_REASON_LENGTH = 100;

export const truncateCloseReason = (reason: string | undefined): string | undefined => {
  if (!reason) return undefined;
  return reason.length > MAX_CLOSE_REASON_LENGTH
    ? reason.slice(0, MAX_CLOSE_REASON_LENGTH)
    : reason;
};
