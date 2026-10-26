/**
 * 定时任务注册：在服务启动时调用
 */

import { pruneIdleDevices, takeLastSeenUpdates } from "#/services/device/device.online";
import { saveLastSeen } from "#/services/device/device.server";
import { cleanExpiredFiles } from "#/services/file/file.server";
import { cleanExpiredLogs } from "#/services/logs/logs-cleanup.server";
import {
  cleanupSystemMetrics,
  sampleSystemMetric,
} from "#/services/system-metric/system-metric.server";
import { logger } from "#/shared-services/logger";
import { registerTask } from "#/shared-services/scheduler";

/** 系统监控采样保留天数 */
const SYSTEM_METRIC_RETENTION_DAYS = 7;

/** 设备在线态注册表里「早以离线」的条目保留时长（超过即丢弃，仅影响内存/落库，不影响设备记录） */
const DEVICE_ONLINE_IDLE_MS = 10 * 60 * 1000;

export function registerAllTasks(): void {
  // 每分钟采集一次系统运行指标（启动即采一条，保证监控页有初始数据）
  registerTask({
    name: "系统监控指标采样",
    cronExpression: "* * * * *",
    runOnInit: true,
    handler: async () => {
      await sampleSystemMetric();
    },
  });

  // 每分钟把设备最近活跃时间落库，并把早以离线的条目从内存注册表里清掉
  registerTask({
    name: "设备在线态巡检",
    cronExpression: "* * * * *",
    handler: async () => {
      const updated = await saveLastSeen(takeLastSeenUpdates());
      const dropped = pruneIdleDevices(DEVICE_ONLINE_IDLE_MS);
      if (updated > 0 || dropped.length > 0) {
        logger.debug({ updated, dropped: dropped.length }, "设备在线态巡检完成");
      }
    },
  });

  // 每小时清理过期临时文件
  registerTask({
    name: "清理过期临时文件",
    cronExpression: "0 * * * *",
    handler: async () => {
      const count = await cleanExpiredFiles();
      if (count > 0) {
        logger.info({ count }, "已清理过期临时文件");
      }
    },
  });

  // 每天凌晨 3 点清理 30 天前的日志文件
  registerTask({
    name: "清理过期日志文件",
    cronExpression: "0 3 * * *",
    handler: async () => {
      const count = await cleanExpiredLogs();
      if (count > 0) {
        logger.info({ count }, "已清理过期日志文件");
      }
    },
  });

  // 每天凌晨 4 点清理超过保留期的系统监控数据
  registerTask({
    name: "清理过期系统监控数据",
    cronExpression: "0 4 * * *",
    handler: async () => {
      const count = cleanupSystemMetrics(SYSTEM_METRIC_RETENTION_DAYS);
      if (count > 0) {
        logger.info({ count }, "已清理过期系统监控数据");
      }
    },
  });
}
