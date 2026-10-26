/** @vitest-environment jsdom */
/**
 * 管理端列表查询 hook 测试：条件变更 / 服务端回填 / 排序与翻页 / 过期响应丢弃
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginatedResult } from "#/types/query";
import { useListQuery } from "#/utils/use-list-query";

interface Row {
  id: string;
}

interface Filters {
  keyword?: string;
}

const initial: PaginatedResult<Row> = {
  records: [{ id: "loader" }],
  total: 1,
  page: 1,
  pageSize: 20,
};

/** 构造按请求参数回显的分页结果 */
function echoResult(params: { page: number; pageSize: number }): PaginatedResult<Row> {
  return {
    records: [{ id: `page-${params.page}` }],
    total: 30,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/** Table.onChange 第 4 个参数（测试中不参与断言，仅满足类型） */
const tableChangeExtra = {
  currentDataSource: [] as Row[],
  action: "paginate" as const,
};

function setup(
  fetcher?: (params: { page: number; pageSize: number }) => Promise<PaginatedResult<Row>>,
) {
  const fn = vi.fn(fetcher ?? (async (params) => echoResult(params)));
  const { result } = renderHook(() =>
    useListQuery<Row, Filters>({
      initial,
      fetcher: fn,
      initialFilters: {},
    }),
  );
  return { result, fetcher: fn };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useListQuery", () => {
  it("首屏直接用 loader 数据，不额外发起请求", () => {
    const { result, fetcher } = setup();
    expect(result.current.data).toEqual(initial);
    expect(result.current.pagination.current).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("applyFilters 合并条件并回到第 1 页", async () => {
    const { result, fetcher } = setup();
    await act(async () => {
      result.current.applyFilters({ keyword: "abc" });
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, filters: { keyword: "abc" } }),
    );
    expect(result.current.filters).toEqual({ keyword: "abc" });
  });

  it("服务端回填页码与每页条数", async () => {
    const { result } = setup(
      vi.fn(async () => ({
        records: [{ id: "x" }],
        total: 30,
        page: 3,
        pageSize: 50,
      })),
    );
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.pagination.current).toBe(3);
    expect(result.current.pagination.pageSize).toBe(50);
  });

  it("翻页使用目标页，页大小不变", async () => {
    const { result, fetcher } = setup();
    await act(async () => {
      result.current.onTableChange({ current: 2, pageSize: 20 }, {}, {}, tableChangeExtra);
    });

    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }));
  });

  it("排序变化后回到第 1 页并回填排序状态", async () => {
    const { result, fetcher } = setup();
    await act(async () => {
      result.current.onTableChange(
        { current: 2, pageSize: 20 },
        {},
        {
          field: "createdAt",
          order: "descend",
        } as never,
        tableChangeExtra,
      );
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        sortField: "createdAt",
        sortOrder: "descend",
      }),
    );
    expect(result.current.sortProps("createdAt")).toEqual({
      sorter: true,
      sortOrder: "descend",
    });
    // 非当前排序列不回填方向，保证重置筛选后指示器同步清空
    expect(result.current.sortProps("updatedAt")).toEqual({
      sorter: true,
      sortOrder: undefined,
    });
  });

  it("过期响应被丢弃，不覆盖后发请求的结果", async () => {
    const resolvers: Array<() => void> = [];
    let call = 0;
    const slowFetcher = (params: { page: number; pageSize: number }) => {
      const marker = `resp-${++call}`;
      return new Promise<PaginatedResult<Row>>((resolve) => {
        resolvers.push(() => resolve({ ...echoResult(params), records: [{ id: marker }] }));
      });
    };
    const { result } = setup(slowFetcher);

    act(() => {
      result.current.applyFilters({ keyword: "first" });
    });
    act(() => {
      result.current.applyFilters({ keyword: "second" });
    });

    // 先发的请求先返回：其结果必须被丢弃（去掉 requestId 守卫时这里会变成 resp-1）
    await act(async () => {
      resolvers[0]();
      await Promise.resolve();
    });
    expect(result.current.data.records[0].id).toBe("loader");

    await act(async () => {
      resolvers[1]();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.records[0].id).toBe("resp-2");
    expect(result.current.filters).toEqual({ keyword: "second" });
  });

  it("请求失败时结束 loading 且保留原数据", async () => {
    const { result } = setup(
      vi.fn(async () => {
        throw new Error("加载失败");
      }),
    );
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(initial);
  });
});
