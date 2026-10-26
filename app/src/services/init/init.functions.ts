/**
 * 初始化模块 Server Function 包装器
 * checkInitStatusSFn 被 admin/login、admin/init、admin/forgot-password 三个路由共享
 */
import { createServerFn } from "@tanstack/react-start";
import { checkInitStatus } from "./init.server";

/** 检查系统是否已完成初始化 */
export const checkInitStatusSFn = createServerFn({ method: "GET" }).handler(async () =>
  checkInitStatus(),
);
