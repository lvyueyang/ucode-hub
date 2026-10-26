/**
 * 内置资产发布入口：把一个本地目录发布成某个 `id` + `version`。
 *
 *   pnpm -F @ucode/hub builtin:publish -- --id plugin-create --version 0.2.0 --dir ./skills/plugin-create
 *   pnpm -F @ucode/hub builtin:publish -- --id review --kind prompt --version 0.2.0 --dir ./prompts/review
 *
 * 不需要数据库：只读 `STORAGE_DIR`（发布内容与清单都写在它下面，见 docs/builtin-assets.md）。
 * 环境文件按 CLI 惯例自己读（Nitro 那套 dotenv 只在应用进程里生效）。
 */
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

// env 在导入期读 process.env，故要在 dotenv 之后动态导入
const { publishBuiltinAsset, builtinAssetsRoot } = await import(
  "../src/services/builtin-assets/builtin-assets.server.ts"
);
const { logger } = await import("../src/shared-services/logger/index.ts");

type Options = {
  id: string;
  version: string;
  dir: string;
  kind: string;
};

const USAGE = "用法：--id <id> --version <版本> --dir <目录> [--kind skill|prompt|...]";

/** 取 `--name value` 形式的参数（脚本参数少，不引参数解析库） */
const readOptions = (argv: readonly string[]): Options => {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`参数格式不对：${USAGE}`);
    values.set(key.slice(2), value);
  }

  const id = values.get("id");
  const version = values.get("version");
  const dir = values.get("dir");
  if (!id || !version || !dir) throw new Error(`缺少必需参数：${USAGE}`);
  return { id, version, dir, kind: values.get("kind") ?? "skill" };
};

const main = (): void => {
  // pnpm 会把 `--` 分隔符原样传进来，它不是参数本身
  const options = readOptions(process.argv.slice(2).filter((arg) => arg !== "--"));
  const sourceDir = resolve(options.dir);
  if (!statSync(sourceDir).isDirectory()) throw new Error(`--dir 不是目录：${sourceDir}`);

  const result = publishBuiltinAsset({
    sourceDir,
    id: options.id,
    kind: options.kind,
    version: options.version,
  });

  logger.info(
    {
      id: result.asset.id,
      kind: result.asset.kind,
      version: result.asset.version,
      files: result.fileCount,
      bytes: result.asset.size,
      executable: result.asset.executable,
      storageRoot: builtinAssetsRoot(),
      manifest: result.manifestPath,
    },
    "内置资产已发布",
  );
  if (result.asset.executable) {
    logger.warn(
      { id: result.asset.id, version: result.asset.version },
      "该资产含可执行内容：下发侧只落盘不生效，需显式信任后才会激活",
    );
  }

  // 生产级别下控制台只出 warn 以上，人看的结论单独走 stdout（日志流留给文件与采集）
  process.stdout.write(
    `已发布 ${result.asset.id}@${result.asset.version}（${result.asset.kind}，${result.fileCount} 个文件，${result.asset.size} 字节）` +
      `${result.asset.executable ? "，含可执行内容（下发侧不自动生效）" : ""}\n`,
  );
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn({ error: message }, "内置资产发布失败");
  process.stderr.write(`内置资产发布失败：${message}\n`);
  process.exitCode = 1;
}
