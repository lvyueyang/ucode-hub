/**
 * 系统配置管理：CRUD + 导入导出 + 内存缓存（领域实体唯一归属）
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/db/index";
import { contentTranslation, systemConfig } from "#/db/schema";
import { configCache, configTranslationCache } from "#/shared-services/config/config.cache";
import { DEFAULT_LOCALE, type Locale } from "#/shared-services/i18n/i18n.types";
import { logger } from "#/shared-services/logger";
import { PRESET_CONFIGS } from "./config.presets";
import type { configImportSchema } from "./config.schemas";
import { decryptConfigValue, encryptConfigValue } from "./config-secret.server";

export type ConfigRecord = typeof systemConfig.$inferSelect;

/** 重新加载系统配置全量列表到缓存（启动、增删改后调用，key 固定为 "all"） */
export async function loadConfigCache(): Promise<void> {
  const configs = await db
    .select({
      id: systemConfig.id,
      key: systemConfig.key,
      value: systemConfig.value,
      clientVisible: systemConfig.clientVisible,
      isSecret: systemConfig.isSecret,
    })
    .from(systemConfig)
    .where(isNull(systemConfig.deletedAt));
  configCache.set("all", configs);
  logger.info({ count: configs.length }, "系统配置缓存加载完成");
}

/** 读取配置值：敏感项解密后返回，非敏感项原样返回 */
function readConfigValue(row: { value: string; isSecret: boolean } | undefined): string {
  if (!row) return "";
  return row.isSecret && row.value ? decryptConfigValue(row.value) : row.value;
}

/**
 * 读取单个配置项的值
 * 缓存未就绪时回源加载；敏感项在此解密，读取失败按空串返回
 */
export async function getConfig(key: string): Promise<string> {
  let list = configCache.get("all");
  if (!list) {
    await loadConfigCache();
    list = configCache.get("all") ?? [];
  }
  return readConfigValue(list.find((c) => c.key === key));
}

/** 管理端配置列表：敏感项值脱敏为 ******（无值时空串），避免明文外发 */
export async function getConfigList() {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(isNull(systemConfig.deletedAt))
    .orderBy(asc(systemConfig.groupName), asc(systemConfig.key));
  return rows.map((row) => (row.isSecret ? { ...row, value: row.value ? "******" : "" } : row));
}

/** 新建系统配置项：key 唯一，敏感项的值加密后入库，成功后刷新缓存 */
export async function createConfig(params: {
  key: string;
  value: string;
  isSecret?: boolean;
  clientVisible?: boolean;
  valueType?: string;
  groupName?: string;
  description?: string;
}) {
  const [record] = await db
    .insert(systemConfig)
    .values({
      ...params,
      value: params.isSecret && params.value ? encryptConfigValue(params.value) : params.value,
    })
    .returning();
  await loadConfigCache();
  return record;
}

/**
 * 插入或更新系统配置（key 冲突时更新 value）
 * 用于初始化流程，避免因 ensurePresetConfigs 已插入默认值导致冲突
 */
export async function upsertConfig(
  key: string,
  value: string,
  description?: string,
  valueType?: string,
  groupName?: string,
  clientVisible?: boolean,
  isSecret?: boolean,
): Promise<void> {
  const [existing] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);

  if (existing) {
    // 敏感标记沿用已有行（除非显式传入），据此决定写入前是否加密
    const secret = isSecret ?? existing.isSecret;
    await db
      .update(systemConfig)
      .set({
        value: secret && value ? encryptConfigValue(value) : value,
        ...(isSecret !== undefined ? { isSecret } : {}),
        clientVisible: clientVisible ?? existing.clientVisible,
        valueType: valueType ?? existing.valueType,
        groupName: groupName ?? existing.groupName,
        description: description ?? existing.description,
        updatedAt: new Date(),
      })
      .where(eq(systemConfig.id, existing.id));
  } else {
    await db.insert(systemConfig).values({
      key,
      value: isSecret && value ? encryptConfigValue(value) : value,
      isSecret: isSecret ?? false,
      description,
      valueType,
      groupName,
      clientVisible,
    });
  }

  await loadConfigCache();
  logger.info({ key }, "系统配置已写入");
}

/**
 * 按 id 更新配置项（不存在的 id 返回 null）
 * value 缺省表示保持原值——管理端编辑敏感项留空即走此分支；敏感行新值加密入库（isSecret 创建后不可改）
 */
export async function updateConfig(
  id: string,
  params: {
    value?: string;
    clientVisible?: boolean;
    valueType?: string;
    groupName?: string;
    description?: string;
  },
) {
  // 先取敏感标记：敏感行的新值须加密后入库；isSecret 一经创建不可改
  const [existing] = await db
    .select({ isSecret: systemConfig.isSecret })
    .from(systemConfig)
    .where(eq(systemConfig.id, id))
    .limit(1);
  const { value, ...rest } = params;
  const [updated] = await db
    .update(systemConfig)
    .set({
      ...rest,
      ...(value !== undefined
        ? {
            value: existing?.isSecret ? encryptConfigValue(value) : value,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(systemConfig.id, id))
    .returning();
  if (updated) {
    await loadConfigCache();
  }
  return updated ?? null;
}

/** 按 id 软删除配置项（不存在返回 false），成功后刷新缓存 */
export async function deleteConfig(id: string) {
  const [existing] = await db.select().from(systemConfig).where(eq(systemConfig.id, id)).limit(1);
  if (!existing) return false;
  await db.update(systemConfig).set({ deletedAt: new Date() }).where(eq(systemConfig.id, id));
  await loadConfigCache();
  return true;
}

/** 运行时校验预置系统配置（幂等安全，恢复软删除的预设项，同步 valueType 变更） */
export async function ensurePresetConfigs(): Promise<void> {
  for (const preset of PRESET_CONFIGS) {
    const [existing] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, preset.key))
      .limit(1);
    if (existing?.deletedAt) {
      // 预置配置不允许删除，恢复软删除的记录
      await db
        .update(systemConfig)
        .set({
          value: preset.isSecret && preset.value ? encryptConfigValue(preset.value) : preset.value,
          isSecret: preset.isSecret ?? false,
          clientVisible: preset.clientVisible,
          valueType: preset.valueType,
          groupName: preset.groupName,
          description: preset.description,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.id, existing.id));
      logger.info({ key: preset.key }, "预置系统配置已恢复");
      continue;
    }
    if (!existing) {
      await db.insert(systemConfig).values({
        ...preset,
        value: preset.isSecret && preset.value ? encryptConfigValue(preset.value) : preset.value,
        isSecret: preset.isSecret ?? false,
      });
      logger.info({ key: preset.key }, "预置系统配置已创建");
      continue;
    }
    // 已存在：仅同步 valueType 变更（value / description / groupName / clientVisible 属用户可编辑项，不被覆盖）。
    // 预置项标记为敏感且当前值仍为空时同步 isSecret——空值无需加密，避免启动期强制依赖主密钥；
    // 已有明文值不自动转密文（保持 isSecret=false），否则读取时会走错解密切径。
    const valueTypeChanged = existing.valueType !== preset.valueType;
    const syncSecret = (preset.isSecret ?? false) && !existing.isSecret && !existing.value;
    if (valueTypeChanged || syncSecret) {
      await db
        .update(systemConfig)
        .set({
          ...(valueTypeChanged ? { valueType: preset.valueType } : {}),
          ...(syncSecret ? { isSecret: true } : {}),
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.id, existing.id));
      logger.info({ key: preset.key, valueTypeChanged, syncSecret }, "预置系统配置已同步");
    }
  }
  await loadConfigCache();
}

/** 客户端可见的配置行：先取缓存，缓存 miss 则查库并回填 */
export async function getVisibleConfigRows(): Promise<
  {
    id: string;
    key: string;
    value: string;
  }[]
> {
  let list = configCache.get("all");
  if (!list) {
    await loadConfigCache();
    list = configCache.get("all") ?? [];
  }
  // 敏感配置永不外发客户端
  return list.filter((c) => c.clientVisible && !c.isSecret);
}

/** 获取系统配置的 content_translation 翻译（按 locale 缓存） */
export async function getConfigTranslations(locale: Locale): Promise<Record<string, string>> {
  if (locale === DEFAULT_LOCALE) return {};

  const cached = configTranslationCache.get(locale);
  if (cached) return cached;

  const translations = await db
    .select()
    .from(contentTranslation)
    .where(
      and(
        eq(contentTranslation.entityType, "system_config"),
        eq(contentTranslation.locale, locale),
      ),
    );

  const result: Record<string, string> = {};
  for (const t of translations) result[t.entityId] = t.value;

  configTranslationCache.set(locale, result);
  logger.info({ locale, count: translations.length }, "系统配置翻译缓存已加载");
  return result;
}

/** 刷新系统配置翻译缓存（管理端编辑翻译后调用） */
export async function refreshConfigTranslationCache(locale?: Locale): Promise<void> {
  if (locale) {
    configTranslationCache.delete(locale);
    await getConfigTranslations(locale);
    logger.info({ locale }, "系统配置翻译缓存已刷新");
  } else {
    for (const key of configTranslationCache.keys()) {
      configTranslationCache.delete(key);
    }
    logger.info("全部系统配置翻译缓存已清理");
  }
}

/** 配置导入数据结构（schema 单一来源，z.infer 派生） */
export type ConfigImportData = z.infer<typeof configImportSchema>;

export interface ConfigImportResult {
  created: number;
  updated: number;
}

/** 导入配置数据（按 key upsert） */
export async function importConfigs(data: ConfigImportData): Promise<ConfigImportResult> {
  const result: ConfigImportResult = { created: 0, updated: 0 };

  for (const cfg of data.configs) {
    const [existing] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, cfg.key))
      .limit(1);

    if (existing) {
      if (existing.isSecret) {
        // 配置备份不携带敏感原文，导入时保留原密文，仅计数
        result.updated++;
        continue;
      }
      await db
        .update(systemConfig)
        .set({
          value: cfg.value,
          // 备份标记为敏感且目标行仍为空值时补上敏感标记（空值无需加密；已有明文值不自动转密文）
          ...(cfg.isSecret && !existing.isSecret && !existing.value ? { isSecret: true } : {}),
          clientVisible: cfg.clientVisible ?? existing.clientVisible,
          valueType: cfg.valueType ?? existing.valueType,
          groupName: cfg.groupName ?? existing.groupName,
          description: cfg.description ?? existing.description,
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.id, existing.id));
      result.updated++;
    } else {
      await db.insert(systemConfig).values({
        key: cfg.key,
        // 敏感行按标记加密（备份通常为空值；若携带明文则加密入库）
        value: cfg.isSecret && cfg.value ? encryptConfigValue(cfg.value) : cfg.value,
        isSecret: cfg.isSecret ?? false,
        clientVisible: cfg.clientVisible ?? false,
        valueType: cfg.valueType ?? "input",
        groupName: cfg.groupName ?? null,
        description: cfg.description ?? null,
      });
      result.created++;
    }
  }

  await loadConfigCache();
  return result;
}
