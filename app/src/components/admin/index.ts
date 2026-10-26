/**
 * 管理端组件统一出口：壳/布局 + 表单控件 + 状态 store
 */

export { AdminAuthProvider, useAdminAuth } from "./AdminAuthProvider";
export { AdminFilterItem, AdminFilters } from "./AdminFilters";
export {
  AdminFormDrawer,
  FORM_DRAWER_WIDTH,
} from "./AdminFormDrawer";
export { AdminFormModal, FORM_MODAL_WIDTH } from "./AdminFormModal";
export { AdminLayout } from "./AdminLayout";
export { AdminListPage } from "./AdminListPage";
export { AdminLogo } from "./AdminLogo";
export { AdminNav } from "./AdminNav";
export { AdminPageContent } from "./AdminPageContent";
export { AdminProvider } from "./AdminProvider";
export {
  AdminSplitPanel,
  AdminSplitPanelItem,
  SPLIT_PANEL_WIDTH,
} from "./AdminSplitPanel";
export { AdminThemeContext, useAdminTheme } from "./admin-theme";
export * from "./analytics";
export * from "./forms";
export { NAV_GROUPS } from "./nav-config";
export * from "./stores";
export { splitPanelBudget, TABLE_BUDGET } from "./table-budget";
