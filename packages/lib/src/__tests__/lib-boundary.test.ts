/**
 * lib 包边界守门测试
 * 机械校验 packages/lib/src 下不出现「不属于库」的耦合：读取运行环境、日志耦合、
 * 反向引用 app、框架与 UI 包依赖、耦合 app 私有协议或权限码。
 * 判据见 AGENTS.md「包边界约定」与 .agents/skills/architecture/SKILL.md 的归属判定。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** lib 源码根目录（packages/lib/src） */
const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));

/** 纳入扫描的源码扩展名（lib 不应出现 .tsx，但一旦出现必须能被拦下） */
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

/** 引入语句前缀：同时覆盖静态 `from "x"` 与动态 `import("x")` 两种形式 */
const IMPORT_PREFIX = String.raw`(?:from|import\s*\()\s*`;

/** 命中即表示该实现不属于 lib 的模式（附带可读原因，便于定位） */
const FORBIDDEN_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /process\.env/, reason: "读取运行环境（lib 不读 env）" },
  {
    pattern: /import\.meta\.env/,
    reason: "读取编译期环境变量（lib 不读 env）",
  },
  { pattern: /["'`]#\//, reason: "反向引用 app 内部别名 #/*" },
  {
    pattern: new RegExp(`${IMPORT_PREFIX}["'][^"']*logger[^"']*["']`),
    reason: "耦合 logger（lib 不做日志耦合）",
  },
  {
    pattern: new RegExp(`${IMPORT_PREFIX}["']react["']`),
    reason: "依赖 React（lib 无 React）",
  },
  {
    pattern: new RegExp(`${IMPORT_PREFIX}["']@tanstack\\/`),
    reason: "依赖框架（lib 不碰框架）",
  },
  {
    pattern: new RegExp(`${IMPORT_PREFIX}["']@hub\\/`),
    reason: "依赖工作区包（lib 是依赖图底层）",
  },
  { pattern: /SfnError/, reason: "耦合 app 私有错误协议（SfnError*）" },
  {
    pattern: /AdminAuthError|ClientAuthError/,
    reason: "耦合 app 鉴权实现",
  },
  {
    pattern: /ADMIN_PERMISSIONS|CLIENT_PERMISSIONS/,
    reason: "耦合 app 权限码",
  },
];

/**
 * 去除注释，保留换行以确保行号不变
 * 按字符扫描而非正则替换：字符串与模板字面量中的 `//`、`/*` 不是注释，不能误删
 * （注释里提及禁用词，如「不要在这里读 process.env」，不应判定为违规）
 */
function stripComments(source: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    // 行注释：整段替换为空格，换行保留
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }

    // 块注释：逐字符替换为空格，换行保留
    if (ch === "/" && next === "*") {
      out.push(" ", " ");
      i += 2;
      while (i < source.length) {
        if (source[i] === "*" && source[i + 1] === "/") {
          out.push(" ", " ");
          i += 2;
          break;
        }
        out.push(source[i] === "\n" ? "\n" : " ");
        i++;
      }
      continue;
    }

    // 字符串 / 模板字面量：原样保留（含转义序列）
    if (ch === '"' || ch === "'" || ch === "`") {
      out.push(ch);
      i++;
      while (i < source.length) {
        const inner = source[i];
        if (inner === "\\") {
          out.push(inner, source[i + 1] ?? " ");
          i += 2;
          continue;
        }
        out.push(inner);
        i++;
        if (inner === ch) break;
        // 非模板字符串遇换行即视为未闭合，避免吞掉后续代码
        if (inner === "\n" && ch !== "`") break;
      }
      continue;
    }

    out.push(ch);
    i++;
  }
  return out.join("");
}

/** 递归收集源码文件（排除测试目录与类型声明文件） */
function collectSourceFiles(dir: string): string[] {
  const collected: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      collected.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (
      !entry.name.endsWith(".d.ts") &&
      SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
    ) {
      collected.push(fullPath);
    }
  }
  return collected;
}

describe("lib 包边界守门", () => {
  const sourceFiles = collectSourceFiles(SRC_DIR);

  it("扫描范围非空（防止规则失效后静默通过）", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(FORBIDDEN_RULES.length).toBeGreaterThan(0);
  });

  it("src 下不出现不属于 lib 的耦合", () => {
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const { pattern, reason } of FORBIDDEN_RULES) {
        for (const match of code.matchAll(new RegExp(pattern, "g"))) {
          const line = code.slice(0, match.index).split("\n").length;
          violations.push(`${relative(SRC_DIR, file)}:${line} 命中「${reason}」：${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
