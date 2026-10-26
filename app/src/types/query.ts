/**
 * 通用查询工具类型：分页参数、排序参数、分页查询结果
 */
/** 排序方向 */
export type SortOrder = "ascend" | "descend";

/** 通用分页查询参数 */
export interface PaginatedParams {
  page?: number;
  pageSize?: number;
}

/** 分页 + 排序组合查询参数 */
export interface PaginatedSortParams extends PaginatedParams {
  sortField?: string;
  sortOrder?: SortOrder;
}

/** 标准分页查询结果 */
export interface PaginatedResult<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}
