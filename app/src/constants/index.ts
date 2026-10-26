/**
 * 项目级常量：日志级别颜色、预置字典定义、编辑器类型等
 */

/** 日志级别对应 Tag 颜色 */
export const LEVEL_COLORS: Record<string, string> = {
  info: "blue",
  warn: "gold",
  error: "red",
  debug: "default",
  fatal: "red",
};

/** 日志级别选项 */
export const LEVEL_OPTIONS = [
  { label: "全部", value: "" },
  { label: "INFO", value: "info" },
  { label: "WARN", value: "warn" },
  { label: "ERROR", value: "error" },
  { label: "DEBUG", value: "debug" },
  { label: "FATAL", value: "fatal" },
];

/** 预置字典条目类型 */
export interface PresetDictItem {
  label: string;
  value: string;
  sortOrder: number;
  color?: string;
  extraType?: string;
  extra?: string;
}

/** 预置字典常量（slug 和条目 value 不可修改、不可删除） */
export const PRESET_DICTS: {
  slug: string;
  name: string;
  items: PresetDictItem[];
}[] = [
  {
    slug: "user_status",
    name: "用户状态",
    items: [
      { label: "正常", value: "active", sortOrder: 0, color: "green" },
      { label: "禁用", value: "disabled", sortOrder: 1, color: "red" },
    ],
  },
];

/** 业务预置字典定义：slug / 初始条目，由业务项目按需填充 */
export interface SeedDict {
  slug: string;
  name: string;
  description?: string;
  items: PresetDictItem[];
}

/**
 * 业务预置字典常量：仅首次部署时播种初始值，**结果字典不受保护**，
 * 运营可在「字典管理」中自由增删改条目（与 PRESET_DICTS 的只读保护语义相反）。
 *
 * 需要「有初始选项、但选项随业务演进」的枚举时用本常量，不要去改 PRESET_DICTS；
 * 模板默认为空数组，由业务项目按需填充：
 *
 * ```ts
 * export const SEED_DICTS: SeedDict[] = [
 *   {
 *     slug: "product_category",
 *     name: "产品分类",
 *     description: "产品分类选项",
 *     items: [{ label: "示例分类", value: "sample", sortOrder: 0 }],
 *   },
 * ];
 * ```
 */
export const SEED_DICTS: SeedDict[] = [];
