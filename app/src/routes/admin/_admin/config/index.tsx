/**
 * 系统配置管理页面：键值对 CRUD（左分组 + 右表格）
 * 表格数据为全量配置的前端过滤（分组统计需要全量），故保持本地筛选与分页
 */
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { JsonImportButton } from "@ucode/hub-ui-spa/json-import-button";
import { ProTable, withDisabledReason } from "@ucode/hub-ui-spa/table";
import { Button, Form, Input } from "antd";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import {
  AdminFilters,
  AdminListPage,
  AdminSplitPanel,
  SPLIT_PANEL_WIDTH,
  useAdminAuth,
} from "#/components/admin";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import type { ConfigRecord } from "#/shared-services/config/config.server";
import { downloadExport } from "#/utils/export-file";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { ConfigFormModal } from "./-mods/ConfigFormModal";
import {
  createConfigSFn,
  deleteConfigSFn,
  exportConfigsSFn,
  getConfigListSFn,
  importConfigsSFn,
  updateConfigSFn,
} from "./-mods/config.functions";
import { configColumns } from "./-mods/configColumns";

const UNGROUPED_KEY = "__ungrouped__";

export const Route = createFileRoute("/admin/_admin/config/")({
  component: ConfigPage,
  loader: async () => await getConfigListSFn(),
});

const NO_CREATE_PERMISSION = "无「创建配置」权限";

function ConfigPage() {
  const router = useRouter();
  const configs = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigRecord | null>(null);
  const [form] = Form.useForm();

  const permissions = {
    create: hasPermission(ADMIN_PERMISSIONS.CONFIG_CREATE),
    edit: hasPermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
    delete: hasPermission(ADMIN_PERMISSIONS.CONFIG_DELETE),
    export: hasPermission(ADMIN_PERMISSIONS.CONFIG_EXPORT),
    import: hasPermission(ADMIN_PERMISSIONS.CONFIG_IMPORT),
  };

  /** 从配置数据中提取分组列表 */
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const c of configs) {
      if (c.groupName) set.add(c.groupName);
      else set.add(UNGROUPED_KEY);
    }
    // 未分组排在最后
    const sorted = Array.from(set)
      .filter((g) => g !== UNGROUPED_KEY)
      .sort();
    if (set.has(UNGROUPED_KEY)) sorted.push(UNGROUPED_KEY);
    return ["全部", ...sorted];
  }, [configs]);

  /** 根据选中分组和搜索文本过滤配置 */
  const filteredConfigs = useMemo(() => {
    let result = configs;
    if (selectedGroup && selectedGroup !== "全部") {
      if (selectedGroup === UNGROUPED_KEY) result = result.filter((c) => !c.groupName);
      else result = result.filter((c) => c.groupName === selectedGroup);
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (c) =>
          c.key.toLowerCase().includes(lower) ||
          // 敏感配置值已脱敏，不参与值匹配
          (!c.isSecret && c.value.toLowerCase().includes(lower)) ||
          (c.description ?? "").toLowerCase().includes(lower),
      );
    }
    return result;
  }, [configs, selectedGroup, searchText]);

  /** 分组列表数据源 */
  const groupDataSource = useMemo(
    () =>
      groups.map((g) => ({
        key: g,
        name: g === UNGROUPED_KEY ? "未分组" : g,
        count:
          g === "全部"
            ? configs.length
            : g === UNGROUPED_KEY
              ? configs.filter((c) => !c.groupName).length
              : configs.filter((c) => c.groupName === g).length,
      })),
    [groups, configs],
  );

  const openModal = (record?: ConfigRecord) => {
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        key: record.key,
        // 敏感配置不回显密文，留空表示保留原值
        value: record.isSecret ? "" : record.value,
        isSecret: record.isSecret,
        clientVisible: record.clientVisible,
        valueType: record.valueType ?? undefined,
        groupName: record.groupName ?? undefined,
        description: record.description ?? undefined,
      });
    } else {
      setEditing(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  /** 关闭弹窗并清理表单 */
  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await callSfn(
          updateConfigSFn({
            data: {
              id: editing.id,
              valueType: values.valueType,
              groupName: values.groupName,
              description: values.description,
              clientVisible: values.clientVisible,
              // 敏感配置留空表示保留原密文（undefined 不覆盖 value）
              value: editing.isSecret && !values.value ? undefined : values.value,
            },
          }),
        );
        message.success("配置更新成功");
      } else {
        await callSfn(createConfigSFn({ data: values }));
        message.success("配置创建成功");
      }
      closeModal();
      router.invalidate();
    } catch {
      // 表单校验由 antd 提示，SFn 失败由 callSfn 统一提示
    }
  };

  const handleDelete = async (record: ConfigRecord) => {
    const [, err] = await sfnUnwrap(deleteConfigSFn({ data: { id: record.id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("已删除");
    router.invalidate();
  };

  /** 导出系统配置数据（JSON） */
  const handleExportConfigs = async () => {
    if (await downloadExport(exportConfigsSFn(), { name: "configs_export" })) {
      message.success("导出完成");
    }
  };

  const configColumnsDef = configColumns({
    onEdit: openModal,
    onDelete: handleDelete,
    permissions,
  });

  return (
    <AdminListPage
      title="系统配置"
      description={`维护系统键值配置，敏感项值不回显 · 当前 ${filteredConfigs.length} 项`}
      extra={
        <>
          {withDisabledReason(
            <Button
              icon={<DownloadOutlined />}
              disabled={!permissions.export}
              onClick={() => void handleExportConfigs()}
            >
              导出 JSON
            </Button>,
            !permissions.export,
            "无「导出配置」权限",
          )}
          {withDisabledReason(
            <JsonImportButton
              disabled={!permissions.import}
              successMessage="导入完成"
              onImport={async (jsonString) => {
                const data = JSON.parse(jsonString);
                const result = await callSfn(importConfigsSFn({ data }));
                message.success(`导入完成：新增 ${result.created} / 更新 ${result.updated}`);
                router.invalidate();
              }}
            >
              导入 JSON
            </JsonImportButton>,
            !permissions.import,
            "无「导入配置」权限",
          )}
          {withDisabledReason(
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!permissions.create}
              onClick={() => openModal()}
            >
              新建配置
            </Button>,
            !permissions.create,
            NO_CREATE_PERMISSION,
          )}
        </>
      }
      filters={
        <AdminFilters
          onReset={() => {
            setSearchText("");
            setSelectedGroup(null);
          }}
        >
          <Input.Search
            placeholder="搜索配置键或值"
            allowClear
            style={{ width: 240 }}
            value={searchText}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
          />
        </AdminFilters>
      }
    >
      <AdminSplitPanel
        sideTitle="配置分组"
        sideWidth={SPLIT_PANEL_WIDTH.narrow}
        side={groupDataSource.map((group) => (
          <AdminSplitPanel.Item
            key={group.key}
            primary={group.name}
            extra={group.count}
            active={(selectedGroup ?? "全部") === group.key}
            onSelect={() => setSelectedGroup(group.key === "全部" ? null : group.key)}
          />
        ))}
      >
        <ProTable
          dataSource={filteredConfigs}
          columns={configColumnsDef}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: "暂无配置" }}
        />
      </AdminSplitPanel>

      <ConfigFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </AdminListPage>
  );
}
