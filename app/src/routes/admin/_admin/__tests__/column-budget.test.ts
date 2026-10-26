/**
 * 列宽预算守门：可导入的列工厂必须满足
 * 「每列定宽（弹性列除外）+ 恰好一列弹性 + 合计不超该表预算」
 *
 * 新增列表页时把列工厂登记到 CASES，规则即随 CI 覆盖；页面内联的列定义
 * 由 ProTable 的开发期告警兜底（见 table-budget）。
 */
import { applyColumnBudget } from "@ucode/hub-ui-spa/table";
import { describe, expect, it } from "vitest";
import { splitPanelBudget, TABLE_BUDGET } from "#/components/admin/table-budget";
import { adminRoleColumns } from "#/routes/admin/_admin/admin-roles/-mods/adminRoleColumns";
import { clientRoleColumns } from "#/routes/admin/_admin/client-roles/-mods/clientRoleColumns";
import { configColumns } from "#/routes/admin/_admin/config/-mods/configColumns";
import { deviceColumns } from "#/routes/admin/_admin/devices/-mods/deviceColumns";
import { dictItemColumns } from "#/routes/admin/_admin/dicts/-mods/dictColumns";
import { fileExplorerColumns } from "#/routes/admin/_admin/file-explorer/-mods/fileExplorerColumns";
import { createFilesColumns } from "#/routes/admin/_admin/files/-mods/filesColumns";
import { messageInboxColumns } from "#/routes/admin/_admin/messages/-mods/messageInboxColumns";
import { messageManageColumns } from "#/routes/admin/_admin/messages/-mods/messageManageColumns";
import { usageColumns } from "#/routes/admin/_admin/usage/-mods/usageColumns";
import { adminUserColumns } from "#/routes/admin/_admin/users/admins/-mods/adminUserColumns";
import { clientUserColumns } from "#/routes/admin/_admin/users/clients/-mods/clientUserColumns";

/**
 * 列工厂选项桩：任意层级属性都返回新的可调用桩
 * 工厂只读取选项拼装列定义、不执行回调，故桩只需「可无痛读任意属性」即可
 */
function stubOptions<T>(): T {
  const stub = () => undefined;
  return new Proxy(stub, {
    get: () => stubOptions(),
    apply: () => undefined,
  }) as T;
}

/** 待守门的列工厂：budget 为该表在参考视口下的可用宽度 */
const CASES: {
  name: string;
  budget: number;
  create: () => unknown;
}[] = [
  {
    name: "管理员管理",
    budget: TABLE_BUDGET.full,
    create: () => adminUserColumns(stubOptions()),
  },
  {
    name: "客户端用户",
    budget: TABLE_BUDGET.full,
    create: () => clientUserColumns(stubOptions()),
  },
  {
    name: "设备管理",
    budget: TABLE_BUDGET.full,
    create: () => deviceColumns(stubOptions()),
  },
  {
    name: "用量统计",
    budget: TABLE_BUDGET.full,
    create: () => usageColumns(stubOptions()),
  },
  {
    name: "管理端角色",
    budget: TABLE_BUDGET.full,
    create: () => adminRoleColumns(stubOptions()),
  },
  {
    name: "客户端角色",
    budget: TABLE_BUDGET.full,
    create: () => clientRoleColumns(stubOptions()),
  },
  {
    name: "消息管理",
    budget: TABLE_BUDGET.full,
    create: () => messageManageColumns(stubOptions()),
  },
  {
    name: "消息收件箱",
    budget: TABLE_BUDGET.full,
    create: () => messageInboxColumns(stubOptions(), stubOptions()),
  },
  {
    name: "文件管理",
    budget: TABLE_BUDGET.full,
    create: () => createFilesColumns(stubOptions(), stubOptions()),
  },
  {
    name: "资源管理器",
    budget: TABLE_BUDGET.full,
    create: () => fileExplorerColumns(stubOptions()),
  },
  {
    name: "系统配置",
    // 双栏右栏：全宽 − 左栏 180 − 栏间距
    budget: splitPanelBudget(180),
    create: () => configColumns(stubOptions()),
  },
  {
    name: "字典条目",
    // 双栏右栏：全宽 − 左栏 200 − 栏间距
    budget: splitPanelBudget(200),
    create: () => dictItemColumns(stubOptions()),
  },
];

describe("管理端列表页列宽预算", () => {
  it.each(CASES)("$name：每列定宽、弹性列唯一、合计不超预算", ({ budget, create }) => {
    const { columns, scrollX, warnings } = applyColumnBudget(create() as never, { budget });

    expect(warnings).toEqual([]);
    expect(scrollX).toBeGreaterThan(0);
    expect(scrollX).toBeLessThanOrEqual(budget);
    expect(columns.length).toBeGreaterThan(0);
  });
});
