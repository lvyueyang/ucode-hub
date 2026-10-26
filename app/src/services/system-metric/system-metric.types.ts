/**
 * 系统监控模块共享类型与常量（无运行期服务依赖，服务端与前端均可引用）
 */

/** 历史查询可选时间范围 */
export const SYSTEM_METRIC_RANGES = ["1h", "24h", "7d"] as const;

/** 历史查询时间范围 */
export type SystemMetricRange = (typeof SYSTEM_METRIC_RANGES)[number];

/** 单次采样记录（NDJSON 每行结构） */
export interface SystemMetricSample {
  /** 采样时刻（ISO 8601） */
  time: string;
  /** 进程 CPU 使用率（百分比，区间增量） */
  cpuPercent: number;
  /** 常驻内存（字节） */
  rss: number;
  /** 已用堆内存（字节） */
  heapUsed: number;
  /** 堆内存总量（字节） */
  heapTotal: number;
  /** 外部内存（字节，Buffer / C++ 对象等） */
  external: number;
  /** 事件循环延迟区间均值（毫秒） */
  eventLoopLag: number;
  /** 事件循环延迟区间峰值（毫秒） */
  eventLoopLagMax: number;
  /** 进程运行时长（秒） */
  uptime: number;
  /** 活跃资源数（句柄 + 请求） */
  activeResources: number;
  /** 区间 HTTP 请求数 */
  httpRequests: number;
  /** 区间 Server Function 调用数 */
  sfRequests: number;
  /** 区间 Server Function 错误数 */
  sfErrors: number;
  /** 数据库是否可用 */
  dbUp: boolean;
  /** 数据库探测耗时（毫秒），不可用时为 null */
  dbLatencyMs: number | null;
  /** 存储目录是否可用 */
  storageUp: boolean;
  /** 数据库总大小（字节），查询失败时为 null */
  dbTotalBytes: number | null;
}

/** 实时运行快照（抓取时现读，不读历史文件） */
export interface SystemOverview {
  /** 实时采集时刻（ISO 8601） */
  time: string;
  /** 进程 CPU 使用率（百分比，自上次轮询） */
  cpuPercent: number;
  /** 进程内存明细（字节） */
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  /** 事件循环延迟当前均值（毫秒） */
  eventLoopLag: number;
  /** 事件循环延迟当前峰值（毫秒） */
  eventLoopLagMax: number;
  /** 进程运行时长（秒） */
  uptime: number;
  /** 活跃资源数 */
  activeResources: number;
  /** 累计 HTTP 请求数（进程启动至今） */
  httpRequestsTotal: number;
  /** 累计 Server Function 调用数 */
  sfRequestsTotal: number;
  /** 累计 Server Function 错误数 */
  sfErrorsTotal: number;
  /** 最近一次落盘采样（含依赖健康等慢指标），尚未采样时为 null */
  lastSample: SystemMetricSample | null;
}

/** 历史趋势点：同一时间桶内聚合后的指标值 */
export interface SystemMetricHistoryPoint {
  /** 时间桶标签（东八区格式化） */
  date: string;
  /** 指标键 */
  metric: SystemMetricHistoryMetric;
  /** 聚合值（字节/百分比类为均值，计数类为求和） */
  value: number;
}

/** 可绘制历史趋势的指标键 */
export const HISTORY_METRICS = [
  "rss",
  "heapUsed",
  "cpuPercent",
  "eventLoopLag",
  "dbTotalBytes",
  "httpRequests",
] as const;

/** 历史趋势指标键 */
export type SystemMetricHistoryMetric = (typeof HISTORY_METRICS)[number];

/** 历史趋势聚合结果 */
export interface SystemMetricHistory {
  points: SystemMetricHistoryPoint[];
  /** 时间桶粒度（毫秒） */
  bucketMs: number;
  /** 是否因扫描行数上限而截断 */
  truncated: boolean;
}

/** 存储目录占用明细项 */
export interface StorageUsageEntry {
  /** 顶层条目名称（目录或文件） */
  name: string;
  /** 占用字节数 */
  bytes: number;
}

/** 存储目录占用统计 */
export interface StorageUsage {
  /** STORAGE_DIR 总占用（字节） */
  totalBytes: number;
  /** 各顶层条目占用（按字节降序） */
  entries: StorageUsageEntry[];
  /** 已统计文件数 */
  fileCount: number;
  /** 是否因文件数上限而截断 */
  truncated: boolean;
  /** 所在文件系统容量（字节） */
  filesystem: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
  };
  /** 统计时刻（ISO 8601） */
  capturedAt: string;
}

/** 单表占用明细 */
export interface TableSizeEntry {
  /** 表名 */
  tableName: string;
  /** 表数据占用（字节，不含索引） */
  tableBytes: number;
  /** 索引占用（字节） */
  indexBytes: number;
  /** 表 + 索引合计（字节） */
  totalBytes: number;
}

/** 数据库占用快照 */
export interface DatabaseSizes {
  /** 数据库总大小（字节） */
  databaseBytes: number;
  /** 各表占用（按合计降序） */
  tables: TableSizeEntry[];
  /** 统计时刻（ISO 8601） */
  capturedAt: string;
}
