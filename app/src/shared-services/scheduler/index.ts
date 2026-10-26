/**
 * 定时任务调度器：基于 cron 库的轻量级定时任务管理
 * 直接引用 shared-services 的 logger 单例；tasks Map 为模块级（cron 仅在服务进程注册）
 */

import { DEFAULT_TASK_TIME_ZONE } from "@ucode/hub-lib/date-format";
import { CronJob, CronTime } from "cron";
import { logger } from "#/shared-services/logger";

/** 任务定义 */
export interface ScheduledTask {
  /** 任务名称 */
  name: string;
  /** cron 表达式（标准 5 或 6 字段） */
  cronExpression: string;
  /** 任务执行函数 */
  handler: () => Promise<void>;
  /** 是否立即执行一次 */
  runOnInit?: boolean;
  /** 任务执行时区，默认 Asia/Shanghai（业务统一时区） */
  timeZone?: string;
}

/** 已注册的任务映射 */
const tasks = new Map<string, CronJob>();

/**
 * 注册并启动定时任务
 */
export function registerTask(task: ScheduledTask): void {
  const validation = CronTime.validateCronExpression(task.cronExpression);
  if (!validation.valid) {
    logger.warn(
      {
        name: task.name,
        expr: task.cronExpression,
        error: validation.error?.message,
      },
      "无效的 cron 表达式",
    );
    return;
  }

  if (tasks.has(task.name)) {
    logger.warn({ name: task.name }, "定时任务已存在，跳过注册");
    return;
  }

  const job = CronJob.from({
    cronTime: task.cronExpression,
    timeZone: task.timeZone ?? DEFAULT_TASK_TIME_ZONE,
    onTick: () => {
      // 高频路径（每分钟任务即每分钟一次），起止日志统一用 debug，正常执行不刷 info
      logger.debug({ name: task.name }, "定时任务开始执行");
      const startedAt = Date.now();
      task
        .handler()
        .then(() => {
          logger.debug({ name: task.name, durationMs: Date.now() - startedAt }, "定时任务执行完成");
        })
        .catch((err) => {
          logger.error(
            { name: task.name, err, durationMs: Date.now() - startedAt },
            "定时任务执行失败",
          );
        });
    },
    start: true,
    runOnInit: task.runOnInit ?? false,
    name: task.name,
  });

  tasks.set(task.name, job);

  if (task.runOnInit) {
    logger.info({ name: task.name }, "定时任务注册完成，立即执行一次");
  } else {
    logger.info({ name: task.name, cron: task.cronExpression }, "定时任务注册完成");
  }
}

export function stopTask(name: string): void {
  const job = tasks.get(name);
  if (job) {
    // cron v4 stop() 可能返回 Promise，忽略异步
    const result = job.stop();
    if (result && typeof result.then === "function") {
      result.catch((err) => {
        logger.warn({ name, error: (err as Error).message }, "定时任务停止失败");
      });
    }
    tasks.delete(name);
    logger.info({ name }, "定时任务已停止");
  }
}

export function stopAllTasks(): void {
  for (const [name, job] of tasks) {
    const result = job.stop();
    if (result && typeof result.then === "function") {
      result.catch((err) => {
        logger.warn({ name, error: (err as Error).message }, "定时任务停止失败");
      });
    }
    logger.info({ name }, "定时任务已停止");
  }
  tasks.clear();
}

/**
 * 获取已注册的任务名称列表
 */
export function getTaskNames(): string[] {
  return Array.from(tasks.keys());
}
