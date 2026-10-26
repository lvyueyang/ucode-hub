/**
 * 字段翻译抽屉组件：在实体表格中为字段提供国际化翻译编辑入口
 */
import { RobotOutlined, TranslationOutlined } from "@ant-design/icons";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Card, Drawer, Progress, Segmented, Tabs, Tooltip } from "antd";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import type { EditorType } from "#/constants/editor-types";
import {
  aiBatchTranslateSFn,
  aiTranslateFieldSFn,
  getFieldTranslationsSFn,
  saveContentTranslationSFn,
} from "#/shared-services/i18n/i18n.functions";
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  type Locale,
  SUPPORTED_LOCALES,
} from "#/shared-services/i18n/i18n.types";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { readSSEStream } from "#/utils/sse-client";
import { FORM_DRAWER_WIDTH } from "../AdminFormDrawer";
import { EditorTypes } from "./editor-type";

/** 可翻译字段定义 */
export interface TranslatableField {
  name: string;
  label: string;
  valueType: EditorType;
}

interface FieldTranslationDrawerProps {
  entityType: string;
  entityId: string;
  fields: TranslatableField[];
  activeField?: string;
  /** 各字段在原表中的当前值（默认语言展示用） */
  originalValues?: Record<string, string>;
}

/** 可管理（非默认）语言：批量翻译与「保存全部」的目标 */
const MANAGED_LOCALES = SUPPORTED_LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE);

/** 批量翻译模式 */
type BatchMode = "fill" | "correct";

export function FieldTranslationDrawer({
  entityType,
  entityId,
  fields,
  activeField,
  originalValues,
}: FieldTranslationDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(activeField ?? fields[0]?.name ?? "");
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [aiTranslating, setAiTranslating] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState<BatchMode>("fill");
  const [batchTranslating, setBatchTranslating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    done: number;
    failedCount: number;
  } | null>(null);
  const [streamText, setStreamText] = useState("");

  const loadTranslations = useCallback(
    async (fieldName: string) => {
      const [result] = await sfnUnwrap(
        getFieldTranslationsSFn({
          data: { entityType, entityId, fieldName },
        }),
        { error: "加载翻译失败" },
      );
      if (result === null) return;
      const vals: Record<string, string> = {};
      for (const l of Object.keys(result)) {
        vals[l] = result[l].value;
      }
      setTranslations((prev) => ({ ...prev, [fieldName]: vals }));
    },
    [entityType, entityId],
  );

  // 打开抽屉时加载当前字段的所有翻译
  useEffect(() => {
    if (!open) return;
    loadTranslations(activeTab);
  }, [open, activeTab, loadTranslations]);

  async function saveTranslation(fieldName: string, locale: Locale) {
    const value = translations[fieldName]?.[locale];
    if (!value) return;

    const field = fields.find((f) => f.name === fieldName);
    const key = `${fieldName}:${locale}`;
    setSaving(key);
    try {
      await callSfn(
        saveContentTranslationSFn({
          data: {
            entityType,
            entityId,
            fieldName,
            locale,
            value,
            valueType: field?.valueType ?? "text",
          },
        }),
        { error: "保存失败" },
      );
      message.success(`${field?.label ?? fieldName} ${locale.toUpperCase()} 翻译已保存`);
    } catch {
      // callSfn 已提示
    } finally {
      setSaving(null);
    }
  }

  async function handleAiTranslate(fieldName: string, targetLocale: Locale) {
    const sourceText = originalValues?.[fieldName];
    if (!sourceText?.trim()) {
      message.warning("源文本为空，无法翻译");
      return;
    }

    const key = `${fieldName}:${targetLocale}`;
    setAiTranslating(key);
    try {
      const translated = await callSfn(
        aiTranslateFieldSFn({
          data: { sourceText, sourceLocale: DEFAULT_LOCALE, targetLocale },
        }),
        { error: "AI 翻译失败" },
      );
      if (translated) {
        updateValue(fieldName, targetLocale, translated);
      }
    } catch {
      // callSfn 已提示
    } finally {
      setAiTranslating(null);
    }
  }

  /** 单实体批量翻译：流式消费 SSE，实时展示 AI 原文与进度，完成后回填编辑器（不自动保存） */
  async function handleBatchTranslate() {
    const hasSource = Object.values(originalValues ?? {}).some((v) => v?.trim());
    if (!hasSource) {
      message.warning("无可用源文本，无法批量翻译");
      return;
    }

    setBatchTranslating(true);
    setStreamText("");
    setBatchProgress(null);
    try {
      const [response] = await sfnUnwrap(
        aiBatchTranslateSFn({
          data: {
            entityType,
            mode: batchMode,
            fields: fields.map((f) => ({
              name: f.name,
              valueType: f.valueType,
            })),
            records: [{ id: entityId, values: originalValues ?? {} }],
            targetLocales: MANAGED_LOCALES,
            writeBack: false,
          },
        }),
        { error: "批量翻译失败" },
      );
      if (response === null) return;
      await readSSEStream(response, (event) => {
        if (event.type === "text-delta") {
          setStreamText((prev) => prev + event.delta);
        } else if (event.type === "batch-done") {
          setBatchProgress({
            total: event.total,
            done: event.batchIndex + 1,
            failedCount: event.failedCount,
          });
        } else if (event.type === "failed") {
          message.error(`批次 ${event.batchIndex + 1} 翻译失败：${event.reason}`);
        } else if (event.type === "done") {
          const { translations: results, created, updated, failedCount } = event.summary;
          const merged: Record<string, Record<string, string>> = {};
          for (const t of results ?? []) {
            if (!merged[t.fieldName]) merged[t.fieldName] = {};
            merged[t.fieldName][t.locale] = t.value;
          }
          setTranslations((prev) => {
            const next = { ...prev };
            for (const [f, vals] of Object.entries(merged)) {
              next[f] = { ...(next[f] ?? {}), ...vals };
            }
            return next;
          });
          message.success(
            `AI 批量翻译完成（新增 ${created} / 更新 ${updated}${failedCount ? `，失败 ${failedCount}` : ""}）`,
          );
        } else if (event.type === "error") {
          message.error(`批量翻译出错：${event.reason}`);
        }
      });
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "批量翻译失败");
    } finally {
      setBatchTranslating(false);
      setBatchProgress(null);
    }
  }

  /** 保存全部非默认语言翻译（一条条走现有保存 SFn） */
  async function handleSaveAll() {
    setSaving("__ALL__");
    try {
      for (const field of fields) {
        for (const locale of MANAGED_LOCALES) {
          const value = translations[field.name]?.[locale];
          if (!value) continue;
          await callSfn(
            saveContentTranslationSFn({
              data: {
                entityType,
                entityId,
                fieldName: field.name,
                locale,
                value,
                valueType: field.valueType,
              },
            }),
            { error: "保存失败" },
          );
        }
      }
      message.success("全部翻译已保存");
    } catch {
      // callSfn 已提示
    } finally {
      setSaving(null);
    }
  }

  function updateValue(fieldName: string, locale: string, val: string) {
    setTranslations((prev) => ({
      ...prev,
      [fieldName]: { ...(prev[fieldName] ?? {}), [locale]: val },
    }));
  }

  // 根据触发方式渲染触发器
  const gradientId = `i18n-grad-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const triggerEl = (
    <Tooltip title="国际化">
      <Button
        type="link"
        size="small"
        icon={
          <TranslationOutlined
            style={{ cursor: "pointer" }}
            className={`hover:opacity-80 ml-1 ${gradientId}`}
            onClick={(e: MouseEvent<HTMLSpanElement>) => {
              e.stopPropagation();
              setOpen(true);
            }}
          />
        }
      ></Button>
    </Tooltip>
  );

  return (
    <>
      {/* AI 品牌装饰渐变：为 AI 功能入口的视觉标识，属装饰性品牌色（非状态语义色），
			    暂无对应语义令牌，此处保留具名色值并在暗色主题下由 UI 层统一定制。 */}
      <svg width="0" height="0" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#667eea" />
            <stop offset="100%" stopColor="#764ba2" />
          </linearGradient>
        </defs>
      </svg>
      <style>{`
				.${gradientId}.anticon svg {
					fill: url(#${gradientId});
				}
			`}</style>
      {triggerEl}
      <Drawer
        title={`字段翻译 — ${entityType}`}
        open={open}
        onClose={() => setOpen(false)}
        // 表单型抽屉：宽度取档位（wide 760）
        width={FORM_DRAWER_WIDTH.wide}
        extra={
          <Button type="primary" loading={saving === "__ALL__"} onClick={handleSaveAll}>
            保存全部
          </Button>
        }
        styles={{
          body: {
            paddingTop: 0,
          },
        }}
      >
        {MANAGED_LOCALES.length > 0 && (
          <div className="mb-4 rounded border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={batchMode}
                onChange={(v) => setBatchMode(v as BatchMode)}
                options={[
                  { label: "补齐缺失", value: "fill" },
                  { label: "AI 校正", value: "correct" },
                ]}
              />
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={batchTranslating}
                onClick={handleBatchTranslate}
              >
                AI 批量翻译
              </Button>
            </div>
            {batchTranslating && (
              <div className="mt-3 space-y-2">
                <Progress
                  percent={
                    batchProgress?.total
                      ? Math.round((batchProgress.done / batchProgress.total) * 100)
                      : undefined
                  }
                  status="active"
                  size="small"
                />
                <div className="text-xs text-muted-foreground">
                  {streamText ? "AI 正在实时生成翻译…" : "正在准备翻译任务…"}
                </div>
                {streamText && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border bg-muted p-2 text-xs">
                    {streamText}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
        <Tabs
          activeKey={activeTab}
          onChange={(key: string) => {
            setActiveTab(key);
            if (!translations[key]) loadTranslations(key);
          }}
          items={fields.map((field) => ({
            key: field.name,
            label: field.label,
            children: (
              <div className="space-y-4">
                {SUPPORTED_LOCALES.map((locale) => {
                  const isDefault = locale === DEFAULT_LOCALE;
                  const value = isDefault
                    ? (originalValues?.[field.name] ?? "")
                    : (translations[field.name]?.[locale] ?? "");
                  const saveKey = `${field.name}:${locale}`;

                  return (
                    <Card
                      key={locale}
                      size="small"
                      type="inner"
                      title={
                        isDefault ? (
                          (LOCALE_LABELS[locale] ?? locale.toUpperCase())
                        ) : (
                          <span className="flex items-center gap-2">
                            {LOCALE_LABELS[locale] ?? locale.toUpperCase()}
                            <Button
                              type="link"
                              size="small"
                              icon={<RobotOutlined style={{ color: "#a855f7" }} />}
                              loading={aiTranslating === saveKey}
                              disabled={!originalValues?.[field.name]?.trim()}
                              className="font-medium"
                              style={{
                                background:
                                  "linear-gradient(to right, #a855f7, #c084fc, #e879f9, #ec4899)",
                                backgroundClip: "text",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                              }}
                              onClick={() => handleAiTranslate(field.name, locale)}
                            >
                              AI 翻译
                            </Button>
                          </span>
                        )
                      }
                      styles={{ root: { marginBottom: 20 } }}
                      extra={
                        isDefault ? (
                          <span className="text-xs text-muted-foreground">从主表读取</span>
                        ) : (
                          <Button
                            type="primary"
                            size="small"
                            loading={saving === saveKey}
                            onClick={() => saveTranslation(field.name, locale)}
                          >
                            保存
                          </Button>
                        )
                      }
                    >
                      <EditorTypes.Editor
                        value={value}
                        onChange={(val) => updateValue(field.name, locale, String(val ?? ""))}
                        type={field.valueType}
                        preview={isDefault}
                      />
                    </Card>
                  );
                })}
              </div>
            ),
          }))}
        />
      </Drawer>
    </>
  );
}
