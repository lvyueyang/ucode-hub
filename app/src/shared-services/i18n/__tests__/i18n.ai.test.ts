/**
 * 国际化 AI 翻译编排层测试：prompt 构建、JSON 提取、组批、流式逐批执行、单字段翻译
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetConfig, mockCompleteText, mockStreamAiChat, mockUpsertContentTranslations } =
  vi.hoisted(() => ({
    mockGetConfig: vi.fn(),
    mockCompleteText: vi.fn(),
    mockStreamAiChat: vi.fn(),
    mockUpsertContentTranslations: vi.fn(),
  }));

vi.mock("#/shared-services/config/config.server", () => ({
  getConfig: mockGetConfig,
}));

vi.mock("#/shared-services/ai/ai.server", () => ({
  completeText: mockCompleteText,
  streamAiChat: mockStreamAiChat,
}));

vi.mock("#/shared-services/i18n/i18n.content.server", () => ({
  upsertContentTranslations: mockUpsertContentTranslations,
}));

import {
  type AiBatchGroup,
  buildBatchPrompt,
  buildBatchTasks,
  buildTranslationPrompt,
  extractJsonFromText,
  getDefaultTargetLocales,
  resolveTargetLocales,
  runBatchTasks,
  translateWithAi,
} from "../i18n.ai.server";

beforeEach(() => vi.resetAllMocks());

describe("extractJsonFromText", () => {
  it("解析纯 JSON 对象", () => {
    expect(extractJsonFromText('{"a":"b","c":1}')).toEqual({ a: "b", c: 1 });
  });

  it("剥离 markdown code 围栏", () => {
    expect(extractJsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonFromText('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("剥离前后无关文本，取首对花括号", () => {
    expect(extractJsonFromText('以下是结果：{"a":1} 完')).toEqual({ a: 1 });
  });

  it("非 JSON / 无对象结构时抛错", () => {
    expect(() => extractJsonFromText("not json")).toThrow("JSON 对象");
    expect(extractJsonFromText("{}")).toEqual({});
    expect(() => extractJsonFromText("[1,2]")).toThrow("JSON 对象");
  });
});

describe("buildTranslationPrompt", () => {
  it("正常替换占位符", () => {
    const result = buildTranslationPrompt({
      template: "{sourceLang}→{targetLang}:{sourceText}",
      sourceLang: "中文（默认）",
      targetLang: "English",
      sourceText: "你好",
    });
    expect(result).toBe("中文（默认）→English:你好");
  });

  it("源文本含 $& $' $` $1 不被注入污染（函数 replacer）", () => {
    const sourceText = "价格 $& $' $` $1";
    const result = buildTranslationPrompt({
      template: "t:{sourceText}",
      sourceLang: "a",
      targetLang: "b",
      sourceText,
    });
    expect(result).toBe("t:价格 $& $' $` $1");
  });

  it("源文本中的 {sourceText} 字样不会被二次替换", () => {
    const result = buildTranslationPrompt({
      template: "t:{sourceText}",
      sourceLang: "a",
      targetLang: "b",
      sourceText: "含 {sourceText} 文本",
    });
    expect(result).toBe("t:含 {sourceText} 文本");
  });
});

describe("buildBatchPrompt", () => {
  it("把实体源值打包为 JSON 注入 entitiesJson", () => {
    const entities: AiBatchGroup["entities"] = [
      {
        entityId: "n1",
        fields: [{ name: "title" }],
        source: { title: "标题" },
      },
      {
        entityId: "n2",
        fields: [{ name: "description" }],
        source: { description: "摘要" },
      },
    ];
    const result = buildBatchPrompt({
      template: "t:{entitiesJson}",
      sourceLang: "zh",
      targetLang: "en",
      entities,
    });
    expect(JSON.parse(result.slice(2))).toEqual({
      n1: { title: "标题" },
      n2: { description: "摘要" },
    });
  });
});

describe("getDefaultTargetLocales / resolveTargetLocales", () => {
  it("缺省目标语言为全部非默认语言", () => {
    expect(getDefaultTargetLocales()).toEqual(["en"]);
    expect(resolveTargetLocales()).toEqual(["en"]);
  });

  it("过滤默认语言", () => {
    expect(resolveTargetLocales(["en", "zh"])).toEqual(["en"]);
  });

  it("全部为默认语言时回退到默认目标语言", () => {
    expect(resolveTargetLocales(["zh"])).toEqual(["en"]);
  });
});

describe("buildBatchTasks", () => {
  const records = [
    { id: "n1", values: { title: "标题1", description: "摘要1" } },
    { id: "n2", values: { title: "标题2", description: "摘要2" } },
  ];
  const fields = [{ name: "title" }, { name: "description" }];

  it("fill 模式仅补齐无翻译字段", () => {
    const existing = { n1: { en: ["title"] } };
    const batches = buildBatchTasks(records, fields, ["en"], "fill", 10, existing);
    expect(batches).toHaveLength(1);
    const n1 = batches[0].entities.find((e) => e.entityId === "n1");
    const n2 = batches[0].entities.find((e) => e.entityId === "n2");
    expect(n1!.fields.map((f) => f.name)).toEqual(["description"]);
    expect(n2!.fields.map((f) => f.name)).toEqual(["title", "description"]);
  });

  it("correct 模式仅校正已有翻译字段", () => {
    const existing = { n1: { en: ["title"] } };
    const batches = buildBatchTasks(records, fields, ["en"], "correct", 10, existing);
    expect(batches).toHaveLength(1);
    const n1 = batches[0].entities.find((e) => e.entityId === "n1");
    expect(n1!.fields.map((f) => f.name)).toEqual(["title"]);
    // n2 无翻译不进入 correct 任务
    expect(batches[0].entities.some((e) => e.entityId === "n2")).toBe(false);
  });

  it("按 batchSize 切分批次", () => {
    const batches = buildBatchTasks(records, fields, ["en"], "fill", 1, {});
    expect(batches).toHaveLength(2);
    expect(batches[0].entities[0].entityId).toBe("n1");
    expect(batches[1].entities[0].entityId).toBe("n2");
  });

  it("无源文本的字段被跳过，实体无可翻译字段则移除", () => {
    const rec = [{ id: "n1", values: { title: "" } }];
    expect(buildBatchTasks(rec, fields, ["en"], "fill", 10, {})).toHaveLength(0);
  });
});

describe("translateWithAi", () => {
  it("有模板时调用 completeText（非流式）并返回译文", async () => {
    mockGetConfig.mockResolvedValue("t:{sourceText}");
    mockCompleteText.mockResolvedValue("Hello");
    const result = await translateWithAi({
      sourceText: "你好",
      sourceLocale: "zh",
      targetLocale: "en",
    });
    expect(result).toBe("Hello");
    expect(mockCompleteText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "t:你好" }],
        modelOptions: { temperature: 0.3 },
      }),
    );
  });

  it("提示词未配置时直接报错，不调用 AI", async () => {
    mockGetConfig.mockResolvedValue("");
    await expect(
      translateWithAi({
        sourceText: "你好",
        sourceLocale: "zh",
        targetLocale: "en",
      }),
    ).rejects.toThrow("提示词未配置");
    expect(mockCompleteText).not.toHaveBeenCalled();
  });

  it("AI 客户端未配置时给出引导提示", async () => {
    mockGetConfig.mockResolvedValue("t");
    mockCompleteText.mockRejectedValue(new Error("AI 客户端未配置，请检查 ai_providers 配置"));
    await expect(
      translateWithAi({
        sourceText: "x",
        sourceLocale: "zh",
        targetLocale: "en",
      }),
    ).rejects.toThrow("请先在系统配置中配置 AI 厂商");
  });

  it("其他失败转友好提示（失败已由 completeText 记外部调用，本层不重复记日志）", async () => {
    mockGetConfig.mockResolvedValue("t");
    mockCompleteText.mockRejectedValue(new Error("boom"));
    await expect(
      translateWithAi({
        sourceText: "x",
        sourceLocale: "zh",
        targetLocale: "en",
      }),
    ).rejects.toThrow("请稍后重试");
  });
});

describe("runBatchTasks", () => {
  const batches: AiBatchGroup[] = [
    {
      batchIndex: 0,
      total: 1,
      targetLocale: "en",
      entities: [
        {
          entityId: "n1",
          fields: [{ name: "title" }, { name: "description" }],
          source: { title: "标题", description: "摘要" },
        },
        {
          entityId: "n2",
          fields: [{ name: "title" }],
          source: { title: "标题2" },
        },
      ],
    },
  ];

  function fakeStream(deltas: string[]): AsyncIterable<unknown> {
    return {
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) {
          yield { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: d };
        }
        yield { type: "RUN_FINISHED" };
      },
    };
  }

  it("流式累积文本并按 JSON 解析、writeBack=false 不落库并返回结果", async () => {
    mockGetConfig.mockResolvedValue("batch template");
    const output = JSON.stringify({
      n1: { title: "Title", description: "Desc" },
      n2: { title: "Title2" },
    });
    mockStreamAiChat.mockImplementation(async () =>
      fakeStream([output.slice(0, 5), output.slice(5)]),
    );

    const events: Record<string, unknown>[] = [];
    const summary = await runBatchTasks(batches, {
      entityType: "news",
      writeBack: false,
      existing: {},
      emit: (e) => {
        events.push(e);
      },
    });

    expect(mockUpsertContentTranslations).not.toHaveBeenCalled();
    expect(summary.translations).toHaveLength(3);
    expect(summary.created).toBe(3);
    expect(summary.updated).toBe(0);
    expect(events.some((e) => e.type === "text-delta")).toBe(true);
    expect(events.some((e) => e.type === "batch-start")).toBe(true);
    expect(events.some((e) => e.type === "batch-done")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("writeBack=true 时落库并按已有翻译统计 updated", async () => {
    mockGetConfig.mockResolvedValue("batch template");
    const output = JSON.stringify({ n1: { title: "Title" } });
    mockStreamAiChat.mockImplementation(async () => fakeStream([output]));
    const summary = await runBatchTasks(batches, {
      entityType: "news",
      writeBack: true,
      existing: { n1: { en: ["title"] } },
      emit: () => {},
    });
    expect(mockUpsertContentTranslations).toHaveBeenCalledTimes(1);
    // 输出仅 n1.title，且该字段已有翻译 → updated=1；无新增
    expect(summary.updated).toBe(1);
    expect(summary.created).toBe(0);
  });

  it("整批失败时发 failed 事件并继续后续批次", async () => {
    mockGetConfig.mockResolvedValue("batch template");
    mockStreamAiChat.mockRejectedValue(new Error("boom"));
    const events: Record<string, unknown>[] = [];
    const summary = await runBatchTasks(batches, {
      entityType: "news",
      writeBack: false,
      existing: {},
      emit: (e) => {
        events.push(e);
      },
    });
    expect(events.some((e) => e.type === "failed")).toBe(true);
    expect(summary.errors).toHaveLength(1);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("模型未返回的字段记入 failed 且继续", async () => {
    mockGetConfig.mockResolvedValue("batch template");
    const output = JSON.stringify({ n1: { title: "Title" } }); // n1.description 与 n2 缺失
    mockStreamAiChat.mockImplementation(async () => fakeStream([output]));
    const summary = await runBatchTasks(batches, {
      entityType: "news",
      writeBack: false,
      existing: {},
      emit: () => {},
    });
    expect(summary.translations).toHaveLength(1);
    expect(summary.failedCount).toBe(2);
  });
});
