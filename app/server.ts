/**
 * Nitro server entry：项目根目录的 server.ts 被 Nitro 自动检测
 * bootstrap 先于一切请求执行；fetch 仅做统一埋点，随后交还请求流转至 TanStack Start SSR
 * 环境校验排在 bootstrap 之前：db / logger / jwt 在导入期就读 env，而静态导入的求值早于本文件正文，
 * 故 bootstrap 用动态导入，让配置缺失 / 非法时先报出可读中文原因，而不是从半途抛出的取值错误
 * 注意：禁止直接 import src/server.ts（会绕过 Vite SSR runner 惰性路由，导致路由 eager 加载）
 */
import { assertEnv, EnvError } from "./src/env";
import { httpRequestsTotal } from "./src/shared-services/metrics";

try {
  assertEnv();
  const { bootstrap } = await import("./src/bootstrap");
  await bootstrap();
} catch (error) {
  if (!(error instanceof EnvError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
  // 不调 process.exit：进程内已注册优雅关闭与缓冲刷入，启动期失败也走同一个出口；
  // 但仍要抛出——入口求值不完成，进程就不能带着未校验的配置对外监听
  throw new Error("环境变量校验未通过，启动中止");
}

export default {
  async fetch(req: Request) {
    httpRequestsTotal.inc({ method: req.method });
    // 返回 undefined → 请求继续流转至 TanStack Start SSR / 静态资源等
    return undefined;
  },
};
