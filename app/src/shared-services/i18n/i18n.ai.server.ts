/**
 * 国际化 AI 翻译编排层（shared-services）：纯逻辑，不触碰具体业务主表
 * - 单字段翻译（translateWithAi，非流式，供抽屉单字段「AI 翻译」按钮）
 * - 批量翻译（buildBatchTasks 组批 + runBatchTasks 逐批流式）：按 mode(fill/correct) 计算任务集，
 *   按 batchSize 把多实体打包成一个 JSON 一次调用，流式过程中转发 text-delta 并累积，批末落库/回填
 * 依赖：lib / 本层（i18n.content 批量写回）/ shared-services 的 config、ai；不依赖 services/**
 */

import { completeText, streamAiChat } from "#/shared-services/ai/ai.server";
import { getConfig } from "#/shared-services/config/config.server";
import type { AiBatchTranslateMode } from "./i18n.ai.schemas";
import type {
  AiBatchEntity,
  AiBatchError,
  AiBatchGroup,
  AiFailedItem,
  AiTranslatableField,
  AiTranslationResult,
  BatchTranslateSummary,
  ExistingTranslationMap,
} from "./i18n.ai.types";
import { upsertContentTranslations } from "./i18n.content.server";
import type { Locale } from "./i18n.types";
import { DEFAULT_LOCALE, getLocaleLabel, SUPPORTED_LOCALES } from "./i18n.types";

export type {
  AiBatchEntity,
  AiBatchError,
  AiBatchGroup,
  AiFailedItem,
  AiTranslatableField,
  AiTranslationResult,
  BatchTranslateSummary,
  ExistingTranslationMap,
};

/** SSE 事件推送回调（由 SSE 路由封装为 enqueue） */
export type BatchTranslateEmit = (event: Record<string, unknown>) => void | Promise<void>;

/**
 * 从模型返回文本中提取 JSON 对象：
 * 剥离 ```json 围栏、取首对花括号、JSON.parse；失败抛错。
 */
export function extractJsonFromText(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 返回内容不是合法的 JSON 对象");
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("AI 返回内容不是 JSON 对象");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      err instanceof Error ? `AI 返回 JSON 解析失败: ${err.message}` : "AI 返回 JSON 解析失败",
    );
  }
}

/** 单文本提示词安全替换（函数 replacer 规避 $& $' $` 注入） */
export function buildTranslationPrompt(opts: {
  template: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
}): string {
  return opts.template
    .replace(/\{sourceLang\}/g, () => opts.sourceLang)
    .replace(/\{targetLang\}/g, () => opts.targetLang)
    .replace(/\{sourceText\}/g, () => opts.sourceText);
}

/** 批量 JSON 提示词安全替换（entitiesJson 以函数 replacer 注入，规避 $ 特殊字符） */
export function buildBatchPrompt(opts: {
  template: string;
  sourceLang: string;
  targetLang: string;
  entities: AiBatchGroup["entities"];
}): string {
  const entitiesJson = JSON.stringify(
    Object.fromEntries(opts.entities.map((e) => [e.entityId, e.source])),
  );
  return opts.template
    .replace(/\{sourceLang\}/g, () => opts.sourceLang)
    .replace(/\{targetLang\}/g, () => opts.targetLang)
    .replace(/\{entitiesJson\}/g, () => entitiesJson);
}

/** 判断某实体某语言某字段是否已有翻译（existing 映射命中） */
export function hasExisting(
  existing: ExistingTranslationMap,
  entityId: string,
  locale: Locale,
  fieldName: string,
): boolean {
  return existing[entityId]?.[locale]?.includes(fieldName) ?? false;
}

/** 批量翻译默认目标语言（去掉默认语言） */
export function getDefaultTargetLocales(): Locale[] {
  return (SUPPORTED_LOCALES as readonly Locale[]).filter((l) => l !== DEFAULT_LOCALE);
}

/** 解析目标语言：入参缺省则取全部非默认语言；入参含默认语言视为无效，回退默认目标语言 */
export function resolveTargetLocales(targetLocales?: Locale[]): Locale[] {
  if (!targetLocales || targetLocales.length === 0) {
    return getDefaultTargetLocales();
  }
  const valid = targetLocales.filter((l) => l !== DEFAULT_LOCALE);
  return valid.length > 0 ? valid : getDefaultTargetLocales();
}

/**
 * 单字段 AI 翻译：读取 ai_translation_prompt，安全拼装后非流式生成。
 * 提示词未配置直接报错；AI 客户端未配置给出引导；其余失败记录日志后转友好提示。
 */
export async function translateWithAi(opts: {
  sourceText: string;
  sourceLocale: Locale;
  targetLocale: Locale;
}): Promise<string> {
  const template = await getConfig("ai_translation_prompt");
  if (!template) {
    throw new Error("AI 翻译提示词未配置，请在系统配置中设置 ai_translation_prompt");
  }
  const prompt = buildTranslationPrompt({
    template,
    sourceLang: getLocaleLabel(opts.sourceLocale),
    targetLang: getLocaleLabel(opts.targetLocale),
    sourceText: opts.sourceText,
  });
  try {
    return await completeText({
      messages: [{ role: "user", content: prompt }],
      modelOptions: { temperature: 0.3 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("未配置")) {
      throw new Error("AI 客户端未配置，请先在系统配置中配置 AI 厂商");
    }
    // 调用失败已由 completeText 的 logExternalRequest 记录（warn + 指标），此处只转译为用户可读文案
    throw new Error("AI 翻译服务调用失败，请稍后重试");
  }
}

/**
 * 按 mode 计算每个实体每个目标语言需要翻译的字段，并按 batchSize 打包成批次。
 * - fill：仅无翻译记录的字段进入任务集
 * - correct：仅已有翻译记录的字段进入任务集
 * - 无源值或无需要翻译字段的实体被跳过
 */
export function buildBatchTasks(
  records: AiBatchEntity[],
  fields: AiTranslatableField[],
  targetLocales: Locale[],
  mode: AiBatchTranslateMode,
  batchSize: number,
  existing: ExistingTranslationMap,
): AiBatchGroup[] {
  const size = Math.max(1, batchSize);
  const batches: AiBatchGroup[] = [];

  for (const locale of targetLocales) {
    for (let i = 0; i < records.length; i += size) {
      const chunk = records.slice(i, i + size);
      const entities = chunk
        .map((rec) => {
          const needed = fields.filter((f) => {
            const src = rec.values[f.name];
            if (typeof src !== "string" || !src.trim()) return false;
            return mode === "fill"
              ? !hasExisting(existing, rec.id, locale, f.name)
              : hasExisting(existing, rec.id, locale, f.name);
          });
          const source: Record<string, string> = {};
          for (const f of needed) source[f.name] = rec.values[f.name];
          return { entityId: rec.id, fields: needed, source };
        })
        .filter((e) => e.fields.length > 0);
      if (entities.length === 0) continue;
      batches.push({
        batchIndex: 0,
        total: 0,
        targetLocale: locale,
        entities,
      });
    }
  }

  batches.forEach((b, idx) => {
    b.batchIndex = idx;
    b.total = batches.length;
  });
  return batches;
}

/**
 * 逐批流式执行批量翻译。
 * 每批：读取 ai_translation_batch_prompt → streamAiChat 流式生成（逐 chunk 转发 text-delta 并累积）
 *       → extractJsonFromText 解析 JSON → writeBack 时落库 → 推进度事件。
 * 整批失败（AI 报错/JSON 解析失败）记入 errors 并发 failed 事件，继续后续批次。
 * 返回汇总（created/updated/failed/translations/errors）。
 */
export async function runBatchTasks(
  batches: AiBatchGroup[],
  options: {
    entityType: string;
    writeBack: boolean;
    existing: ExistingTranslationMap;
    emit: BatchTranslateEmit;
  },
): Promise<BatchTranslateSummary> {
  const errors: AiBatchError[] = [];
  const failed: AiFailedItem[] = [];
  const translations: AiTranslationResult[] = [];
  let created = 0;
  let updated = 0;

  for (const batch of batches) {
    await options.emit({
      type: "batch-start",
      batchIndex: batch.batchIndex,
      total: batch.total,
      entityCount: batch.entities.length,
    });

    try {
      const template = await getConfig("ai_translation_batch_prompt");
      if (!template) {
        throw new Error("AI 批量翻译提示词未配置，请在系统配置中设置 ai_translation_batch_prompt");
      }
      const prompt = buildBatchPrompt({
        template,
        sourceLang: getLocaleLabel(DEFAULT_LOCALE),
        targetLang: getLocaleLabel(batch.targetLocale),
        entities: batch.entities,
      });

      let raw = "";
      const stream = await streamAiChat({
        messages: [{ role: "user", content: prompt }],
        modelOptions: { temperature: 0.2 },
      });
      for await (const chunk of stream) {
        if (chunk.type === "TEXT_MESSAGE_CONTENT") {
          raw += chunk.delta;
          await options.emit({
            type: "text-delta",
            batchIndex: batch.batchIndex,
            delta: chunk.delta,
          });
        }
      }

      if (!raw.trim()) throw new Error("AI 返回内容为空");
      const parsed = extractJsonFromText(raw);

      const batchTranslations: AiTranslationResult[] = [];
      for (const ent of batch.entities) {
        const entObj = parsed[ent.entityId];
        if (!entObj || typeof entObj !== "object" || Array.isArray(entObj)) {
          for (const f of ent.fields) {
            failed.push({
              entityId: ent.entityId,
              fieldName: f.name,
              locale: batch.targetLocale,
              reason: "AI 未返回该实体",
            });
          }
          continue;
        }
        for (const f of ent.fields) {
          const val = (entObj as Record<string, unknown>)[f.name];
          if (typeof val === "string" && val.trim()) {
            batchTranslations.push({
              entityType: options.entityType,
              entityId: ent.entityId,
              fieldName: f.name,
              locale: batch.targetLocale,
              value: val,
              valueType: f.valueType,
            });
          } else {
            failed.push({
              entityId: ent.entityId,
              fieldName: f.name,
              locale: batch.targetLocale,
              reason: "字段翻译缺失或为空",
            });
          }
        }
      }

      if (options.writeBack && batchTranslations.length > 0) {
        await upsertContentTranslations(batchTranslations);
      }
      for (const t of batchTranslations) {
        if (hasExisting(options.existing, t.entityId, t.locale, t.fieldName)) {
          updated++;
        } else {
          created++;
        }
      }
      translations.push(...batchTranslations);

      await options.emit({
        type: "batch-done",
        batchIndex: batch.batchIndex,
        total: batch.total,
        created,
        updated,
        failedCount: failed.length,
        failed,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({ batchIndex: batch.batchIndex, reason });
      await options.emit({
        type: "failed",
        batchIndex: batch.batchIndex,
        total: batch.total,
        reason,
      });
    }
  }

  const summary: BatchTranslateSummary = {
    created,
    updated,
    failedCount: failed.length,
    translations,
    failed,
    errors,
  };
  await options.emit({ type: "done", summary });
  return summary;
}

/**
 * 构建批量翻译的 SSE 流式 Response。
 * 给定源记录/字段/已有翻译，内部组批并逐批流式执行；handler 返回该 Response 时，
 * TanStack Start 会置 `x-tss-raw: true`，客户端经 SFn 调用直接拿到原始 Response 读取流。
 */
export function createBatchTranslateResponse(opts: {
  entityType: string;
  mode: AiBatchTranslateMode;
  fields: AiTranslatableField[];
  records: AiBatchEntity[];
  targetLocales: Locale[];
  batchSize: number;
  writeBack: boolean;
  existing: ExistingTranslationMap;
}): Response {
  const batches = buildBatchTasks(
    opts.records,
    opts.fields,
    opts.targetLocales,
    opts.mode,
    opts.batchSize,
    opts.existing,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: BatchTranslateEmit = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await runBatchTasks(batches, {
          entityType: opts.entityType,
          writeBack: opts.writeBack,
          existing: opts.existing,
          emit,
        });
      } catch (err) {
        try {
          emit({
            type: "error",
            reason: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // 客户端已断开，忽略
        }
      } finally {
        try {
          controller.close();
        } catch {
          // 响应流已关闭/出错，忽略
        }
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
