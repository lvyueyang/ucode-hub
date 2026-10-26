/**
 * 管理端设备管理页：列表 + 改名 / 吊销 / 删除
 * 列表骨架 / 查询状态 / 分页排序统一走 AdminListPage + useListQuery
 */
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable } from "@ucode/hub-ui-spa/table";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Form, Input, Select } from "antd";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import {
  AdminFilters,
  AdminFormModal,
  AdminListPage,
  FORM_MODAL_WIDTH,
  useAdminAuth,
} from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import type { DeviceListItem } from "#/services/device/device.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import { deviceColumns } from "./-mods/deviceColumns";
import {
  deleteDeviceSFn,
  getDeviceListSFn,
  renameDeviceSFn,
  revokeDeviceSFn,
} from "./-mods/devices.functions";

/** 列表筛选条件（状态、归属端的「全部」用 undefined 表达） */
interface DeviceFilters {
  keyword?: string;
  status?: "active" | "revoked";
  ownerType?: "admin" | "client";
}

const STATUS_FILTER_OPTIONS = [
  { label: "正常", value: "active" },
  { label: "已吊销", value: "revoked" },
];

const OWNER_TYPE_FILTER_OPTIONS = [
  { label: "管理端", value: "admin" },
  { label: "客户端", value: "client" },
];

export const Route = createFileRoute("/admin/_admin/devices/")({
  component: DevicesPage,
  loader: async () => getDeviceListSFn({ data: {} }),
});

function DevicesPage() {
  const initial = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [keyword, setKeyword] = useState("");
  const [renameTarget, setRenameTarget] = useState<DeviceListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const list = useListQuery<DeviceListItem, DeviceFilters>({
    initial,
    initialFilters: { keyword: undefined, status: undefined, ownerType: undefined },
    errorMessage: "加载设备列表失败",
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getDeviceListSFn({
          data: { page, pageSize, sortField, sortOrder, ...filters },
        }),
      [],
    ),
  });

  const permissions = {
    update: hasPermission(ADMIN_PERMISSIONS.DEVICE_UPDATE),
    revoke: hasPermission(ADMIN_PERMISSIONS.DEVICE_REVOKE),
    delete: hasPermission(ADMIN_PERMISSIONS.DEVICE_DELETE),
  };

  /** 关键词搜索（回到第一页） */
  const handleSearch = () => {
    list.applyFilters({ keyword: keyword.trim() || undefined });
  };

  const handleReset = () => {
    setKeyword("");
    list.applyFilters({ keyword: undefined, status: undefined, ownerType: undefined });
  };

  const handleRename = (record: DeviceListItem) => {
    setRenameTarget(record);
    form.setFieldsValue({ name: record.name });
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await callSfn(renameDeviceSFn({ data: { id: renameTarget.id, name: values.name } }));
      message.success("设备已改名");
      setRenameTarget(null);
      await list.reload();
    } catch {
      // 表单校验由 antd 提示，SFn 失败由 callSfn 统一提示
    } finally {
      setSaving(false);
    }
  };

  /** 吊销（失败由统一出口提示） */
  const handleRevoke = async (record: DeviceListItem) => {
    const [, err] = await sfnUnwrap(revokeDeviceSFn({ data: { id: record.id } }), {
      error: "吊销失败",
    });
    if (err) return;
    message.success("设备已吊销");
    await list.reload();
  };

  /** 删除（失败由统一出口提示） */
  const handleDelete = async (record: DeviceListItem) => {
    const [, err] = await sfnUnwrap(deleteDeviceSFn({ data: { id: record.id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("设备已删除");
    await list.reload();
  };

  const columns = deviceColumns({
    sortProps: list.sortProps,
    onRename: handleRename,
    onRevoke: handleRevoke,
    onDelete: handleDelete,
    permissions,
  });

  return (
    <AdminListPage
      title="设备管理"
      description="已登记的 UCode 实例：在线态、令牌状态与归属用户"
      filters={
        <AdminFilters onReset={handleReset}>
          <Input.Search
            placeholder="搜索设备名..."
            value={keyword}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            allowClear
            style={{ width: 260 }}
          />
          <Select
            placeholder="状态"
            value={list.filters.status}
            onChange={(value?: DeviceFilters["status"]) => list.applyFilters({ status: value })}
            options={STATUS_FILTER_OPTIONS}
            allowClear
            style={{ width: 120 }}
          />
          <Select
            placeholder="归属端"
            value={list.filters.ownerType}
            onChange={(value?: DeviceFilters["ownerType"]) =>
              list.applyFilters({ ownerType: value })
            }
            options={OWNER_TYPE_FILTER_OPTIONS}
            allowClear
            style={{ width: 120 }}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无设备" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />

      {/* 改名弹窗 */}
      <AdminFormModal
        title={`改名 — ${renameTarget?.name ?? ""}`}
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        onOk={handleRenameSubmit}
        submitting={saving}
        width={FORM_MODAL_WIDTH.sm}
      >
        <Form form={form} layout="vertical">
          <AutofillBlocker />
          <Form.Item
            name="name"
            label="设备名"
            rules={[
              { required: true, message: "请输入设备名" },
              { max: 100, message: "设备名不能超过 100 个字符" },
            ]}
          >
            <Input placeholder="设备名" />
          </Form.Item>
        </Form>
      </AdminFormModal>
    </AdminListPage>
  );
}
