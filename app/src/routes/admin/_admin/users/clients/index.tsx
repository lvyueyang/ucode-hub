/**
 * 客户端用户管理页面：CRUD + 状态管理 + 密码重置
 * 列表骨架 / 查询状态 / 分页排序统一走 AdminListPage + useListQuery
 */
import { PlusOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable, withDisabledReason } from "@ucode/hub-ui-spa/table";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Button, Form, Input, Select, Switch } from "antd";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import {
  AdminFilters,
  AdminFormModal,
  AdminListPage,
  DictSelect,
  FORM_MODAL_WIDTH,
  useAdminAuth,
} from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import type { ClientRoleRecord } from "#/services/client-role/client-role.server";
import type { ClientUserListItem } from "#/services/client-user/client-user.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import {
  createSFn,
  deleteSFn,
  getClientRolesForSelectSFn,
  getListSFn,
  resetPwdSFn,
  updateSFn,
} from "./-mods/clients.functions";
import { clientUserColumns } from "./-mods/clientUserColumns";

const NO_CREATE_PERMISSION = "无「创建客户端用户」权限";

/** 列表筛选条件 */
interface ClientUserFilters {
  keyword?: string;
}

export const Route = createFileRoute("/admin/_admin/users/clients/")({
  component: ClientsPage,
  loader: async () => {
    const [result, roles] = await Promise.all([
      getListSFn({ data: {} }),
      getClientRolesForSelectSFn(),
    ]);
    return { result, roles };
  },
});

function ClientsPage() {
  const initial = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [roles] = useState<ClientRoleRecord[]>(initial.roles);
  const [keyword, setKeyword] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ClientUserListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const list = useListQuery<ClientUserListItem, ClientUserFilters>({
    initial: initial.result,
    initialFilters: { keyword: undefined },
    errorMessage: "加载客户端用户列表失败",
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getListSFn({
          data: {
            page,
            pageSize,
            sortField,
            sortOrder,
            keyword: filters.keyword,
          },
        }),
      [],
    ),
  });

  const permissions = {
    create: hasPermission(ADMIN_PERMISSIONS.CLIENT_CREATE),
    edit: hasPermission(ADMIN_PERMISSIONS.CLIENT_EDIT),
    delete: hasPermission(ADMIN_PERMISSIONS.CLIENT_DELETE),
  };

  /** 关键词搜索（回到第一页） */
  const handleSearch = () => {
    list.applyFilters({ keyword: keyword.trim() || undefined });
  };

  const handleReset = () => {
    setKeyword("");
    list.applyFilters({ keyword: undefined });
  };

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: ClientUserListItem) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      clientRoleIds: record.clientRoleIds,
      status: record.status,
      emailVerified: record.emailVerified,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingUser) {
        await callSfn(
          updateSFn({
            data: { id: editingUser.id, ...values },
          }),
        );
        message.success("用户信息已更新");
      } else {
        await callSfn(createSFn({ data: values }));
        message.success("用户已创建");
      }
      setModalOpen(false);
      await list.reload();
    } catch {
      // 表单校验由 antd 提示，SFn 失败由 callSfn 统一提示
    } finally {
      setSaving(false);
    }
  };

  /** 删除客户端用户（失败由统一出口提示） */
  const handleDelete = async (record: ClientUserListItem) => {
    const [, err] = await sfnUnwrap(deleteSFn({ data: { id: record.id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("用户已删除");
    await list.reload();
  };

  const handleResetPwd = (record: ClientUserListItem) => {
    setEditingUser(record);
    pwdForm.resetFields();
    setPwdModalOpen(true);
  };

  const handlePwdSubmit = async () => {
    if (!editingUser) {
      message.warning("请先选择要重置密码的用户");
      return;
    }
    try {
      const values = await pwdForm.validateFields();
      await callSfn(
        resetPwdSFn({
          data: { id: editingUser.id, password: values.password },
        }),
      );
      message.success("密码已重置");
      setPwdModalOpen(false);
    } catch {
      // 表单校验由 antd 提示，SFn 失败由 callSfn 统一提示
    }
  };

  const columns = clientUserColumns({
    sortProps: list.sortProps,
    onEdit: handleEdit,
    onResetPwd: handleResetPwd,
    onDelete: handleDelete,
    permissions: { edit: permissions.edit, delete: permissions.delete },
  });

  return (
    <AdminListPage
      title="客户端用户管理"
      description="管理前台注册用户账号与状态"
      extra={withDisabledReason(
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!permissions.create}
          onClick={handleCreate}
        >
          新建用户
        </Button>,
        !permissions.create,
        NO_CREATE_PERMISSION,
      )}
      filters={
        <AdminFilters onReset={handleReset}>
          <Input.Search
            placeholder="搜索用户名或邮箱..."
            value={keyword}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            allowClear
            style={{ width: 260 }}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无用户" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />

      {/* 创建/编辑弹窗 */}
      <AdminFormModal
        entityName="用户"
        id={editingUser?.id}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onOk={handleSubmit}
        submitting={saving}
        width={FORM_MODAL_WIDTH.base}
      >
        <Form form={form} layout="vertical">
          <AutofillBlocker />
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "请输入有效的邮箱地址" },
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="clientRoleIds" label="角色">
            <Select
              mode="multiple"
              placeholder="选择角色（可多选）"
              options={roles.map((r) => ({
                label: r.name,
                value: r.id,
              }))}
            />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 6, message: "密码至少 6 个字符" },
              ]}
            >
              <Input.Password placeholder="至少 6 位" />
            </Form.Item>
          )}
          {editingUser && (
            <>
              <Form.Item name="status" label="状态">
                <DictSelect dictSlug="user_status" />
              </Form.Item>
              <Form.Item name="emailVerified" label="邮箱验证" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
        </Form>
      </AdminFormModal>

      {/* 重置密码弹窗 */}
      <AdminFormModal
        title={`重置密码 — ${editingUser?.username}`}
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
        onOk={handlePwdSubmit}
        width={FORM_MODAL_WIDTH.sm}
      >
        <Form form={pwdForm} layout="vertical">
          <AutofillBlocker />
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码至少 6 个字符" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        </Form>
      </AdminFormModal>
    </AdminListPage>
  );
}
