/** @vitest-environment jsdom */
/**
 * 分区块异步加载 hook 测试：成功 / 失败降级 / 重新请求
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSfnSection } from "#/utils/use-sfn-section";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useSfnSection", () => {
  it("挂载后拉取数据并结束 loading", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });
    const { result } = renderHook(() => useSfnSection(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 1 });
    expect(result.current.failed).toBe(false);
  });

  it("请求失败时降级为 failed 且不冒泡异常", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("无权限"));
    const { result } = renderHook(() => useSfnSection(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("同一 fetcher 引用不会重复请求", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");
    const { result, rerender } = renderHook(() => useSfnSection(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();
    rerender();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetcher 变更后在途的旧响应不覆盖新状态", async () => {
    const resolvers: Array<(value: string) => void> = [];
    const slowFetcher = () =>
      new Promise<string>((resolve) => {
        resolvers.push(resolve);
      });
    const fastFetcher = vi.fn().mockResolvedValue("new");

    const { result, rerender } = renderHook(
      ({ fetcher }: { fetcher: () => Promise<string> }) => useSfnSection(fetcher),
      { initialProps: { fetcher: slowFetcher } },
    );

    // 首个请求仍在途时切换 fetcher：旧响应返回后必须被丢弃
    rerender({ fetcher: fastFetcher });
    await waitFor(() => expect(result.current.data).toBe("new"));

    resolvers[0]("stale");
    await waitFor(() => expect(result.current.data).toBe("new"));
  });
});
