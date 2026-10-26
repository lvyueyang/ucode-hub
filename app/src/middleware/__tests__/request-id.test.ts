/**
 * 请求 ID 中间件测试：上游 x-request-id 的透传、长度截断与非法字符回退
 */
import { describe, expect, it } from "vitest";
import { MAX_REQUEST_ID_LENGTH, resolveRequestId } from "../request-id";

/** UUID v4 形态（randomUUID 输出） */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("resolveRequestId", () => {
  it("合法上游值原样沿用", () => {
    expect(resolveRequestId("trace-abc.123_xyz")).toBe("trace-abc.123_xyz");
  });

  it("未提供上游值时生成 UUID", () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
    expect(resolveRequestId("")).toMatch(UUID_PATTERN);
  });

  it("超长合法值截断至列长度", () => {
    const raw = "a".repeat(MAX_REQUEST_ID_LENGTH + 20);
    expect(resolveRequestId(raw)).toHaveLength(MAX_REQUEST_ID_LENGTH);
  });

  it("含 CR/LF 等非法字符时整体回退为 UUID（不清洗后沿用）", () => {
    // 回退而非截断/清洗：该值会进入响应头、日志与审计表，残留的可疑字符会被当作可信链路 ID
    expect(resolveRequestId("abc\r\nX-Injected: 1")).toMatch(UUID_PATTERN);
    expect(resolveRequestId("abc\ndef")).toMatch(UUID_PATTERN);
    expect(resolveRequestId("abc def")).toMatch(UUID_PATTERN);
    expect(resolveRequestId("abc\u0000def")).toMatch(UUID_PATTERN);
    expect(resolveRequestId("中文请求号")).toMatch(UUID_PATTERN);
  });
});
