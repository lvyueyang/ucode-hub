/**
 * 日志模块测试：生产模式按天写入文件 + 开发模式 pino-pretty 分支
 */
import { readdirSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pinoPretty from "pino-pretty";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createLogger } from "../index";

vi.mock("pino-pretty", () => ({
  __esModule: true,
  default: vi.fn(() => ({ write: () => {} })),
}));

describe("createLogger", () => {
  const storageDir = join(tmpdir(), `logger-test-${Date.now()}`);
  const logDir = join(storageDir, "logs");

  afterAll(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  it("生产模式创建日志目录并按天写入文件", async () => {
    const logger = createLogger({ level: "info", storageDir, isProd: true });

    logger.info("hello 日志测试");
    logger.flush();

    // pino 异步写盘，等待日志文件出现且内容落盘
    await vi.waitFor(() => {
      const files = readdirSync(logDir).filter((f) => f.endsWith(".log"));
      expect(files).toHaveLength(1);
    });
    const files = readdirSync(logDir).filter((f) => f.endsWith(".log"));
    const content = await readFile(join(logDir, files[0]), "utf-8");
    expect(content).toContain("hello 日志测试");
  });

  it("文件流跟随 LOG_LEVEL：debug 级别日志可落盘", async () => {
    const debugDir = join(tmpdir(), `logger-test-debug-${Date.now()}`);
    const logger = createLogger({
      level: "debug",
      storageDir: debugDir,
      isProd: true,
    });

    logger.debug("调试日志落盘测试");
    logger.flush();

    const debugLogDir = join(debugDir, "logs");
    await vi.waitFor(() => {
      const files = readdirSync(debugLogDir).filter((f) => f.endsWith(".log"));
      expect(files).toHaveLength(1);
    });
    const files = readdirSync(debugLogDir).filter((f) => f.endsWith(".log"));
    const content = await readFile(join(debugLogDir, files[0]), "utf-8");
    expect(content).toContain("调试日志落盘测试");

    await rm(debugDir, { recursive: true, force: true });
  });

  it("开发模式使用 pino-pretty 输出且不抛错", () => {
    const logger = createLogger({ level: "info", storageDir, isProd: false });

    logger.info("dev log");
    logger.flush();

    expect(vi.mocked(pinoPretty)).toHaveBeenCalled();
  });
});
