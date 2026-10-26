/**
 * 管理员登录页面：登录前校验系统是否已初始化
 */
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Button, Form, Input } from "antd";
import { useState } from "react";
import { checkInitStatusSFn } from "#/services/init/init.functions";
import { callSfn } from "#/utils/sfn-error";
import { adminLoginSFn } from "./-mods/login.functions";

export const Route = createFileRoute("/admin/login/")({
  beforeLoad: async () => {
    const initialized = await checkInitStatusSFn();
    if (!initialized) {
      throw redirect({ to: "/admin/init" });
    }
  },
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const result = await callSfn(adminLoginSFn({ data: values }));
      if (!result.success) {
        message.error(result.message || "登录失败");
        return;
      }
      navigate({ to: "/admin" });
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
          <h1 className="mb-6 text-center text-2xl font-bold">管理后台登录</h1>
          <div className="mb-3 text-center">
            <a
              href="/admin/forgot-password"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              忘记密码？
            </a>
          </div>
          <Form form={form} onFinish={handleSubmit} size="large" autoComplete="off">
            <AutofillBlocker />
            <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}
