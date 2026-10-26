/**
 * 设备在线态：哪些设备正连着隧道。
 *
 * 在线态是**进程内**事实（隧道连接就活在本进程里），不落库；`last_seen_at` 只在库里留证据，
 * 由巡检任务定期把内存里的最近活跃时间写下去。挂 `globalThis` 是因为 dev / HMR / 产物分包下
 * 同一模块可能被求值多次，注册表必须是同一份。
 */
export type OnlineDeviceEntry = {
  deviceId: string;
  /** 该设备当前的隧道连接标识（同设备多连接都算在线） */
  connections: Set<string>;
  lastSeenAt: Date;
  /** 最后一次写库的时间；巡检据此只写增量 */
  flushedAt: Date | null;
};

const REGISTRY_KEY = "__hubDeviceOnlineRegistry";

const globalWithRegistry = globalThis as typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, OnlineDeviceEntry>;
};

const registry: Map<string, OnlineDeviceEntry> =
  globalWithRegistry[REGISTRY_KEY] ?? new Map<string, OnlineDeviceEntry>();
globalWithRegistry[REGISTRY_KEY] = registry;

/** 设备上线：登记一条连接并刷新最近活跃时间 */
export const markDeviceOnline = (deviceId: string, connectionId: string): void => {
  const now = new Date();
  const existing = registry.get(deviceId);
  if (existing) {
    existing.connections.add(connectionId);
    existing.lastSeenAt = now;
    return;
  }
  registry.set(deviceId, {
    deviceId,
    connections: new Set([connectionId]),
    lastSeenAt: now,
    flushedAt: null,
  });
};

/** 设备下线：移除该连接；连接清零后条目保留到巡检清理，好让最近活跃时间还能写下去 */
export const markDeviceOffline = (deviceId: string, connectionId: string): void => {
  registry.get(deviceId)?.connections.delete(connectionId);
};

/** 该设备当前是否在线（有任一连接即在线） */
export const isDeviceOnline = (deviceId: string): boolean =>
  (registry.get(deviceId)?.connections.size ?? 0) > 0;

export const onlineDeviceIds = (): string[] =>
  [...registry.values()]
    .filter((entry) => entry.connections.size > 0)
    .map((entry) => entry.deviceId);

/** 该设备当前的隧道连接数（0 表示离线；运维与调试用） */
export const connectionCountOf = (deviceId: string): number =>
  registry.get(deviceId)?.connections.size ?? 0;

/** 一次连接的活跃心跳：只刷新时间，不改连接集合 */
export const touchDeviceActivity = (deviceId: string, at: Date = new Date()): void => {
  const entry = registry.get(deviceId);
  if (entry) entry.lastSeenAt = at;
};

/**
 * 巡检取数：返回「最近活跃时间比上次写库新」的设备，并把写库时间推进到本次。
 * 调用方拿到结果后落库；不落库也不会重复取到同一份时间。
 */
export const takeLastSeenUpdates = (): Map<string, Date> => {
  const updates = new Map<string, Date>();
  for (const entry of registry.values()) {
    if (entry.flushedAt && entry.flushedAt >= entry.lastSeenAt) continue;
    updates.set(entry.deviceId, entry.lastSeenAt);
    entry.flushedAt = new Date();
  }
  return updates;
};

/** 巡检清理：丢弃「早已离线且活跃时间已落库」的条目，避免注册表无限增长 */
export const pruneIdleDevices = (maxIdleMs: number, now: Date = new Date()): string[] => {
  const dropped: string[] = [];
  for (const [deviceId, entry] of registry) {
    if (entry.connections.size > 0) continue;
    if (now.getTime() - entry.lastSeenAt.getTime() < maxIdleMs) continue;
    registry.delete(deviceId);
    dropped.push(deviceId);
  }
  return dropped;
};

/** 测试用：清空注册表 */
export const clearOnlineRegistry = (): void => {
  registry.clear();
};
