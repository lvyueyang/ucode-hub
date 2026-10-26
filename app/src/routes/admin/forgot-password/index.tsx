/**
 * 管理员忘记密码页面：通过邮箱验证码重置密码
 */
import { LockOutlined, MailOutlined, ReloadOutlined } from "@ant-design/icons";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import type { InputRef } from "antd";
import { Button, Form, Input, Modal } from "antd";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { getCurrentAdminSFn } from "#/services/admin-auth/admin-auth.functions";
import {
  getImageCaptchaSFn,
  sendCaptchaWithImageVerificationSFn,
} from "#/services/captcha/captcha.functions";
import { checkInitStatusSFn } from "#/services/init/init.functions";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { type resetPwdSchema, resetPwdSFn } from "./-mods/forgot-password.functions";

export const Route = createFileRoute("/admin/forgot-password/")({
  beforeLoad: async () => {
    const initialized = await checkInitStatusSFn();
    if (!initialized) {
      throw redirect({ to: "/admin/init" });
    }
    const user = await getCurrentAdminSFn();
    if (user) {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminForgotPasswordPage,
});

function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 图片验证码弹窗
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [svg, setSvg] = useState("");
  const [imageToken, setImageToken] = useState("");
  const [imageCode, setImageCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [captchaError, setCaptchaError] = useState("");
  const imageInputRef = useRef<InputRef>(null);

  // 倒计时
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  /** 刷新图片验证码 */
  const refreshCaptcha = useCallback(() => {
    setCaptchaError("");
    // 加载失败以内联提示为主，静默处理避免与统一提示重复
    void sfnUnwrap(getImageCaptchaSFn(), { silent: true }).then(([r]) => {
      if (!r) {
        setCaptchaError("加载验证码失败");
        return;
      }
      setSvg(r.svg);
      setImageToken(r.token);
      setImageCode("");
    });
  }, []);

  /** 打开弹窗 */
  const openCaptcha = useCallback(() => {
    const email = form.getFieldValue("email");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning("请先输入正确的邮箱地址");
      return;
    }
    setCaptchaOpen(true);
    refreshCaptcha();
  }, [form, refreshCaptcha]);

  /** 弹窗内确认发送验证码 */
  const handleSendCode = useCallback(async () => {
    if (!imageCode) {
      setCaptchaError("请输入图片验证码");
      return;
    }
    setCaptchaError("");
    setSendingCode(true);
    try {
      const email = form.getFieldValue("email");
      const [result] = await sfnUnwrap(
        sendCaptchaWithImageVerificationSFn({
          data: { email, imageToken, imageCode },
        }),
        // 失败以内联提示为主，静默处理避免与统一提示重复
        { silent: true },
      );
      if (!result) {
        setCaptchaError("请求失败，请重试");
        refreshCaptcha();
        return;
      }
      if (result.success) {
        message.success("验证码已发送，请查收邮箱");
        setCountdown(60);
        setCaptchaOpen(false);
      } else {
        setCaptchaError(result.message);
        refreshCaptcha();
      }
    } finally {
      setSendingCode(false);
    }
  }, [form, imageToken, imageCode, refreshCaptcha]);

  // 弹窗自动聚焦
  useEffect(() => {
    if (captchaOpen) {
      setTimeout(() => imageInputRef.current?.focus(), 100);
    }
  }, [captchaOpen]);

  const handleSubmit = async (values: z.infer<typeof resetPwdSchema>) => {
    setLoading(true);
    try {
      const result = await callSfn(resetPwdSFn({ data: values }));
      if (!result.success) {
        message.error(result.message || "重置失败");
        return;
      }
      message.success(result.message);
      navigate({ to: "/admin/login" });
    } catch {
      // callSfn 已统一提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-secondary">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="mb-6 text-center text-2xl font-bold">重置管理密码</h1>
          <Form form={form} onFinish={handleSubmit} size="large" autoComplete="off">
            <AutofillBlocker />
            <Form.Item
              name="email"
              rules={[
                { required: true, message: "请输入邮箱" },
                { type: "email", message: "邮箱格式不正确" },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="管理员邮箱" />
            </Form.Item>

            <Form.Item>
              <div className="flex gap-2">
                <Form.Item
                  name="captcha"
                  noStyle
                  rules={[{ required: true, message: "请输入验证码" }]}
                >
                  <Input placeholder="邮箱验证码" maxLength={6} />
                </Form.Item>
                <Button
                  type="primary"
                  ghost
                  className="shrink-0"
                  disabled={countdown > 0}
                  onClick={openCaptcha}
                >
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </Button>
              </div>
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: "请输入新密码" },
                { min: 6, message: "密码至少 6 位" },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="新密码（至少 6 位）" />
            </Form.Item>

            <Form.Item name="confirmPassword" rules={[{ required: true, message: "请确认新密码" }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="再次输入新密码" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                重置密码
              </Button>
            </Form.Item>
          </Form>

          <div className="text-center">
            {/* 使用 a 标签跳转，避免路由类型问题 */}
            <a
              href="/admin/login"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              返回登录
            </a>
          </div>
        </div>
      </div>

      <Modal
        title="图片验证码"
        open={captchaOpen}
        onCancel={() => setCaptchaOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCaptchaOpen(false)}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={sendingCode}
            disabled={!imageCode}
            onClick={handleSendCode}
          >
            确定
          </Button>,
        ]}
        destroyOnHidden
      >
        <div className="flex flex-col items-center gap-3">
          {captchaError && (
            <div className="w-full rounded bg-red-50 px-3 py-1.5 text-center text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {captchaError}
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* 点击刷新：用 button 承载点击，静态元素挂 onClick 键盘不可达 */}
            <button
              type="button"
              className="flex h-10 w-[120px] cursor-pointer items-center justify-center overflow-hidden rounded border bg-background"
              onClick={refreshCaptcha}
              title="点击刷新"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={refreshCaptcha}
              title="刷新验证码"
            />
            <Input
              ref={imageInputRef}
              value={imageCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImageCode(e.target.value)}
              onPressEnter={handleSendCode}
              placeholder="图片验证码"
              maxLength={4}
              autoComplete="off"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
