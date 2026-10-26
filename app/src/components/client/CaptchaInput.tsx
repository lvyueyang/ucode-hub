/**
 * 邮箱验证码组件（app 业务壳）：验证码输入 + 获取验证码按钮（弹窗图片验证码）
 * 图片验证码弹窗在 @ucode/hub-ui-ssr/form，此处注入项目 SFn 与消息回调
 */

import { ImageCaptchaModal } from "@ucode/hub-ui-ssr/form";
import { Button, Input } from "@ucode/hub-ui-ssr/ui";
import { useCallback, useState } from "react";
import {
  getImageCaptchaSFn,
  sendCaptchaWithImageVerificationSFn,
} from "#/services/captcha/captcha.functions";
import { callSfn } from "#/utils/sfn-error";

interface CaptchaInputProps {
  /** 邮箱地址 */
  email: string;
  /** 邮箱验证码值 */
  value: string;
  /** 邮箱验证码变化回调 */
  onChange: (value: string) => void;
  /** 消息回调 */
  onMessage: (msg: string) => void;
}

export function CaptchaInput({ email, value, onChange, onMessage }: CaptchaInputProps) {
  const [modalOpen, setModalOpen] = useState(false);

  /** 获取图片验证码（svg + token）：失败由 callSfn 统一提示 */
  const getCaptcha = useCallback(async () => {
    return callSfn(getImageCaptchaSFn());
  }, []);

  /** 校验图片验证码并发送邮箱验证码 */
  const verify = useCallback(
    async (token: string, code: string) => {
      if (!email) {
        return { success: false, message: "请先输入邮箱" };
      }
      return callSfn(
        sendCaptchaWithImageVerificationSFn({
          data: { email, imageToken: token, imageCode: code },
        }),
      );
    },
    [email],
  );

  return (
    <>
      {/* 邮箱验证码输入 + 获取验证码按钮 */}
      <div className="flex gap-2">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="邮箱验证码"
          maxLength={6}
          className="flex-1"
          autoComplete="off"
          aria-label="邮箱验证码"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => setModalOpen(true)}
        >
          获取验证码
        </Button>
      </div>

      {/* 图片验证码弹窗 */}
      <ImageCaptchaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        getCaptcha={getCaptcha}
        verify={verify}
        onMessage={onMessage}
      />
    </>
  );
}
