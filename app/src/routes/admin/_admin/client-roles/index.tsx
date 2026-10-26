/**
 * 客户端角色管理页面：CRUD + 权限分配
 * 列表骨架 / 查询状态 / 分页排序统一走 AdminListPage + useListQuery
 */
import { PlusOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable, withDisabledReason } from "@ucode/hub-ui-spa/table";
import { Button, Form, Input } from "antd";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import {
  AdminFilters,
  AdminFormModal,
  AdminListPage,
  FORM_MODAL_WIDTH,
  PermissionSelector,
  useAdminAuth,
} from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { CLIENT_PERMISSIONS_BY_GROUP } from "#/permissions/client-permissions";
import type { ClientRoleRecord } from "#/services/client-role/client-role.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import {
  createClientRoleSFn,
  deleteClientRoleSFn,
  getClientRolesSFn,
  updateClientRoleSFn,
} from "./-mods/client-roles.functions";
import { clientRoleColumns } from "./-mods/clientRoleColumns";

const NO_CREATE_PERMISSION = "无「创建客户端角色」权限";

/** 列表筛选条件 */
interface ClientRoleFilters {
  keyword?: string;
}

export const Route = createFileRoute("/admin/_admin/client-roles/")({
  component: ClientRolesPage,
  loader: async () => getClientRolesSFn({ data: {} }),
});

function ClientRolesPage() {
  const initialData = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [keyword, setKeyword] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ClientRoleRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const list = useListQuery<ClientRoleRecord, ClientRoleFilters>({
    initial: initialData,
    initialFilters: { keyword: undefined },
    errorMessage: "加载客户端角色列表失败",
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getClientRolesSFn({
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
    create: hasPermission(ADMIN_PERMISSIONS.CLIENT_ROLE_CREATE),
    edit: hasPermission(ADMIN_PERMISSIONS.CLIENT_ROLE_EDIT),
    delete: hasPermission(ADMIN_PERMISSIONS.CLIENT_ROLE_DELETE),
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
    setEditingRole(null);
    form.resetFields();
    form.setFieldsValue({ permissions: [] });
    setModalOpen(true);
  };

  const handleEdit = (record: ClientRoleRecord) => {
    setEditingRole(record);
    form.setFieldsValue({
      name: record.name,
      slug: record.slug,
      description: record.description ?? "",
      permissions: record.permissions ?? [],
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingRole) {
        await callSfn(updateClientRoleSFn({ data: { id: editingRole.id, ...values } }));
        message.success("角色已更新");
      } else {
        await callSfn(createClientRoleSFn({ data: values }));
        message.success("角色已创建");
      }
      setModalOpen(false);
      await list.reload();
    } catch {
      // 表单校验由 antd 提示，SFn 失败由 callSfn 统一提示
    } finally {
      setSaving(false);
    }
  };

  /** 删除角色（失败由统一出口提示） */
  const handleDelete = async (record: ClientRoleRecord) => {
    const [, err] = await sfnUnwrap(deleteClientRoleSFn({ data: { id: record.id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("角色已删除");
    await list.reload();
  };

  const columns = clientRoleColumns({
    sortProps: list.sortProps,
    onEdit: handleEdit,
    onDelete: handleDelete,
    permissions: { edit: permissions.edit, delete: permissions.delete },
  });

  return (
    <AdminListPage
      title="客户端角色管理"
      description="管理客户端角色及其权限分配"
      extra={withDisabledReason(
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!permissions.create}
          onClick={handleCreate}
        >
          新建角色
        </Button>,
        !permissions.create,
        NO_CREATE_PERMISSION,
      )}
      filters={
        <AdminFilters onReset={handleReset}>
          <Input.Search
            placeholder="搜索角色名称或标识..."
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
        locale={{ emptyText: "暂无角色" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />

      {/* 创建/编辑弹窗 */}
      <AdminFormModal
        entityName="角色"
        id={editingRole?.id}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onOk={handleSubmit}
        submitting={saving}
        width={FORM_MODAL_WIDTH.wide}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: "请输入角色名称" }]}
          >
            <Input placeholder="如：会员" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="角色标识"
            rules={[{ required: true, message: "请输入角色标识" }]}
          >
            <Input placeholder="如：vip" disabled={!!editingRole} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="角色描述（可选）" />
          </Form.Item>
          <Form.Item name="permissions" label="权限分配">
            <PermissionSelector groups={CLIENT_PERMISSIONS_BY_GROUP} />
          </Form.Item>
        </Form>
      </AdminFormModal>
    </AdminListPage>
  );
}
