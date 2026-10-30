/**
 * 验证码模块：生成、发送、校验验证码
 */
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "#/db/index";
import { captchaCode } from "#/db/schema";
import { logger } from "#/shared-services/logger";
import { sendCaptchaMail } from "#/shared-services/mail";
import { sendSms } from "#/shared-services/sms";
import { create } from "./captcha";

/** 验证码有效期（5 分钟） */
const CAPTCHA_EXPIRE_MINUTES = 5;
/** 发送频率限制（60 秒） */
const SEND_INTERVAL_SECONDS = 60;
/** 图片验证码有效期（3 分钟） */
const IMAGE_CAPTCHA_EXPIRE_MINUTES = 3;
/** 单条验证码允许的失败次数：达到即作废，避免短码被反复尝试 */
const MAX_VERIFY_ATTEMPTS = 5;

/** 图片验证码生成配置 */
const CAPTCHA_OPTIONS = {
  size: 4,
  noise: 3,
  color: true,
  fontSize: 48,
  width: 120,
  height: 42,
  ignoreChars: "0oO1iIlL",
} as const;

/**
 * 生成 6 位随机数字验证码
 * 必须用 CSPRNG：Math.random 的状态可从少量输出反推，这种短凭证不能靠它
 */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function sendCaptcha(
  type: "email" | "sms",
  target: string,
): Promise<{ success: boolean; message: string }> {
  // 检查发送频率
  const [recentCode] = await db
    .select()
    .from(captchaCode)
    .where(
      and(
        eq(captchaCode.type, type),
        eq(captchaCode.target, target),
        gt(captchaCode.createdAt, new Date(Date.now() - SEND_INTERVAL_SECONDS * 1000)),
      ),
    )
    .limit(1);

  if (recentCode) {
    return { success: false, message: "发送过于频繁，请稍后再试" };
  }

  // 发新码即作废旧码：否则同一 target 会并存多条有效码，命中概率按条数放大
  await db
    .update(captchaCode)
    .set({ used: true })
    .where(
      and(eq(captchaCode.type, type), eq(captchaCode.target, target), eq(captchaCode.used, false)),
    );

  // 生成验证码
  const code = generateCode();
  const expiredAt = new Date(Date.now() + CAPTCHA_EXPIRE_MINUTES * 60 * 1000);

  // 存入数据库
  await db.insert(captchaCode).values({
    type,
    target,
    code,
    expiredAt,
  });

  // 发送验证码
  if (type === "email") {
    const sent = await sendCaptchaMail(target, code);
    if (!sent) {
      return { success: false, message: "邮件发送失败" };
    }
  } else {
    try {
      await sendSms(target, code);
    } catch (err) {
      const message = err instanceof Error ? err.message : "短信发送失败";
      // target 为邮箱/手机号（PII），只记类型
      logger.warn({ type, error: message }, "短信发送失败");
      return { success: false, message };
    }
  }

  // 每次发送必现，按「per-call 一律禁 info」记为 debug；target 为 PII，只记类型
  logger.debug({ type }, "验证码发送成功");
  return { success: true, message: "验证码已发送" };
}

export async function verifyCaptcha(
  type: "email" | "sms",
  target: string,
  code: string,
): Promise<boolean> {
  const [record] = await db
    .select()
    .from(captchaCode)
    .where(
      and(
        eq(captchaCode.type, type),
        eq(captchaCode.target, target),
        eq(captchaCode.used, false),
        gt(captchaCode.expiredAt, new Date()),
      ),
    )
    .orderBy(desc(captchaCode.createdAt))
    .limit(1);

  if (!record) return false;

  if (record.code !== code) {
    const attempts = record.attempts + 1;
    // 达到上限即作废该码：六位码 + 无限重试等于没有验证码
    await db
      .update(captchaCode)
      .set(attempts >= MAX_VERIFY_ATTEMPTS ? { attempts, used: true } : { attempts })
      .where(eq(captchaCode.id, record.id));
    return false;
  }

  // 标记为已使用
  await db.update(captchaCode).set({ used: true }).where(eq(captchaCode.id, record.id));

  return true;
}

/**
 * 生成图片验证码：生成 SVG + 落库，返回 token 与 SVG 数据
 */
export async function createImageCaptcha(): Promise<{
  token: string;
  svg: string;
}> {
  const { data: svg, text } = create(CAPTCHA_OPTIONS);
  const token = randomUUID();
  const expiredAt = new Date(Date.now() + IMAGE_CAPTCHA_EXPIRE_MINUTES * 60 * 1000);

  await db.insert(captchaCode).values({
    type: "image",
    target: token,
    code: text.toLowerCase(),
    expiredAt,
  });

  logger.debug({ token }, "图片验证码已生成");
  return { token, svg };
}

/**
 * 校验图片验证码：校验通过后标记已使用，返回是否成功
 */
export async function verifyImageCaptcha(imageToken: string, imageCode: string): Promise<boolean> {
  const [record] = await db
    .select()
    .from(captchaCode)
    .where(
      and(
        eq(captchaCode.type, "image"),
        eq(captchaCode.target, imageToken),
        eq(captchaCode.code, imageCode.toLowerCase().trim()),
        eq(captchaCode.used, false),
        gt(captchaCode.expiredAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) return false;

  await db.update(captchaCode).set({ used: true }).where(eq(captchaCode.id, record.id));

  logger.debug({ token: imageToken }, "图片验证码校验通过");
  return true;
}
