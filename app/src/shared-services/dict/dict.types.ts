/**
 * 字典模块共享类型
 */

/** 字典导入数据结构 */
export interface DictImportData {
  dicts: { name: string; slug: string; description?: string | null }[];
  dictItems: {
    dictSlug: string;
    label: string;
    value: string;
    sortOrder?: number;
    status?: string;
    extraType?: string | null;
    extra?: string | null;
    color?: string | null;
  }[];
}

export interface DictImportResult {
  dictsCreated: number;
  dictsUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
}
