/**
 * 埋点元数据模块：元事件/元属性缓存加载、CRUD 管理与预置数据初始化
 */
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "#/db/index";
import { trackEventMeta, trackPropertyMeta } from "#/db/schema";
import { trackEventMetaCache, trackPropertyMetaCache } from "#/services/track/track.cache";
import type {
  TrackEventMetaInput,
  TrackEventMetaRecord,
  TrackPropertyMetaInput,
  TrackPropertyMetaRecord,
} from "./track.types";

let trackMetaCacheLoaded = false;

/** 懒加载元数据缓存 */
async function ensureTrackMetaCache(): Promise<void> {
  if (trackMetaCacheLoaded) return;

  const [eventRows, propertyRows] = await Promise.all([
    db.select({ name: trackEventMeta.name }).from(trackEventMeta),
    db
      .select({
        key: trackPropertyMeta.key,
        dataType: trackPropertyMeta.dataType,
      })
      .from(trackPropertyMeta),
  ]);

  trackEventMetaCache.clear();
  trackPropertyMetaCache.clear();

  for (const row of eventRows) {
    trackEventMetaCache.set(row.name, true);
  }
  for (const row of propertyRows) {
    trackPropertyMetaCache.set(row.key, row.dataType);
  }

  trackMetaCacheLoaded = true;
}

/** 使元数据缓存失效，下次访问重新加载 */
function invalidateTrackMetaCache(): void {
  trackMetaCacheLoaded = false;
}

/** 元事件名是否已注册（缓存未就绪时返回 false，由调用方先经 loadTrackMetaCache 兜底） */
export function isTrackEventNameRegistered(name: string): boolean {
  return trackEventMetaCache.has(name);
}

export function isTrackPropertyKeyRegistered(key: string): boolean {
  return trackPropertyMetaCache.has(key);
}

/** 读取元属性的数据类型；未注册返回 undefined */
export function getTrackPropertyDataType(key: string): string | undefined {
  return trackPropertyMetaCache.get(key);
}

/** 元数据缓存是否已加载（供 trackEvent 启动阶段兜底判断） */
export function isTrackMetaCacheLoaded(): boolean {
  return trackMetaCacheLoaded;
}

/** 测试专用：重置元数据缓存加载状态与内容，隔离用例间缓存状态 */
export function resetTrackMetaCacheForTest(): void {
  trackMetaCacheLoaded = false;
  trackEventMetaCache.clear();
  trackPropertyMetaCache.clear();
}

/** 导出缓存加载函数供启动流程预加载 */
export async function loadTrackMetaCache(): Promise<void> {
  await ensureTrackMetaCache();
}

export async function getTrackEventMetaList(): Promise<TrackEventMetaRecord[]> {
  return db.select().from(trackEventMeta).orderBy(trackEventMeta.category, trackEventMeta.name);
}

export async function getTrackEventMeta(name: string): Promise<TrackEventMetaRecord | null> {
  const rows = await db.select().from(trackEventMeta).where(eq(trackEventMeta.name, name)).limit(1);
  return rows[0] ?? null;
}

export async function createTrackEventMeta(
  name: string,
  input: TrackEventMetaInput,
): Promise<TrackEventMetaRecord> {
  const [row] = await db
    .insert(trackEventMeta)
    .values({
      name,
      label: input.label,
      category: input.category,
      description: input.description ?? null,
    })
    .returning();
  invalidateTrackMetaCache();
  return row;
}

export async function updateTrackEventMeta(
  name: string,
  input: Partial<TrackEventMetaInput>,
): Promise<TrackEventMetaRecord | null> {
  const existing = await getTrackEventMeta(name);
  if (!existing) return null;

  const [row] = await db
    .update(trackEventMeta)
    .set({
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(trackEventMeta.name, name))
    .returning();
  invalidateTrackMetaCache();
  return row ?? null;
}

/** 删除元事件（预置事件不可删除） */
export async function deleteTrackEventMeta(name: string): Promise<boolean> {
  const existing = await getTrackEventMeta(name);
  if (!existing || existing.isPreset) return false;

  await db.delete(trackEventMeta).where(eq(trackEventMeta.name, name));
  invalidateTrackMetaCache();
  return true;
}

export async function getTrackPropertyMetaList(): Promise<TrackPropertyMetaRecord[]> {
  return db.select().from(trackPropertyMeta).orderBy(trackPropertyMeta.key);
}

export async function getTrackPropertyMeta(key: string): Promise<TrackPropertyMetaRecord | null> {
  const rows = await db
    .select()
    .from(trackPropertyMeta)
    .where(eq(trackPropertyMeta.key, key))
    .limit(1);
  return rows[0] ?? null;
}

export async function createTrackPropertyMeta(
  key: string,
  input: TrackPropertyMetaInput,
): Promise<TrackPropertyMetaRecord> {
  const [row] = await db
    .insert(trackPropertyMeta)
    .values({
      key,
      label: input.label,
      dataType: input.dataType ?? "string",
      description: input.description ?? null,
    })
    .returning();
  invalidateTrackMetaCache();
  return row;
}

export async function updateTrackPropertyMeta(
  key: string,
  input: Partial<TrackPropertyMetaInput>,
): Promise<TrackPropertyMetaRecord | null> {
  const existing = await getTrackPropertyMeta(key);
  if (!existing) return null;

  const [row] = await db
    .update(trackPropertyMeta)
    .set({
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.dataType !== undefined ? { dataType: input.dataType } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(trackPropertyMeta.key, key))
    .returning();
  invalidateTrackMetaCache();
  return row ?? null;
}

/** 删除元属性（预置属性不可删除） */
export async function deleteTrackPropertyMeta(key: string): Promise<boolean> {
  const existing = await getTrackPropertyMeta(key);
  if (!existing || existing.isPreset) return false;

  await db.delete(trackPropertyMeta).where(eq(trackPropertyMeta.key, key));
  invalidateTrackMetaCache();
  return true;
}

/** 预置元事件定义 */
const PRESET_EVENTS: {
  name: string;
  label: string;
  category: string;
  description: string;
}[] = [
  {
    name: "PageView",
    label: "页面浏览",
    category: "页面交互",
    description: "用户访问页面时触发",
  },
  {
    name: "FormSubmit",
    label: "表单提交",
    category: "用户行为",
    description: "用户提交表单时触发",
  },
  {
    name: "Login",
    label: "用户登录",
    category: "用户行为",
    description: "用户登录成功时触发",
  },
  {
    name: "Register",
    label: "用户注册",
    category: "用户行为",
    description: "用户完成注册时触发",
  },
  {
    name: "Logout",
    label: "用户退出",
    category: "用户行为",
    description: "用户主动退出登录时触发",
  },
];

/** 预置元属性定义 */
const PRESET_PROPERTIES: {
  key: string;
  label: string;
  dataType: string;
  description: string;
}[] = [
  {
    key: "$ip",
    label: "IP 地址",
    dataType: "string",
    description: "客户端 IP 地址，由服务端提取",
  },
  {
    key: "$user_agent",
    label: "User Agent",
    dataType: "string",
    description: "浏览器 User Agent 字符串",
  },
  {
    key: "$browser",
    label: "浏览器",
    dataType: "string",
    description: "浏览器名称和版本",
  },
  {
    key: "$os",
    label: "操作系统",
    dataType: "string",
    description: "操作系统名称和版本",
  },
  {
    key: "$device_type",
    label: "设备类型",
    dataType: "string",
    description: "设备类型（Desktop / Mobile / Tablet）",
  },
  {
    key: "$screen_size",
    label: "屏幕分辨率",
    dataType: "string",
    description: "用户屏幕分辨率",
  },
  {
    key: "$language",
    label: "浏览器语言",
    dataType: "string",
    description: "浏览器首选语言（navigator.language）",
  },
  {
    key: "page_name",
    label: "页面名称",
    dataType: "string",
    description: "触发事件的页面名称",
  },
  {
    key: "url",
    label: "页面地址",
    dataType: "string",
    description: "触发事件的完整 URL",
  },
  {
    key: "referer",
    label: "来源地址",
    dataType: "string",
    description: "来源页面的 URL",
  },
  {
    key: "form_name",
    label: "表单名称",
    dataType: "string",
    description: "被提交的表单名称（如 clientLogin、clientRegister）",
  },
];

/** 初始化预置元事件（首次启动时插入缺失项，并清理已被裁剪出预置清单的预置事件，完成后刷新缓存） */
export async function ensurePresetEvents(): Promise<void> {
  for (const pe of PRESET_EVENTS) {
    const existing = await getTrackEventMeta(pe.name);
    if (!existing) {
      await db.insert(trackEventMeta).values({
        name: pe.name,
        label: pe.label,
        category: pe.category,
        description: pe.description,
        isPreset: true,
      });
    }
  }
  const presetNames = PRESET_EVENTS.map((e) => e.name);
  await db
    .delete(trackEventMeta)
    .where(and(eq(trackEventMeta.isPreset, true), notInArray(trackEventMeta.name, presetNames)));
  invalidateTrackMetaCache();
}

/** 初始化预置元属性（首次启动时插入缺失项，并清理已被裁剪出预置清单的预置属性，完成后刷新缓存） */
export async function ensurePresetProperties(): Promise<void> {
  for (const pp of PRESET_PROPERTIES) {
    const existing = await getTrackPropertyMeta(pp.key);
    if (!existing) {
      await db.insert(trackPropertyMeta).values({
        key: pp.key,
        label: pp.label,
        dataType: pp.dataType,
        description: pp.description,
        isPreset: true,
      });
    }
  }
  const presetKeys = PRESET_PROPERTIES.map((p) => p.key);
  await db
    .delete(trackPropertyMeta)
    .where(
      and(eq(trackPropertyMeta.isPreset, true), notInArray(trackPropertyMeta.key, presetKeys)),
    );
  invalidateTrackMetaCache();
}
