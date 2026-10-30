/**
 * 运行环境配置：app 内唯一的 process.env 读取点，兼作启动期校验
 *
 * 必需项（DATABASE_URL / JWT_SECRET / STORAGE_DIR）缺失、或取值非法一律拒绝启动——`assertEnv()`
 * 由 Nitro 入口与 bootstrap 最先调用，一次报出全部问题。只有确有约定的项才带默认值，且默认值与
 * 判定规则都集中在本文件，业务文件不得再出现 `|| ".tmp"` 这类兜底。
 *
 * 环境文件不在本模块加载：开发与构建期由 Nitro 以 app 为 root 把 `.env` / `.env.local` 读入
 * process.env（见 nitro 的 dotenv 选项），生产由部署声明环境变量（见 deploy/docker-compose.yml），
 * CLI 入口（`pnpm db:migrate`）自己读 `.env`。再加一套加载会让同一变量出现两个来源，故这里只解析与校验。
 *
 * 取值按调用时的 process.env 现读（getter）、不做缓存：进程内只有一份环境表，缓存只会让运行期
 * 覆盖（测试的 vi.stubEnv、按需注入）失效；启动期校验已保证必需项就位。
 */

/** pino 支持的日志级别；级别写错会让 pino 构造时抛错拖垮启动，故只接受白名单内的值 */
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

/** 日志级别 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Node / Vite / Nitro 约定俗成的运行环境取值；写错会让生产分流（迁移 fail-fast、Cookie Secure）静默失效 */
const NODE_ENVS = ["development", "production", "test"] as const;

/** JWT 密钥最小长度（HS256 短密钥可被离线暴力破解，与基座安全口径一致） */
const JWT_SECRET_MIN_LENGTH = 32;

/** 敏感配置主密钥长度（AES-256 的密钥长度） */
const CONFIG_KEY_BYTES = 32;

/** 无配置也应能跑起来的项：默认值集中在此，便于一处核对 */
const DEFAULTS = {
  logLevel: "info",
  port: 3009,
  nodeEnv: "development",
} as const;

/** 校验失败时的修复提示：环境文件的加载方在部署侧，这里只指路 */
const ENV_HINT = "请检查 .env / .env.local 或运行环境（变量清单见 app/.env.example）。";

/**
 * 配置问题：一次带上全部问题，由入口打印成可读中文原因。
 * 用抛错而不是 process.exit——hub 是 Nitro 应用，入口注册了优雅关闭与缓冲刷入，
 * 启动期失败也要走同一个出口，退出码由入口置为非零。
 */
export class EnvError extends Error {
  /** 全部问题，逐条为可读中文 */
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      ["环境变量校验未通过：", ...problems.map((problem) => `- ${problem}`), ENV_HINT].join("\n"),
    );
    this.name = "EnvError";
    this.problems = problems;
  }
}

/** 读取原始值：未设置与纯空白一律按缺失处理，避免空白值穿透成空串配置 */
const readRaw = (name: string): string | undefined => {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
};

/** 必需项：缺失即抛出单项问题（启动期由 assertEnv 汇总，运行期取值则是最后一道防线） */
const requireRaw = (name: string): string => {
  const raw = readRaw(name);
  if (raw === undefined) throw new EnvError([`缺少 ${name} 环境变量`]);
  return raw;
};

/** 正整数项：非法值明确报错，不让 Number() 静默产出 NaN 混进连接池参数 */
const readCount = (name: string, fallback: number): number => {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EnvError([`${name} 非法：${raw}（应为大于 0 的整数）`]);
  }
  return parsed;
};

const resolveDatabaseUrl = (): string => requireRaw("DATABASE_URL");

const resolveJwtSecret = (): string => {
  const secret = requireRaw("JWT_SECRET");
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new EnvError([
      `JWT_SECRET 非法：至少 ${JWT_SECRET_MIN_LENGTH} 个字符（当前 ${secret.length} 个）`,
    ]);
  }
  return secret;
};

const resolveStorageDir = (): string => requireRaw("STORAGE_DIR");

const resolveLogLevel = (): LogLevel => {
  const raw = readRaw("LOG_LEVEL");
  if (raw === undefined) return DEFAULTS.logLevel;
  const level = raw.toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw new EnvError([`LOG_LEVEL 非法：${raw}（可选 ${LOG_LEVELS.join(" / ")}）`]);
  }
  return level as LogLevel;
};

const resolvePort = (): number => readCount("PORT", DEFAULTS.port);

const resolveNodeEnv = (): string => {
  const raw = readRaw("NODE_ENV");
  if (raw === undefined) return DEFAULTS.nodeEnv;
  if (!(NODE_ENVS as readonly string[]).includes(raw)) {
    throw new EnvError([`NODE_ENV 非法：${raw}（可选 ${NODE_ENVS.join(" / ")}）`]);
  }
  return raw;
};

/** 敏感配置主密钥：支持 32 字节的 Base64 或 64 位十六进制；未设置＝不启用敏感配置加密 */
const resolveConfigEncryptionKey = (): Buffer | undefined => {
  const raw = readRaw("CONFIG_ENCRYPTION_KEY");
  if (raw === undefined) return undefined;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== CONFIG_KEY_BYTES) {
    throw new EnvError([
      `CONFIG_ENCRYPTION_KEY 非法：必须是 ${CONFIG_KEY_BYTES} 字节的 Base64 或 64 位十六进制字符串`,
    ]);
  }
  return key;
};

/** 认证 Cookie 的 Secure 标志：未设置＝按生产环境推断；显式设置只认 true / false */
const resolveCookieSecure = (): boolean => {
  const raw = readRaw("COOKIE_SECURE");
  if (raw === undefined) return resolveNodeEnv() === "production";
  if (raw !== "true" && raw !== "false") {
    throw new EnvError([
      `COOKIE_SECURE 非法：${raw}（只接受 true / false；未设置时按 NODE_ENV 推断）`,
    ]);
  }
  return raw === "true";
};

/**
 * 中继的 ingress 父域（如 `relay.example.com`）：设了才启用「按 `<设备 id>.<父域>` 认设备」的回灌路由。
 * 不设即为只跑控制面（登录、设备管理、后续的模型端点），不影响隧道本身建立。
 */
const resolveBaseDomain = (): string | null => {
  const raw = readRaw("HUB_BASE_DOMAIN");
  if (raw === undefined) return null;
  const domain = raw.toLowerCase();
  if (!domain.includes(".") || domain.includes("/") || domain.includes(":")) {
    throw new EnvError([
      `HUB_BASE_DOMAIN 非法：${raw}（只写域名本身，如 relay.example.com，不带协议/端口/路径）`,
    ]);
  }
  return domain;
};

/** 运行期配置：字段口径见各自注释，取值按当前 process.env 现读 */
export type HubEnv = {
  /** SQLite 库文件路径（相对路径按进程 cwd 解析，`:memory:` 为内存库） */
  readonly databaseUrl: string;
  /** JWT 签名密钥（HS256 签名与校验共用） */
  readonly jwtSecret: string;
  /** 数据存储根目录：日志、上传文件、监控采样都在其下（相对路径按进程 cwd 解析） */
  readonly storageDir: string;
  /** 日志级别：文件流跟随它，控制台流在此基础上按环境收窄 */
  readonly logLevel: LogLevel;
  /** 监听端口：Nitro 运行时读同名环境变量，这里只负责校验与默认值 */
  readonly port: number;
  /** 运行环境（development / production / test） */
  readonly nodeEnv: string;
  /** 是否生产环境：迁移缺目录即失败、错误脱敏、Cookie Secure 默认值等分流依据 */
  readonly isProduction: boolean;
  /** 敏感系统配置主密钥（已解码的 32 字节）；未设置表示不启用加密 */
  readonly configEncryptionKey: Buffer | undefined;
  /** 认证 Cookie 是否带 Secure 标志 */
  readonly cookieSecure: boolean;
  /** ingress 父域；为 null 表示不启用按设备子域的回灌路由 */
  readonly baseDomain: string | null;
};

/** 运行期配置取值点：缺必需项或取值非法即抛 EnvError */
export const env: HubEnv = {
  get databaseUrl() {
    return resolveDatabaseUrl();
  },
  get jwtSecret() {
    return resolveJwtSecret();
  },
  get storageDir() {
    return resolveStorageDir();
  },
  get logLevel() {
    return resolveLogLevel();
  },
  get port() {
    return resolvePort();
  },
  get nodeEnv() {
    return resolveNodeEnv();
  },
  get isProduction() {
    return resolveNodeEnv() === "production";
  },
  get configEncryptionKey() {
    return resolveConfigEncryptionKey();
  },
  get cookieSecure() {
    return resolveCookieSecure();
  },
  get baseDomain() {
    return resolveBaseDomain();
  },
};

/** 启动期校验涉及的全部项：新增字段要一并登记，否则不会在启动期被拦下 */
const CHECKS: readonly (() => unknown)[] = [
  resolveDatabaseUrl,
  resolveJwtSecret,
  resolveStorageDir,
  resolveLogLevel,
  resolvePort,
  resolveNodeEnv,
  resolveConfigEncryptionKey,
  resolveCookieSecure,
  resolveBaseDomain,
];

/**
 * 校验全部配置项，返回问题清单（空数组＝通过）
 * 一次报全而不是遇到第一个就抛：新环境漏配往往成组出现，逐个重启试错的代价更高
 */
export const validateEnv = (): string[] => {
  const problems: string[] = [];
  for (const check of CHECKS) {
    try {
      check();
    } catch (error) {
      if (error instanceof EnvError) {
        problems.push(...error.problems);
      } else {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return problems;
};

/** 启动期校验：不通过即抛 EnvError（本模块不碰进程，打印与退出码由入口负责） */
export const assertEnv = (): void => {
  const problems = validateEnv();
  if (problems.length > 0) throw new EnvError(problems);
};
