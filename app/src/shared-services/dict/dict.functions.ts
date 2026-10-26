/**
 * 字典 Server Functions：全局共享选项加载（跨端 store 使用，无单一页面归属）
 */
import { createServerFn } from "@tanstack/react-start";
import { getAllDictOptions } from "./dict.server";

/** 获取全部字典选项（按 slug 分组，供 zustand store 一次性加载） */
export const getAllDictOptionsSFn = createServerFn({ method: "GET" }).handler(async () => {
  return getAllDictOptions();
});
