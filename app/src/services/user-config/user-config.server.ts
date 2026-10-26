/**
 * 通用用户配置存取层：读写 user_config 表的 jsonb config
 * 只做通用存取，不感知业务语义；通知渠道等业务切片由上层服务消费
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "#/db/index";
import { type UserConfig, type UserNotifyChannels, userConfig } from "#/db/schema";
import type { UserRef, UserType } from "#/types/user";

/** 读取用户配置（无记录返回空对象） */
export async function getUserConfig(user: UserRef): Promise<UserConfig> {
  const [row] = await db
    .select()
    .from(userConfig)
    .where(
      and(
        eq(userConfig.userType, user.type),
        eq(userConfig.userId, user.id),
        isNull(userConfig.deletedAt),
      ),
    )
    .limit(1);
  return row?.config ?? {};
}

/** 写入（整体替换）用户配置：存在则更新，不存在则插入 */
export async function setUserConfig(user: UserRef, config: UserConfig): Promise<void> {
  const [existing] = await db
    .select({ id: userConfig.id })
    .from(userConfig)
    .where(
      and(
        eq(userConfig.userType, user.type),
        eq(userConfig.userId, user.id),
        isNull(userConfig.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userConfig)
      .set({ config, updatedAt: new Date() })
      .where(eq(userConfig.id, existing.id));
    return;
  }
  await db.insert(userConfig).values({
    userId: user.id,
    userType: user.type,
    config,
  });
}

/** 批量读取多用户的通知渠道配置（按类型分查，key = `${type}:${id}`） */
export async function getNotifyChannelsMap(
  users: UserRef[],
): Promise<Map<string, UserNotifyChannels>> {
  const map = new Map<string, UserNotifyChannels>();
  if (users.length === 0) return map;

  const idsByType = new Map<UserType, string[]>();
  for (const u of users) {
    const arr = idsByType.get(u.type) ?? [];
    arr.push(u.id);
    idsByType.set(u.type, arr);
  }

  for (const [type, ids] of idsByType) {
    const rows = await db
      .select({ userId: userConfig.userId, config: userConfig.config })
      .from(userConfig)
      .where(
        and(
          eq(userConfig.userType, type),
          inArray(userConfig.userId, ids),
          isNull(userConfig.deletedAt),
        ),
      );
    for (const row of rows) {
      map.set(`${type}:${row.userId}`, row.config.notify_channels ?? {});
    }
  }
  return map;
}
