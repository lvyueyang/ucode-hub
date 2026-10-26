/**
 * OpenAI 兼容（Chat Completions）推理内容提取适配器
 * TanStack AI 的 OpenAI 兼容适配器在默认 Chat Completions 面上不读取推理增量：
 * 基类 extractReasoning 为空实现，而 DeepSeek-R1 / Qwen3 / Moonshot 等厂商的思考内容
 * 在 delta.reasoning_content（部分厂商为 delta.reasoning / reasoning_details），
 * 而非 delta.content，因此会被静默丢弃，导致前端看不到思考过程。
 * 本子类重写 extractReasoning 补齐该缺口，对非推理模型无该字段自然返回 undefined，无副作用。
 */
import type { Modality } from "@tanstack/ai";
import { OpenAICompatibleChatAdapter } from "@tanstack/ai-openai/compatible";

/** 从可能的 string / { content | text } 形态中取非空（非纯空白）字符串 */
function pickReasoningText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const obj = value as { content?: unknown; text?: unknown };
    if (typeof obj.content === "string" && obj.content.trim()) return obj.content;
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text;
  }
  return undefined;
}

/**
 * 从 OpenAI 兼容 Chat Completions 流式 chunk 中提取思考增量文本。
 * 依次尝试 delta.reasoning_content（DeepSeek / Qwen / Moonshot）、
 * delta.reasoning（OpenRouter 等）与 delta.reasoning_details。
 * 无思考内容（非推理模型或有增量时）返回 undefined。
 */
export function extractReasoningData(chunk: unknown): { text: string } | undefined {
  const delta = (chunk as { choices?: Array<{ delta?: Record<string, unknown> }> })?.choices?.[0]
    ?.delta;
  if (!delta) return undefined;
  const text =
    pickReasoningText(delta.reasoning_content) ??
    pickReasoningText(delta.reasoning) ??
    pickReasoningText(delta.reasoning_details);
  return text ? { text } : undefined;
}

/**
 * 支持推理内容提取的 OpenAI 兼容 Chat Completions 适配器子类。
 * 继承 @tanstack/ai-openai/compatible 导出的 OpenAICompatibleChatAdapter，
 * 仅重写 extractReasoning 以读取厂商推理字段，其余行为与基类一致。
 */
export class ReasoningCompatibleChatAdapter<
  TModel extends string,
> extends OpenAICompatibleChatAdapter<
  TModel,
  Record<string, unknown>,
  ReadonlyArray<Modality>,
  ReadonlyArray<string>
> {
  protected override extractReasoning(chunk: unknown): { text: string } | undefined {
    return extractReasoningData(chunk);
  }
}
