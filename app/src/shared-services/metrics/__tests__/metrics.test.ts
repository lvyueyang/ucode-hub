/**
 * 指标注册表模块测试：计数器、直方图、Prometheus 渲染
 */
import { describe, expect, it, vi } from "vitest";
import { Counter, Histogram } from "#/shared-services/metrics";

describe("Counter", () => {
  it("无标签时自增并渲染 counter 格式", () => {
    const c = new Counter("test_total", "测试计数器");
    c.inc();
    c.inc();
    const out = c.render();
    expect(out).toContain("# TYPE test_total counter");
    expect(out).toContain("test_total 2");
  });

  it("按标签维度分别计数", () => {
    const c = new Counter("req_total", "请求数", ["method"]);
    c.inc({ method: "GET" });
    c.inc({ method: "GET" });
    c.inc({ method: "POST" });
    const out = c.render();
    expect(out).toContain('req_total{method="GET"} 2');
    expect(out).toContain('req_total{method="POST"} 1');
  });

  it("标签值包含引号时转义", () => {
    const c = new Counter("x", "x", ["k"]);
    c.inc({ k: 'a"b' });
    expect(c.render()).toContain('x{k="a\\"b"} 1');
  });

  it("value 读取指定标签维度当前值，缺省返回 0", () => {
    const c = new Counter("req_total", "请求数", ["method"]);
    c.inc({ method: "GET" }, 2);
    expect(c.value({ method: "GET" })).toBe(2);
    expect(c.value({ method: "POST" })).toBe(0);
  });

  it("total 汇总所有标签维度", () => {
    const c = new Counter("req_total", "请求数", ["method"]);
    c.inc({ method: "GET" }, 2);
    c.inc({ method: "POST" }, 3);
    expect(c.total()).toBe(5);
  });
});

describe("Histogram", () => {
  it("观测值落入对应分桶并输出 sum/count", () => {
    const h = new Histogram("dur_seconds", "耗时", [0.1, 0.5, 1]);
    h.observe(0.05);
    h.observe(0.3);
    h.observe(2);
    const out = h.render();
    expect(out).toContain("# TYPE dur_seconds histogram");
    expect(out).toContain('dur_seconds_bucket{le="0.1"} 1');
    expect(out).toContain('dur_seconds_bucket{le="0.5"} 2');
    expect(out).toContain('dur_seconds_bucket{le="1"} 2');
    expect(out).toContain('dur_seconds_bucket{le="+Inf"} 3');
    expect(out).toContain("dur_seconds_sum 2.35");
    expect(out).toContain("dur_seconds_count 3");
  });

  it("无观测值时输出基线 sum/count", () => {
    const h = new Histogram("empty", "空", [0.5]);
    const out = h.render();
    expect(out).toContain("empty_sum 0");
    expect(out).toContain("empty_count 0");
  });
});

describe("全局注册表", () => {
  it("跨模块图共享同一注册表（Nitro 入口与 SSR 实例不分裂）", async () => {
    // resetModules 模拟 Nitro 入口与 SSR 渲染器分别加载 metrics.ts 的场景
    vi.resetModules();
    const first = await import("#/shared-services/metrics");
    first.httpRequestsTotal.inc({ method: "GET" });

    vi.resetModules();
    const second = await import("#/shared-services/metrics");
    expect(second.httpRequestsTotal.render()).toContain('http_requests_total{method="GET"} 1');
  });
});
