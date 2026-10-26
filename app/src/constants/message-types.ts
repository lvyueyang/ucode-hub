/**
 * 消息类型共享定义：通知/消息的 type 值、展示标签单一来源
 * 客户端安全，可被前端组件直接引用
 */

/** 消息类型 */
export type MessageType = "system";

/** 预置消息类型数组（可扩展，新增业务类型在此登记） */
export const MESSAGE_TYPES = ["system"] as const satisfies readonly MessageType[];

/** 消息类型 → 中文标签 */
export const MESSAGE_TYPE_LABELS: Record<string, string> = {
  system: "系统",
};
