/**
 * 服务启动初始化：环境变量校验、错误处理、预置数据、定时任务、优雅关闭
 */

import { runMigrations } from "#/db/migrate";
import { assertEnv } from "#/env";
import { registerAllTasks } from "#/services/tasks/tasks.server";
import {
  ensurePresetEvents,
  ensurePresetProperties,
  flushTrackEvents,
  loadTrackMetaCache,
} from "#/services/track/track.server";
import { ensurePresetConfigs } from "#/shared-services/config/config.server";
import { ensurePresetDicts, ensureSeedDicts } from "#/shared-services/dict/dict.server";
import { ensurePresetTranslations } from "#/shared-services/i18n/i18n.seed";
import { logger } from "#/shared-services/logger";
import { flushOperationLogs } from "#/shared-services/operation-log/operation-log.server";

/** 优雅关闭超时时间（毫秒），防止缓冲刷入挂起导致进程无法退出 */
const GRACEFUL_SHUTDOWN_TIMEOUT = 10_000;

export async function bootstrap() {
  // 校验排在最前：缺必需项 / 取值非法时不建连接池、不跑迁移，避免以错误配置做半途初始化
  assertEnv();
  logger.info("服务启动初始化开始");
  // 程序化数据库迁移（fail-fast：迁移失败即应用启动失败，避免 schema 不一致静默运行，
  // 生产部署由 deploy.sh 通过健康检查捕获迁移结果）
  await runMigrations();

  // 预置数据：字典 / 业务字典 / 系统配置同步等待完成后再对外服务（请求链路依赖它们读配置与字典）
  try {
    await Promise.all([ensurePresetDicts(), ensureSeedDicts(), ensurePresetConfigs()]);
  } catch (err) {
    logger.error({ err }, "预置字典 / 业务字典播种 / 系统配置初始化失败");
  }
  // 预置翻译与埋点元数据不阻塞启动：失败仅落 error 日志，缓存待首次访问懒加载
  void ensurePresetTranslations().catch((err) => {
    logger.error({ err }, "预置翻译初始化失败");
  });

  // 事件预设 → 缓存加载有依赖链：先写 trackEventMeta/trackPropertyMeta，再加载缓存
  void Promise.all([ensurePresetEvents(), ensurePresetProperties()])
    .then(() => loadTrackMetaCache())
    .catch((err) => {
      logger.error({ err }, "预置元事件/元属性或缓存加载失败");
    });

  // 注册定时任务
  registerAllTasks();

  // 注册优雅关闭处理器（含超时保护）
  let shuttingDown = false;
  const gracefulShutdown = async (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ exitCode }, "开始优雅关闭，刷入缓冲...");
    try {
      await Promise.race([
        Promise.all([flushTrackEvents(), flushOperationLogs()]),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("缓冲刷入超时，强制退出")), GRACEFUL_SHUTDOWN_TIMEOUT),
        ),
      ]);
      process.exit(exitCode);
    } catch (err) {
      logger.error({ err }, "缓冲刷入失败");
      process.exit(1);
    }
  };

  // 进程级异常同样走优雅关闭：直接 process.exit 会丢弃 BatchWriter 缓冲中的埋点与审计
  process.on("uncaughtException", (err, origin) => {
    logger.fatal({ err, origin }, "未捕获的异常，进程即将退出");
    void gracefulShutdown(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "未处理的 Promise 拒绝，进程即将退出");
    void gracefulShutdown(1);
  });

  // 信号触发的退出视为正常退出（exitCode 0）
  process.on("SIGTERM", () => void gracefulShutdown(0));
  process.on("SIGINT", () => void gracefulShutdown(0));
  process.on("SIGQUIT", () => void gracefulShutdown(0));
}
