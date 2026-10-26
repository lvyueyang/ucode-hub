/**
 * PostgreSQL → SQLite 迁移辅助脚本：审计 / 校验 / 安全机械改写
 * 零依赖纯 Node（node:fs/path/url），经 tsx 运行，仓库根由本文件位置自推导
 *
 * 用法（在仓库根或 app 目录执行均可）：
 *   pnpm --filter @ucode/hub exec tsx ../.agents/skills/db-sqlite/scripts/db-migration.ts audit
 *   pnpm --filter @ucode/hub exec tsx ../.agents/skills/db-sqlite/scripts/db-migration.ts verify
 *   pnpm --filter @ucode/hub exec tsx ../.agents/skills/db-sqlite/scripts/db-migration.ts fix --ilike --execute --rowcount [--write]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录（.agents/skills/db-sqlite/scripts 向上四级） */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 需要扫描的目录（相对 ROOT，递归 .ts/.tsx） */
const SCAN_DIRS = ["app/src", "app/e2e", "app/scripts"];

/** 需要扫描的固定文件（相对 ROOT） */
const SCAN_FILES = [
  "app/drizzle.config.ts",
  "app/.env.example",
  "app/vitest.config.ts",
  "app/playwright.config.ts",
  "app/package.json",
  "docker-compose.yml",
];

/** 迁移后校验的固定断言 */
const VERIFY_CHECKS: {
  label: string;
  run: () => { ok: boolean; detail: string };
}[] = [
  {
    label: "app/package.json 无 pg / @types/pg 依赖",
    run: () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, "app/package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const hits = Object.keys(deps).filter((k) => k === "pg" || k === "@types/pg");
      return { ok: hits.length === 0, detail: hits.join(", ") };
    },
  },
  {
    label: "app/drizzle.config.ts 为 sqlite 方言",
    run: () => {
      const content = readFileSync(join(ROOT, "app/drizzle.config.ts"), "utf8");
      const ok = /dialect:\s*["']sqlite["']/.test(content);
      return { ok, detail: ok ? "sqlite" : "非 sqlite 方言" };
    },
  },
  {
    label: "app/src/db/schema/*.ts 无 pg-core 残留",
    run: () => {
      const dir = join(ROOT, "app/src/db/schema");
      const bad: string[] = [];
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".ts")) continue;
        const c = readFileSync(join(dir, f), "utf8");
        if (/drizzle-orm\/pg-core/.test(c)) bad.push(f);
      }
      return { ok: bad.length === 0, detail: bad.join(", ") };
    },
  },
];

/** 命中记录 */
interface Hit {
  file: string;
  line: number;
  text: string;
}

/** 模式规则 */
interface Rule {
  id: string;
  label: string;
  regex: RegExp;
  /** must = 迁移必改（audit/verify 门禁）；review = 需人工甄别 */
  severity: "must" | "review";
}

/** 「必改」模式：命中即需处理（可作为门禁） */
const MUST_RULES: Rule[] = [
  {
    id: "ilike",
    label: "ilike → like（SQLite 无 ILIKE）",
    regex: /\bilike\b/,
    severity: "must",
  },
  {
    id: "db.execute",
    label: "db.execute → db.all（node-postgres 专用）",
    regex: /\bdb\.execute\b/,
    severity: "must",
  },
  {
    id: "rowCount",
    label: "rowCount → changes（NodePg 结果字段）",
    regex: /\browCount\b/,
    severity: "must",
  },
  {
    id: "pg-import",
    label: "pg / node-postgres / pg-core 残留",
    regex:
      /from\s+["'](pg|@types\/pg)["']|drizzle-orm\/(node-postgres|pg-core)|["'](node-postgres|pg)["']/,
    severity: "must",
  },
  {
    id: "pgTable",
    label: "pgTable( 残留（含正则字面量形态）",
    regex: /pgTable\\?\(/,
    severity: "must",
  },
  {
    id: "postgres-url",
    label: "postgresql:// 连接串残留",
    regex: /postgresql:\/\//,
    severity: "must",
  },
  {
    id: "sql-to_char",
    label: "TO_CHAR（pg 专用）",
    regex: /\bTO_CHAR\b/,
    severity: "must",
  },
  {
    id: "sql-timezone",
    label: "AT TIME ZONE（pg 专用）",
    regex: /AT TIME ZONE/,
    severity: "must",
  },
  {
    id: "sql-jsonb-op",
    label: "jsonb 运算符 ->>",
    regex: /->>/,
    severity: "must",
  },
  {
    id: "sql-cast",
    label: "::int / ::text / ::bigint 类型转换",
    regex: /::(?:int|text|bigint)\b/,
    severity: "must",
  },
];

/** 「需人工甄别」模式：仅列出位置，不判错 */
const REVIEW_RULES: Rule[] = [
  {
    id: "new-Date",
    label: "new Date( → 多无需改（timestamp_ms 列保持 Date）；仅裸 sql / 字符串入参需甄别",
    regex: /\bnew Date\(/,
    severity: "review",
  },
  {
    id: "sql-date-param",
    label: "日期表达式入参 → 裸 sql 模板不走列编码，需手动 .getTime()",
    regex: /\$\{[^}]*(?:new Date\(|\.toISOString\(\))[^}]*\}/,
    severity: "review",
  },
  {
    id: "withTransaction",
    label: "withTransaction → 事务同步化改造点",
    regex: /\bwithTransaction\b/,
    severity: "review",
  },
  {
    id: "db.transaction",
    label: "db.transaction → 事务同步化改造点",
    regex: /\.transaction\s*\(/,
    severity: "review",
  },
  {
    id: "schema-types",
    label: "pg schema 类型（timestamp→timestamp_ms / jsonb / uuid / boolean）",
    regex: /\b(?:timestamp|jsonb|uuid|boolean)\(/,
    severity: "review",
  },
];

/** 递归收集目录下指定扩展名文件（相对 ROOT，跳过 node_modules 与 .git） */
function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === ".git") continue;
    if (statSync(full).isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** 收集全部待扫描文件（相对 ROOT 路径） */
function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (existsSync(abs)) files.push(...walk(abs, [".ts", ".tsx"]));
  }
  for (const f of SCAN_FILES) {
    const abs = join(ROOT, f);
    if (existsSync(abs)) files.push(abs);
  }
  return files;
}

/** 扫描单个文件，返回命中的行 */
function scanFile(file: string, rules: Rule[]): Hit[] {
  const content = readFileSync(file, "utf8");
  const hits: Hit[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const rule of rules) {
      if (rule.regex.test(lines[i])) {
        hits.push({
          file: relative(ROOT, file),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }
  return hits;
}

/** 渲染分级报告 */
function renderReport(grouped: Map<string, Hit[]>): string {
  const out: string[] = [];
  for (const [ruleId, hits] of grouped) {
    const rule = [...MUST_RULES, ...REVIEW_RULES].find((r) => r.id === ruleId);
    out.push(
      `\n[${rule?.severity === "must" ? "必改" : "甄别"}] ${rule?.label ?? ruleId}（${hits.length}）`,
    );
    for (const h of hits) {
      out.push(`  ${h.file}:${h.line}  ${h.text}`);
    }
  }
  return out.join("\n");
}

/** 按规则分组命中 */
function groupHits(allHits: { rule: Rule; hit: Hit }[]): Map<string, Hit[]> {
  const grouped = new Map<string, Hit[]>();
  for (const { rule, hit } of allHits) {
    const list = grouped.get(rule.id) ?? [];
    list.push(hit);
    grouped.set(rule.id, list);
  }
  return grouped;
}

/** audit：输出分级清单，存在「必改」命中即 exit 1 */
function runAudit(): never {
  const files = collectFiles();
  const all: { rule: Rule; hit: Hit }[] = [];
  for (const file of files) {
    for (const rule of [...MUST_RULES, ...REVIEW_RULES]) {
      for (const hit of scanFile(file, [rule])) {
        all.push({ rule, hit });
      }
    }
  }
  console.log(`扫描 ${files.length} 个文件\n`);
  if (all.length === 0) {
    console.log("未发现迁移相关残留。");
    process.exit(0);
  }
  console.log(renderReport(groupHits(all)));
  const mustCount = all.filter(({ rule }) => rule.severity === "must").length;
  if (mustCount > 0) {
    console.log(`\n共 ${mustCount} 处「必改」命中，迁移未完成。`);
    process.exit(1);
  }
  process.exit(0);
}

/** verify：断言「必改」模式 0 命中 + 固定配置断言 */
function runVerify(): never {
  let failed = false;
  for (const check of VERIFY_CHECKS) {
    const { ok, detail } = check.run();
    console.log(`${ok ? "✓" : "✗"} ${check.label}${detail ? `（${detail}）` : ""}`);
    if (!ok) failed = true;
  }

  const files = collectFiles();
  const hits: { rule: Rule; hit: Hit }[] = [];
  for (const file of files) {
    for (const rule of MUST_RULES) {
      for (const hit of scanFile(file, [rule])) hits.push({ rule, hit });
    }
  }
  if (hits.length > 0) {
    console.log("\n残留「必改」模式：");
    console.log(renderReport(groupHits(hits)));
    failed = true;
  } else {
    console.log("\n✓ 无「必改」模式残留");
  }
  process.exit(failed ? 1 : 0);
}

/** 安全改写规则：find/replace 精确到已知形态，避免误伤 */
interface FixRule {
  id: string;
  label: string;
  files: string[]; // 相对 ROOT 的精确文件
  apply: (content: string) => { next: string; count: number };
}

const FIX_RULES: Record<string, FixRule> = {
  ilike: {
    id: "ilike",
    label: "ilike → like（app/src 全部 .ts/.tsx）",
    files: walk(join(ROOT, "app/src"), [".ts", ".tsx"]).map((f) => relative(ROOT, f)),
    apply: (content) => {
      const next = content.replace(/\bilike\b/g, "like");
      return { next, count: (content.match(/\bilike\b/g) ?? []).length };
    },
  },
  execute: {
    id: "execute",
    label: "db.execute(sql`SELECT 1`) → db.all(...)（health 探测）",
    files: ["app/src/services/health/health.server.ts"],
    apply: (content) => {
      const needle = /db\.execute\(sql`SELECT 1`\)/g;
      const next = content.replace(needle, "db.all(sql`SELECT 1`)");
      return { next, count: (content.match(needle) ?? []).length };
    },
  },
  rowcount: {
    id: "rowcount",
    label: "result.rowCount → Number(result.changes)（message 模块）",
    files: ["app/src/services/message/message.server.ts"],
    apply: (content) => {
      let next = content;
      let count = 0;
      const steps: [string, string][] = [
        ["(result.rowCount ?? 0)", "Number(result.changes)"],
        ["result.rowCount ?? rows.length", "Number(result.changes)"],
        ["result.rowCount ?? 0", "Number(result.changes)"],
      ];
      for (const [from, to] of steps) {
        const n = next.split(from).length - 1;
        next = next.split(from).join(to);
        count += n;
      }
      return { next, count };
    },
  },
};

/** 简易行级 diff 预览 */
function previewDiff(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`  - ${a[i]}`);
    if (b[i] !== undefined) lines.push(`  + ${b[i]}`);
  }
  return lines.join("\n");
}

/** fix：安全机械改写（默认 dry-run，需显式 --write） */
function runFix(ids: string[], write: boolean): never {
  let changed = false;
  for (const id of ids) {
    const rule = FIX_RULES[id];
    if (!rule) {
      console.error(`未知改写目标：${id}（可选：${Object.keys(FIX_RULES).join("/")}）`);
      process.exit(1);
    }
    console.log(`\n== ${rule.label} ==`);
    for (const file of rule.files) {
      const abs = join(ROOT, file);
      if (!existsSync(abs)) continue;
      const before = readFileSync(abs, "utf8");
      const { next, count } = rule.apply(before);
      if (count === 0) continue;
      changed = true;
      console.log(`  ${file}（${count} 处）`);
      console.log(previewDiff(before, next));
      if (write) writeFileSync(abs, next, "utf8");
    }
  }
  if (write) {
    console.log(changed ? "\n已写入，请运行 pnpm check 复核。" : "\n无待改内容。");
  } else {
    console.log(changed ? "\n以上为 dry-run 预览，确认后加 --write 落盘。" : "\n无待改内容。");
  }
  process.exit(0);
}

/** 打印用法 */
function usage(): never {
  console.log(
    "用法：db-migration.ts <audit|verify|fix> [选项]\n" +
      "  audit          预扫描：列出「必改/甄别」两级命中（默认）\n" +
      "  verify         迁移后校验：断言「必改」模式 0 命中 + 配置断言\n" +
      "  fix --ilike --execute --rowcount [--write]\n" +
      "                 安全机械改写（默认 dry-run 预览，--write 落盘）",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0] ?? "audit";

if (command === "audit") {
  runAudit();
} else if (command === "verify") {
  runVerify();
} else if (command === "fix") {
  const fixArgs = args.slice(1);
  const write = fixArgs.includes("--write");
  const ids = fixArgs.filter((a) => a.startsWith("--") && a !== "--write").map((a) => a.slice(2));
  if (ids.length === 0) {
    console.error("fix 需指定至少一个目标：--ilike / --execute / --rowcount");
    process.exit(1);
  }
  runFix(ids, write);
} else {
  usage();
}
