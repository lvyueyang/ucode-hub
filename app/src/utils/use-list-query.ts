/**
 * 管理端列表页查询状态：条件 + 拉取 + 服务端回填 + 过期响应丢弃
 *
 * 设计取舍（与逐页手写查询状态相比的关键差异）：
 * - **全部显式触发**（筛选变更 / 翻页排序 / 增删改后刷新），不用 effect 自动拉取：
 *   首帧直接用路由 loader 数据，既不会重复请求，也不会出现「effect 与事件回调同时发请求」
 *   互相覆盖（这正是此前翻页「闪一下仍停在第一页」的根因）。
 * - **分页与排序统一由 Table.onChange 驱动**：antd 翻页时会回传当前 sorter，
 *   因此不需要再配置 pagination.onChange（两处并存必然重复请求）。
 * - **服务端回填**：page / pageSize 以服务端返回值落库（页大小可能被钳制），
 *   保证受控分页展示与真实查询一致。
 * - **过期响应丢弃**：连点翻页时只接受最后一次请求的结果，避免旧响应覆盖新页面。
 * - **列头筛选收口**：列头漏斗（状态 / 枚举等）经 `mapColumnFilters` 翻译成业务筛选条件，
 *   与页头筛选共用同一条请求路径，不额外写 onChange。
 */

import type { TablePaginationConfig, TableProps } from "antd";
import type { Key } from "react";
import { useRef, useState } from "react";
import type { PaginatedResult, SortOrder } from "#/types/query";
import { sfnUnwrap } from "#/utils/sfn-error";

/**
 * 列头筛选翻译器：键为列的 `key` / `dataIndex`，值为 antd 回传的选中项（未选为 null）
 * 返回空对象表示本次表格变更不涉及筛选
 */
export type ColumnFilterMapper<TFilters> = (
  columnFilters: Record<string, (Key | boolean)[] | null>,
) => Partial<TFilters>;

/** 列表查询参数（hook 内部状态） */
interface ListQuery<TFilters> {
  /** 业务筛选条件（不含分页与排序） */
  filters: TFilters;
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: SortOrder;
}

/** 查询执行器入参：页面把它拼进 SFn 的 data */
export interface ListQueryParams<TFilters> {
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: SortOrder;
  filters: TFilters;
}

export interface UseListQueryOptions<TRecord, TFilters> {
  /** 路由 loader 的首屏数据 */
  initial: PaginatedResult<TRecord>;
  /** 查询执行器（通常是一次 SFn 调用），返回标准分页结果 */
  fetcher: (params: ListQueryParams<TFilters>) => Promise<PaginatedResult<TRecord>>;
  /** 初始筛选条件（含「全部」等默认值） */
  initialFilters: TFilters;
  /** 每页条数默认值 */
  defaultPageSize?: number;
  /** 加载失败提示标题（具体错误文案由 SFn 错误出口归一化） */
  errorMessage?: string;
  /** 列头筛选翻译器（页面按需传，把列头漏斗接进同一条查询路径） */
  mapColumnFilters?: ColumnFilterMapper<TFilters>;
}

/** 表格列排序属性：`sorter` 开启 + 回填当前方向（受控，重置后指示器同步清空） */
export interface SortProps {
  sorter: true;
  sortOrder?: SortOrder;
}

export interface UseListQueryResult<TRecord, TFilters> {
  /** 当前页数据 */
  data: PaginatedResult<TRecord>;
  /** 当前筛选条件 */
  filters: TFilters;
  loading: boolean;
  /** 当前排序列（未排序为 undefined） */
  sortField?: string;
  /** 当前排序方向 */
  sortOrder?: SortOrder;
  /**
   * 生成某列的排序属性：`{ title: "创建时间", dataIndex: "createdAt", ...list.sortProps("createdAt") }`
   * 排序值即列 dataIndex，与服务层 `buildSortClause` 的字段白名单一一对应
   */
  sortProps: (field: string) => SortProps;
  /** 变更筛选条件（自动回到第 1 页） */
  applyFilters: (patch: Partial<TFilters>) => void;
  /** 按当前条件重新拉取（增删改 / 行内更新后调用） */
  reload: () => Promise<void>;
  /** 直接传给 ProTable 的 onChange（分页 + 排序统一入口） */
  onTableChange: NonNullable<TableProps<TRecord>["onChange"]>;
  /** 直接传给 ProTable 的 pagination（可 spread 后覆盖个别项） */
  pagination: TablePaginationConfig;
}

/** 分页器默认配置：全站统一每页条数选项与总量文案 */
export const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100];

export function useListQuery<TRecord, TFilters>({
  initial,
  fetcher,
  initialFilters,
  defaultPageSize = 20,
  errorMessage,
  mapColumnFilters,
}: UseListQueryOptions<TRecord, TFilters>): UseListQueryResult<TRecord, TFilters> {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<ListQuery<TFilters>>({
    filters: initialFilters,
    page: initial.page,
    pageSize: initial.pageSize || defaultPageSize,
    sortField: undefined,
    sortOrder: undefined,
  });
  /** 最新查询条件镜像：供 reload 在异步回调中读取当前条件（避免陈旧闭包） */
  const queryRef = useRef(query);
  queryRef.current = query;
  /** 请求序号：只接受最后一次请求的响应 */
  const requestIdRef = useRef(0);

  const run = async (next: ListQuery<TFilters>) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const [result] = await sfnUnwrap(
      fetcher({
        page: next.page,
        pageSize: next.pageSize,
        sortField: next.sortField,
        sortOrder: next.sortOrder,
        filters: next.filters,
      }),
      { error: errorMessage },
    );
    // 过期响应直接丢弃，避免旧结果覆盖新页面
    if (requestId !== requestIdRef.current) return;
    setLoading(false);
    if (result === null) return;
    // 服务端回填：页大小可能被钳制、页码可能被收敛
    setQuery({ ...next, page: result.page, pageSize: result.pageSize });
    setData(result);
  };

  const applyFilters = (patch: Partial<TFilters>) => {
    const current = queryRef.current;
    void run({
      ...current,
      filters: { ...current.filters, ...patch },
      page: 1,
    });
  };

  const reload = () => run(queryRef.current);

  const onTableChange: NonNullable<TableProps<TRecord>["onChange"]> = (
    tablePagination,
    columnFilters,
    sorter,
  ) => {
    const current = queryRef.current;
    // antd 分页时回传的 sorter 即当前排序状态（无排序时为空对象），两种形态都要兼容
    const single = (Array.isArray(sorter) ? sorter[0] : sorter) as
      | { field?: unknown; order?: string }
      | undefined;
    const sortField = typeof single?.field === "string" ? single.field : undefined;
    const sortOrder =
      single?.order === "ascend" || single?.order === "descend"
        ? (single.order as SortOrder)
        : undefined;
    const pageSize = tablePagination.pageSize ?? current.pageSize;
    const sortChanged = sortField !== current.sortField || sortOrder !== current.sortOrder;
    // 列头筛选与页头筛选共用一条路径：翻译成业务条件后同样回到第 1 页
    // 受控列筛选每次变更都会回传当前值，故只有「值真正变化」才算筛选变更（否则翻页会被重置回第 1 页）
    const filterPatch = mapColumnFilters?.(columnFilters ?? {}) ?? {};
    const filtersChanged = Object.entries(filterPatch).some(
      ([key, value]) => (current.filters as Record<string, unknown>)[key] !== value,
    );
    void run({
      ...current,
      filters: filtersChanged ? { ...current.filters, ...filterPatch } : current.filters,
      sortField,
      sortOrder,
      pageSize,
      // 筛选、排序或每页条数变化后原页码可能越界，回到第一页；纯翻页使用目标页
      page:
        filtersChanged || sortChanged || pageSize !== current.pageSize
          ? 1
          : (tablePagination.current ?? current.page),
    });
  };

  return {
    data,
    loading,
    filters: query.filters,
    sortField: query.sortField,
    sortOrder: query.sortOrder,
    sortProps: (field: string) => ({
      sorter: true,
      // 只有当前排序列回填方向：受控渲染，重置筛选后指示器一并清空
      sortOrder: query.sortField === field ? query.sortOrder : undefined,
    }),
    applyFilters,
    reload,
    onTableChange,
    pagination: {
      total: data.total,
      current: data.page,
      pageSize: data.pageSize,
      showSizeChanger: true,
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
      showTotal: (total) => `共 ${total} 条`,
    },
  };
}
