/**
 * 进程内指标注册表：计数器 + 直方图，输出 Prometheus text 格式
 * 无第三方依赖；注册表挂载于 globalThis，保证 Nitro 入口与 SSR 各 bundle 共享同一实例
 * （入口与 SSR 渲染器分别打包 metrics.ts，模块级单例会分裂，导致入口埋点不可见）
 * 注意：进程内存储，多实例部署时各实例各自计数，指标需在实例层聚合
 */

/** 指标标签（key = 标签名，value = 标签值） */
type Labels = Record<string, string>;

/** 序列化标签为 Prometheus 标签串，如 {method="GET",result="success"} */
function formatLabels(labels: Labels = {}): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const body = entries
    .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
  return `{${body}}`;
}

/**
 * 计数器：仅增不减，支持按标签维度分别计数
 */
export class Counter {
  private values = new Map<string, number>();

  constructor(
    private readonly name: string,
    private readonly help: string,
    private readonly labelNames: string[] = [],
  ) {}

  /** 指定标签维度自增（标签缺失按空字符串处理） */
  inc(labels: Labels = {}, by = 1): void {
    const key = this.serialize(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  /** 读取指定标签维度的当前值（从未记录时返回 0），供进程内采样计算区间增量 */
  value(labels: Labels = {}): number {
    return this.values.get(this.serialize(labels)) ?? 0;
  }

  /** 所有标签维度当前值之和 */
  total(): number {
    let sum = 0;
    for (const value of this.values.values()) sum += value;
    return sum;
  }

  private serialize(labels: Labels): string {
    const ordered = this.labelNames.map((n) => labels[n] ?? "").join("\u0000");
    return ordered;
  }

  private deserialize(key: string): Labels {
    const parts = key.split("\u0000");
    return Object.fromEntries(this.labelNames.map((n, i) => [n, parts[i] ?? ""]));
  }

  /** 输出 Prometheus 文本 */
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) {
      lines.push(`${this.name}${formatLabels(this.deserialize(key))} ${value}`);
    }
    return lines.join("\n");
  }
}

/**
 * 直方图：记录观测值，输出 sum / count / 分桶计数
 */
export class Histogram {
  private buckets = new Map<string, number>();
  private sums = new Map<string, number>();
  private counts = new Map<string, number>();

  constructor(
    private readonly name: string,
    private readonly help: string,
    private readonly bucketUpperBounds: number[],
    private readonly labelNames: string[] = [],
  ) {}

  /** 记录一次观测值 */
  observe(value: number, labels: Labels = {}): void {
    const key = this.serialize(labels);
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    for (const bound of this.bucketUpperBounds) {
      if (value <= bound) {
        const bucketKey = `${key}\u0001${bound}`;
        this.buckets.set(bucketKey, (this.buckets.get(bucketKey) ?? 0) + 1);
      }
    }
  }

  private serialize(labels: Labels): string {
    return this.labelNames.map((n) => labels[n] ?? "").join("\u0000");
  }

  private deserialize(key: string): Labels {
    const parts = key.split("\u0000");
    return Object.fromEntries(this.labelNames.map((n, i) => [n, parts[i] ?? ""]));
  }

  /** 输出 Prometheus 文本 */
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    const seen = new Set<string>();
    for (const key of this.counts.keys()) {
      const labels = this.deserialize(key);
      for (const bound of this.bucketUpperBounds) {
        const bucketLabels = { ...labels, le: String(bound) };
        // observe 阶段已按「value <= bound」写入累计计数，此处直接输出
        lines.push(
          `${this.name}_bucket${formatLabels(bucketLabels)} ${this.buckets.get(`${key}\u0001${bound}`) ?? 0}`,
        );
      }
      lines.push(
        `${this.name}_bucket${formatLabels({ ...labels, le: "+Inf" })} ${this.counts.get(key) ?? 0}`,
      );
      lines.push(`${this.name}_sum${formatLabels(labels)} ${this.sums.get(key) ?? 0}`);
      lines.push(`${this.name}_count${formatLabels(labels)} ${this.counts.get(key) ?? 0}`);
      seen.add(key);
    }
    // 兜底：从未观测到值时仍输出 sum/count 基线
    if (seen.size === 0) {
      lines.push(`${this.name}_sum 0`, `${this.name}_count 0`);
    }
    return lines.join("\n");
  }
}

/** 全局注册表键：跨 bundle（Nitro 入口 / SSR 渲染器）共享同一注册表 */
const REGISTRY_KEY = "__APP_METRICS_REGISTRY__";

/** 指标注册表：预置指标实例 */
interface MetricsRegistry {
  httpRequestsTotal: Counter;
  serverFunctionRequestsTotal: Counter;
  serverFunctionDurationSeconds: Histogram;
  /** 外部系统调用计数（system + outcome） */
  externalCallsTotal: Counter;
  /** 外部系统调用耗时（秒）直方图（system） */
  externalCallDurationSeconds: Histogram;
}

/** 惰性获取全局指标注册表（首次加载时创建，之后跨 bundle 复用） */
function getRegistry(): MetricsRegistry {
  const global = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: MetricsRegistry;
  };
  const registry = global[REGISTRY_KEY] ?? {
    httpRequestsTotal: new Counter("http_requests_total", "HTTP 请求总数", ["method"]),
    serverFunctionRequestsTotal: new Counter(
      "server_function_requests_total",
      "Server Function 请求总数",
      ["result"],
    ),
    serverFunctionDurationSeconds: new Histogram(
      "server_function_duration_seconds",
      "Server Function 执行耗时分布",
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    ),
    externalCallsTotal: new Counter("external_calls_total", "外部系统调用总数", [
      "system",
      "outcome",
    ]),
    externalCallDurationSeconds: new Histogram(
      "external_call_duration_seconds",
      "外部系统调用耗时分布",
      [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
      ["system"],
    ),
  };
  global[REGISTRY_KEY] = registry;
  return registry;
}

/** HTTP 请求总数（按方法分标签） */
export const httpRequestsTotal = getRegistry().httpRequestsTotal;

/** Server Function 请求总数（按结果分标签） */
export const serverFunctionRequestsTotal = getRegistry().serverFunctionRequestsTotal;

/** Server Function 执行耗时（秒）直方图 */
export const serverFunctionDurationSeconds = getRegistry().serverFunctionDurationSeconds;

/** 外部系统调用总数（system + outcome） */
export const externalCallsTotal = getRegistry().externalCallsTotal;

/** 外部系统调用耗时（秒）直方图（system） */
export const externalCallDurationSeconds = getRegistry().externalCallDurationSeconds;

/** 汇总所有指标为 Prometheus text 格式 */
export function renderMetrics(): string {
  return [
    httpRequestsTotal.render(),
    serverFunctionRequestsTotal.render(),
    serverFunctionDurationSeconds.render(),
    externalCallsTotal.render(),
    externalCallDurationSeconds.render(),
  ].join("\n");
}
