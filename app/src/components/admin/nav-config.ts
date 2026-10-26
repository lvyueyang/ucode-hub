/**
 * 管理端侧边栏导航配置
 * 纯数据文件：icon 存组件引用（非 JSX 实例），渲染处负责实例化
 */

import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  HistoryOutlined,
  IdcardOutlined,
  LaptopOutlined,
  LineChartOutlined,
  MessageOutlined,
  MonitorOutlined,
  RobotOutlined,
  SettingOutlined,
  StockOutlined,
  TableOutlined,
  TeamOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import type { ComponentType } from "react";

/** 导航菜单项 */
interface NavItem {
  key: string;
  label: string;
  icon: ComponentType;
}

/** 导航分组 */
interface NavGroup {
  label: string;
  items: NavItem[];
  /** 首次访问时是否默认折叠（未写入折叠偏好前生效） */
  defaultCollapsed?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "概览",
    items: [{ key: "/admin", label: "仪表盘", icon: DashboardOutlined }],
  },
  {
    label: "用户与权限",
    items: [
      { key: "/admin/users/admins", label: "管理员", icon: IdcardOutlined },
      { key: "/admin/users/clients", label: "客户端用户", icon: TeamOutlined },
      {
        key: "/admin/admin-roles",
        label: "管理端角色",
        icon: AppstoreOutlined,
      },
      {
        key: "/admin/client-roles",
        label: "客户端角色",
        icon: AuditOutlined,
      },
      { key: "/admin/devices", label: "设备管理", icon: LaptopOutlined },
    ],
  },
  {
    label: "文件管理",
    items: [
      { key: "/admin/files", label: "文件管理", icon: FolderOpenOutlined },
      {
        key: "/admin/file-explorer",
        label: "资源管理器",
        icon: FileSearchOutlined,
      },
    ],
  },
  {
    label: "系统管理",
    items: [
      { key: "/admin/config", label: "系统配置", icon: SettingOutlined },
      {
        key: "/admin/ai-providers",
        label: "AI 厂商管理",
        icon: RobotOutlined,
      },
      { key: "/admin/usage", label: "用量统计", icon: BarChartOutlined },
      { key: "/admin/dicts", label: "字典管理", icon: BookOutlined },
      {
        key: "/admin/messages/manage",
        label: "消息管理",
        icon: MessageOutlined,
      },
      {
        key: "/admin/system/monitor",
        label: "系统监控",
        icon: MonitorOutlined,
      },
    ],
  },
  {
    label: "国际化",
    items: [
      { key: "/admin/translations/ui", label: "UI 翻译", icon: GlobalOutlined },
      {
        key: "/admin/translations/content",
        label: "实体翻译",
        icon: TranslationOutlined,
      },
    ],
  },
  {
    label: "日志审计",
    items: [
      {
        key: "/admin/operation-logs",
        label: "操作日志",
        icon: HistoryOutlined,
      },
      {
        key: "/admin/operation-logs/analytics",
        label: "操作日志分析",
        icon: LineChartOutlined,
      },
      { key: "/admin/logs", label: "运行日志", icon: FileTextOutlined },
      {
        key: "/admin/logs/analytics",
        label: "运行日志分析",
        icon: LineChartOutlined,
      },
    ],
  },
  {
    label: "埋点分析",
    items: [
      { key: "/admin/track/query", label: "事件查询", icon: BarChartOutlined },
      {
        key: "/admin/track/analytics",
        label: "事件分析",
        icon: LineChartOutlined,
      },
      { key: "/admin/track/event-meta", label: "元事件", icon: TableOutlined },
      {
        key: "/admin/track/property-meta",
        label: "元属性",
        icon: StockOutlined,
      },
    ],
  },
];
