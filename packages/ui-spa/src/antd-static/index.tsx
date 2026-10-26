/**
 * antd 静态方法桥接：让 message / modal / notification 在 App 上下文内渲染，
 * 保证主题 token（暗色算法、品牌色）正确继承，且 antd 样式始终经
 * StyleProvider layer 注入 @layer antd（避免静态 root 产生未分层样式污染页面锚点）。
 *
 * 背景：antd 静态函数（import { message } from "antd"）会创建独立 React root，
 * 脱离 <StyleProvider layer> 与 ConfigProvider 上下文，导致：
 *   1. 生成的 reset/link 样式（:where(hash) a { color: colorLink }）未分层，
 *      优先级高于所有 @layer（含 utilities），把全站 a 标签冲成 antd 蓝；
 *   2. 主题 token（暗色算法、品牌色）不随切换生效。
 * 因此所有组件与工具模块统一从本模块导入，禁止再静态导入 antd 的 message/modal/notification。
 *
 * 使用约束：实例在 <App> 挂载后才捕获（写入发生在被动副作用中），调用必须发生在
 * 事件处理或 useEffect 等被动副作用里；禁止在渲染期、useLayoutEffect（早于被动副作用）
 * 以及路由 loader/beforeLoad 等早于 App 挂载的阶段调用，否则 createProxy 会抛出明确错误
 * （宁抛错不静默失败）。
 */
import { App } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import type { ModalStaticFunctions } from "antd/es/modal/confirm";
import type { NotificationInstance } from "antd/es/notification/interface";
import { useEffect } from "react";

let messageApi: MessageInstance | null = null;
let modalApi: Omit<ModalStaticFunctions, "warn"> | null = null;
let notificationApi: NotificationInstance | null = null;

/**
 * 捕获 App 上下文实例的桥接组件，须挂在两端 Provider 的 <App> 内部。
 * 写入模块级引用属于副作用，统一放在 useEffect 中并在卸载时清空
 * （渲染期写会在并发渲染与 StrictMode 下重复执行、留下脏引用）。
 */
export function AntdStaticBridge() {
  const { message, modal, notification } = App.useApp();

  useEffect(() => {
    messageApi = message;
    modalApi = modal;
    notificationApi = notification;
    return () => {
      messageApi = null;
      modalApi = null;
      notificationApi = null;
    };
  }, [message, modal, notification]);

  return null;
}

/** 取值时再委托实例，规避模块加载时序；未挂载即调用属于程序错误，直接抛出防止静默失败 */
function createProxy<T extends object>(getApi: () => T | null, name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const api = getApi();
      if (!api) {
        throw new Error(`AntdStaticBridge 尚未挂载，无法调用 ${name}.${String(prop)}`);
      }
      return (api as Record<string, unknown>)[prop as string];
    },
  });
}

/** 消息提示实例，语义同 antd 静态 message */
export const message: MessageInstance = createProxy(() => messageApi, "message");

/** 确认弹窗实例，语义同 antd 静态 modal（不含已废弃的 warn） */
export const modal: Omit<ModalStaticFunctions, "warn"> = createProxy(() => modalApi, "modal");

/** 通知实例，语义同 antd 静态 notification */
export const notification: NotificationInstance = createProxy(
  () => notificationApi,
  "notification",
);
