/**
 * 服务端入口：进程启动时执行预置数据校验与初始化
 * 环境变量由 #/env 统一读取与校验（开发 / 构建期由 Nitro 载入 .env / .env.local，生产由部署声明）
 */

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
