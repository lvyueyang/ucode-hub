/**
 * JWT 模块（shared-services）：签发和校验 access token
 * createJwt 工厂注入密钥与日志实例；jwt 单例的密钥取自 env 模块
 * Cookie 名称约定由宿主应用持有（见 app/src/constants/cookie-names.ts）
 */
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { env } from "#/env";
import { type Logger, logger } from "#/shared-services/logger";

/** JWT 载荷 schema：签名通过后仍需校验结构，避免断言放开 userType */
export const jwtPayloadSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  /** admin 或 client */
  userType: z.enum(["admin", "client"]),
  /** 令牌版本：与用户表的 token_version 比对，改密 / 被重置 / 登出时自增即作废旧令牌 */
  v: z.number().int().min(0),
});

/** JWT 载荷 */
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

/**
 * Access Token 有效期：24 小时。
 * 撤销靠载荷里的令牌版本（改密 / 被重置 / 登出即自增），有效期只是兜底上限。
 */
const ACCESS_TOKEN_EXPIRES = "24h";

/** JWT 签发/校验模块 */
export interface JwtModule {
  /** 签发 JWT Token */
  signToken(payload: JwtPayload): Promise<string>;
  /** 校验 JWT Token，无效返回 null */
  verifyToken(token: string): Promise<JwtPayload | null>;
}

/**
 * 创建 JWT 签发/校验模块
 * @param opts.secret JWT 密钥
 * @param opts.logger 日志实例
 */
export function createJwt(opts: { secret: string; logger: Logger }): JwtModule {
  const key = new TextEncoder().encode(opts.secret);

  return {
    async signToken(payload: JwtPayload): Promise<string> {
      // 运行时校验密钥，保证 fail-fast 且不阻断模块加载
      if (!opts.secret) {
        throw new Error("环境变量 JWT_SECRET 未配置，无法签发 JWT Token");
      }
      return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_EXPIRES)
        .sign(key);
    },
    async verifyToken(token: string): Promise<JwtPayload | null> {
      try {
        const { payload } = await jwtVerify(token, key);
        const parsed = jwtPayloadSchema.safeParse(payload);
        if (!parsed.success) {
          // 签名有效但载荷结构非法（如 userType 被篡改），按无效 token 处理
          opts.logger.debug({ issues: parsed.error.issues.length }, "JWT 载荷结构非法");
          return null;
        }
        return parsed.data;
      } catch (err) {
        opts.logger.debug({ error: (err as Error).message }, "JWT 校验失败");
        return null;
      }
    },
  };
}

/** 应用级 JWT 模块：密钥由 env 提供 */
export const jwt: JwtModule = createJwt({
  secret: env.jwtSecret,
  logger,
});
