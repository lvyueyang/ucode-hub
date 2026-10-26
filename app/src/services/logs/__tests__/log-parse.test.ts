/**
 * 日志解析纯函数测试：级别归一化、消息聚类归一化、文件行流式迭代
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { iterateLogLines, normalizeLogLevel, normalizeMessage } from "../log-parse";

describe("normalizeLogLevel", () => {
  it("pino 数字级别转为级别名", () => {
    expect(normalizeLogLevel(30)).toBe("info");
    expect(normalizeLogLevel(50)).toBe("error");
    expect(normalizeLogLevel(60)).toBe("fatal");
  });

  it("字符串级别原样返回", () => {
    expect(normalizeLogLevel("warn")).toBe("warn");
  });

  it("未知数字级别回退为字符串", () => {
    expect(normalizeLogLevel(99)).toBe("99");
  });

  it("非数字非字符串返回空串", () => {
    expect(normalizeLogLevel(undefined)).toBe("");
    expect(normalizeLogLevel(null)).toBe("");
  });
});

describe("normalizeMessage", () => {
  it("剥离 UUID 与数字，使同类错误归一为同一骨架", () => {
    const a = normalizeMessage("查询用户 550e8400-e29b-41d4-a716-446655440000 失败，耗时 120ms");
    const b = normalizeMessage("查询用户 123e4567-e89b-12d3-a456-426614174000 失败，耗时 980ms");
    expect(a).toBe(b);
    expect(a).toContain("<uuid>");
    expect(a).toContain("<n>");
  });

  it("剥离 URL 与文件路径", () => {
    const result = normalizeMessage(
      "请求 https://api.example.com/v1/users 失败，文件 /var/log/app/x.log",
    );
    expect(result).toContain("<url>");
    expect(result).toContain("<path>");
    expect(result).not.toContain("example.com");
  });

  it("空白归一为单个空格", () => {
    expect(normalizeMessage("a    b\n\tc")).toBe("a b c");
  });

  it("空白消息归一为空串", () => {
    expect(normalizeMessage("   ")).toBe("");
  });

  it("超长消息截断到上限", () => {
    const long = "错".repeat(500);
    expect(normalizeMessage(long).length).toBe(200);
  });
});

describe("iterateLogLines", () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `log-parse-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    file = join(dir, "sample.log");
    await writeFile(file, ["第一行", "", "  ", "第二行"].join("\n"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("逐行产出并跳过空行", async () => {
    const lines: string[] = [];
    for await (const line of iterateLogLines(file)) {
      lines.push(line);
    }
    expect(lines).toEqual(["第一行", "第二行"]);
  });

  it("提前中断不会遗留资源（生成器 return 正常返回）", async () => {
    const iterator = iterateLogLines(file);
    const first = await iterator.next();
    expect(first.value).toBe("第一行");
    await iterator.return(undefined);
  });
});
