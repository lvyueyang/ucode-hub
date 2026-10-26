/**
 * 国际化种子数据：初始化预设语言（zh + en）的 UI 翻译
 * 基于 (locale, key) 唯一约束做 upsert，仅写入缺失的条目，
 * 后续新增种子数据可增量写入，已有条目不受影响
 */
import { db } from "#/db/index";
import { uiTranslation } from "#/db/schema";
import { logger } from "#/shared-services/logger";

/**
 * 写入缺失的预置 UI 翻译（基于 (locale, key) 唯一约束 upsert，已有条目不受影响）
 * 启动时调用；新增种子文案后重启即可增量补齐
 */
export async function ensurePresetTranslations(): Promise<void> {
  const now = new Date();
  const rows: (typeof uiTranslation.$inferInsert)[] = [];

  for (const row of SEED_DATA) {
    rows.push({ ...row, createdAt: now, updatedAt: now });
  }

  // 基于 (locale, key) 唯一约束，冲突时跳过，仅插入不存在的条目
  await db.insert(uiTranslation).values(rows).onConflictDoNothing();
  logger.info({ count: rows.length }, "UI 翻译种子数据写入完成");
}

interface SeedRow {
  locale: string;
  key: string;
  value: string;
  valueType?: string;
}

const SEED_EN: SeedRow[] = [
  // common
  { locale: "en", key: "返回首页", value: "Back to Home" },
  { locale: "en", key: "暂无数据", value: "No Data" },
  {
    locale: "en",
    key: "加载失败，请稍后重试",
    value: "Failed to load, please try again later",
  },

  // header
  { locale: "en", key: "首页", value: "Home" },
  { locale: "en", key: "我的设备", value: "My Devices" },
  { locale: "en", key: "关于", value: "About" },
  { locale: "en", key: "切换语言", value: "Switch Language" },

  // home
  { locale: "en", key: "UCode 中继服务", value: "UCode Relay Service" },
  {
    locale: "en",
    key: "登录后可远程访问本机 UCode；后续承载模型端点与内置资产下发。",
    value:
      "Sign in to reach your local UCode remotely; model endpoints and built-in asset delivery will follow on the relay.",
  },
  { locale: "en", key: "远程访问", value: "Remote Access" },
  {
    locale: "en",
    key: "UCode 主动出站建立隧道，公网请求经中继回灌到本机服务，不必对外暴露端口。",
    value:
      "UCode opens an outbound tunnel and the relay feeds public requests back to the local service, so no local port has to be exposed.",
  },
  {
    locale: "en",
    key: "登记本机 UCode 实例，随时查看在线状态，按需改名或吊销令牌。",
    value:
      "Register your local UCode instances, check their online status anytime, and rename or revoke their tokens.",
  },
  { locale: "en", key: "模型端点与资产下发", value: "Model Endpoints & Asset Delivery" },
  {
    locale: "en",
    key: "由中继统一承载：模型调用集中转发与记账，技能与提示词命令统一发布，凭据不下发到设备。",
    value:
      "Served by the relay: model calls are forwarded and metered centrally, skills and prompt commands are published in one place, and credentials stay off the devices.",
  },
  { locale: "en", key: "后台", value: "Admin Panel" },

  // auth
  { locale: "en", key: "用户登录", value: "User Login" },
  { locale: "en", key: "用户注册", value: "User Registration" },
  { locale: "en", key: "用户名", value: "Username" },
  { locale: "en", key: "密码", value: "Password" },
  { locale: "en", key: "邮箱", value: "Email" },
  { locale: "en", key: "邮箱验证码", value: "Email Verification Code" },
  { locale: "en", key: "登录", value: "Login" },
  { locale: "en", key: "登录中", value: "Logging in..." },
  { locale: "en", key: "登录失败", value: "Login failed" },
  { locale: "en", key: "登录成功", value: "Login successful" },
  { locale: "en", key: "忘记密码？", value: "Forgot password?" },
  { locale: "en", key: "注册", value: "Register" },
  { locale: "en", key: "注册中", value: "Registering..." },
  { locale: "en", key: "注册失败", value: "Registration failed" },
  { locale: "en", key: "注册成功", value: "Registration successful" },
  { locale: "en", key: "还没有账号？", value: "Don't have an account?" },
  { locale: "en", key: "立即注册", value: "Register Now" },
  { locale: "en", key: "已有账号？", value: "Already have an account?" },
  { locale: "en", key: "立即登录", value: "Login Now" },

  // validation
  { locale: "en", key: "请输入用户名", value: "Please enter username" },
  { locale: "en", key: "请输入密码", value: "Please enter password" },
  { locale: "en", key: "请输入邮箱", value: "Please enter email" },
  { locale: "en", key: "邮箱格式不正确", value: "Invalid email format" },
  {
    locale: "en",
    key: "密码至少 6 位",
    value: "Password must be at least 6 characters",
  },
  {
    locale: "en",
    key: "请输入验证码",
    value: "Please enter verification code",
  },
  {
    locale: "en",
    key: "验证码为 6 位",
    value: "Verification code is 6 digits",
  },

  // about
  { locale: "en", key: "关于 UCode 中继", value: "About the UCode Relay" },
  {
    locale: "en",
    key: "这里是 UCode 的中继服务：登录后即可远程访问本机 UCode，用它统一管理账号与设备，并由它承载模型端点与内置资产下发。",
    value:
      "This is the UCode relay service: sign in to reach your local UCode remotely, use it to manage accounts and devices in one place, and let it carry model endpoints and built-in asset delivery.",
  },
  { locale: "en", key: "中继做什么", value: "What the Relay Does" },
  {
    locale: "en",
    key: "远程访问：UCode 主动出站建立隧道，公网请求经中继回灌到本机服务，不必对外暴露端口。",
    value:
      "Remote access: UCode opens an outbound tunnel and the relay feeds public requests back to the local service, so no local port has to be exposed.",
  },
  {
    locale: "en",
    key: "账号与设备：后台管理账号与角色权限，登记本机 UCode 实例、查看在线状态并吊销令牌。",
    value:
      "Accounts and devices: manage accounts and role permissions in the admin panel, register local UCode instances, check their online status, and revoke their tokens.",
  },
  {
    locale: "en",
    key: "模型端点与资产下发：模型调用集中转发与记账，技能与提示词命令统一发布，凭据不下发到设备。",
    value:
      "Model endpoints and asset delivery: model calls are forwarded and metered centrally, skills and prompt commands are published in one place, and credentials stay off the devices.",
  },
  { locale: "en", key: "数据放在哪", value: "Where the Data Lives" },
  {
    locale: "en",
    key: "中继是自建服务，每企业一套：账号、设备与用量数据都存在部署方自有的 PostgreSQL 里，不经过第三方。",
    value:
      "The relay is self-hosted, one deployment per organization: accounts, devices, and usage data live in the operator's own PostgreSQL and never pass through a third party.",
  },
  {
    locale: "en",
    key: "上传文件与运行日志同样落在部署方本机的存储目录，数据不出企业边界。",
    value:
      "Uploaded files and runtime logs also stay in the operator's local storage directory, so data never leaves the organization.",
  },

  // header / 用户区
  { locale: "en", key: "消息中心", value: "Messages" },
  { locale: "en", key: "退出登录", value: "Log out" },

  // forgot password
  { locale: "en", key: "忘记密码", value: "Forgot Password" },
  { locale: "en", key: "返回登录", value: "Back to Login" },
  { locale: "en", key: "新密码", value: "New Password" },
  { locale: "en", key: "请输入新密码", value: "Please enter new password" },
  { locale: "en", key: "确认新密码", value: "Confirm New Password" },
  { locale: "en", key: "请确认新密码", value: "Please confirm new password" },
  { locale: "en", key: "重置中", value: "Resetting..." },
  { locale: "en", key: "重置密码", value: "Reset Password" },
  { locale: "en", key: "重置失败", value: "Reset failed" },

  // 我的设备
  { locale: "en", key: "共 {{total}} 台设备", value: "{{total}} devices" },
  { locale: "en", key: "暂无设备", value: "No devices yet" },
  { locale: "en", key: "设备名", value: "Device Name" },
  { locale: "en", key: "平台", value: "Platform" },
  { locale: "en", key: "版本", value: "Version" },
  { locale: "en", key: "在线", value: "Online" },
  { locale: "en", key: "离线", value: "Offline" },
  { locale: "en", key: "已吊销", value: "Revoked" },
  { locale: "en", key: "最近活跃", value: "Last Active" },
  { locale: "en", key: "创建时间", value: "Created At" },
  { locale: "en", key: "改名", value: "Rename" },
  { locale: "en", key: "保存", value: "Save" },
  { locale: "en", key: "取消", value: "Cancel" },
  { locale: "en", key: "吊销", value: "Revoke" },
  { locale: "en", key: "确认吊销", value: "Confirm Revoke" },
  {
    locale: "en",
    key: "吊销后该设备立即断开且令牌失效，需重新登记才能再次连接。",
    value:
      "The device disconnects immediately and its token becomes invalid; register it again to reconnect.",
  },
  { locale: "en", key: "设备已改名", value: "Device renamed" },
  { locale: "en", key: "设备已吊销", value: "Device revoked" },
  { locale: "en", key: "打开", value: "Open" },
  {
    locale: "en",
    key: "经中继打开设备上的 UCode",
    value: "Open the UCode on this device through the relay",
  },

  // 我的用量
  { locale: "en", key: "我的用量", value: "My Usage" },
  {
    locale: "en",
    key: "本人经中继发起的模型调用量与 token 消耗",
    value: "Model calls you made through the relay, and the tokens they consumed",
  },
  { locale: "en", key: "今天", value: "Today" },
  { locale: "en", key: "近 7 天", value: "Last 7 Days" },
  { locale: "en", key: "近 30 天", value: "Last 30 Days" },
  { locale: "en", key: "请求数", value: "Requests" },
  { locale: "en", key: "失败数", value: "Failed Requests" },
  { locale: "en", key: "输入 Token", value: "Prompt Tokens" },
  { locale: "en", key: "输出 Token", value: "Completion Tokens" },
  { locale: "en", key: "合计 Token", value: "Total Tokens" },
  { locale: "en", key: "平均耗时", value: "Avg. Latency" },
  { locale: "en", key: "失败率 {{rate}}%", value: "Failure rate {{rate}}%" },
  { locale: "en", key: "加载中…", value: "Loading…" },
  { locale: "en", key: "加载用量失败", value: "Failed to load usage" },
  { locale: "en", key: "该时间段内暂无用量", value: "No usage in this period" },

  // messages
  { locale: "en", key: "全部已读", value: "Mark All Read" },
  { locale: "en", key: "全部", value: "All" },
  { locale: "en", key: "未读", value: "Unread" },
  { locale: "en", key: "已读", value: "Read" },
  { locale: "en", key: "删除", value: "Delete" },
  { locale: "en", key: "已删除", value: "Deleted" },
  { locale: "en", key: "暂无消息", value: "No messages" },
  { locale: "en", key: "上一页", value: "Previous" },
  { locale: "en", key: "下一页", value: "Next" },
  { locale: "en", key: "加载消息失败", value: "Failed to load messages" },
  { locale: "en", key: "操作失败", value: "Operation failed" },
  { locale: "en", key: "删除失败", value: "Delete failed" },
  { locale: "en", key: "已全部标记为已读", value: "All marked as read" },
];

/** 预置翻译种子数据（当前仅英文；中文即 key 本身，无需种子行） */
export const SEED_DATA: SeedRow[] = [...SEED_EN];
