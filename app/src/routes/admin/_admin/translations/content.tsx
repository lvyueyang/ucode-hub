/**
 * 实体翻译管理页：维护 content_translation 表
 */
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { JsonImportButton } from "@ucode/hub-ui-spa/json-import-button";
import {
  actionsWidth,
  COLUMN_WIDTH,
  ProTable,
  StatusTag,
  type StatusTagOption,
  TableOperate,
  withDisabledReason,
} from "@ucode/hub-ui-spa/table";
import { Button, Form, Input, Select } from "antd";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import {
  AdminFilters,
  AdminFormModal,
  AdminListPage,
  EditorTypes,
  FORM_MODAL_WIDTH,
  useAdminAuth,
} from "#/components/admin";
import type { contentTranslation } from "#/db/schema";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { formSchema } from "#/shared-services/i18n/i18n.content.schemas";
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from "#/shared-services/i18n/i18n.types";
import { downloadExport } from "#/utils/export-file";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import {
  deleteSFn,
  exportContentTranslationsSFn,
  getListSFn,
  importContentTranslationsSFn,
  saveSFn,
} from "./-mods/content-translations.functions";

/** 实体翻译行记录类型 */
type ContentTranslationRow = typeof contentTranslation.$inferSelect;

/** 可管理的翻译语言：排除默认语言（zh 为源语言，存储于主表，不入库管理） */
const MANAGED_LOCALES = SUPPORTED_LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE);

/** 语言列展示：locale → 大写文案 + 语义色 */
const LOCALE_OPTIONS: Record<string, StatusTagOption> = Object.fromEntries(
  SUPPORTED_LOCALES.map((l) => [l, { label: l.toUpperCase() }]),
);

/** 实体类型列展示 */
const ENTITY_TYPE_OPTIONS: Record<string, StatusTagOption> = {
  dict_item: { label: "字典条目", tone: "info" },
  system_config: { label: "系统配置", tone: "info" },
};

/** 列表筛选条件 */
interface ContentTranslationFilters {
  entityType?: string;
  locale?: Locale;
  keyword: string;
}

const NO_MANAGE_PERMISSION = "无「管理翻译」权限";

export const Route = createFileRoute("/admin/_admin/translations/content")({
  component: ContentTranslationPage,
  loader: async () => await getListSFn({ data: {} }),
});

function ContentTranslationPage() {
  const initial = Route.useLoaderData();
  const { hasPermission } = useAdminAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContentTranslationRow | null>(null);
  /** 搜索框草稿值：回车 / 点击搜索时才写入查询条件 */
  const [keywordDraft, setKeywordDraft] = useState("");
  const [form] = Form.useForm();

  const canManage = hasPermission(ADMIN_PERMISSIONS.TRANSLATION_MANAGE);

  const list = useListQuery<ContentTranslationRow, ContentTranslationFilters>({
    initial,
    initialFilters: { entityType: undefined, locale: undefined, keyword: "" },
    errorMessage: "加载翻译列表失败",
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getListSFn({
          data: {
            entityType: filters.entityType,
            locale: filters.locale,
            keyword: filters.keyword || undefined,
            page,
            pageSize,
            sortField,
            sortOrder,
          },
        }),
      [],
    ),
  });

  /** 应用搜索关键字（清空同样走 applyFilters，回到第 1 页） */
  const applyKeyword = (value: string) => {
    setKeywordDraft(value);
    list.applyFilters({ keyword: value });
  };

  /** 重置筛选：清空关键字、实体类型与语言并回到第 1 页 */
  const resetFilters = () => {
    setKeywordDraft("");
    list.applyFilters({
      keyword: "",
      entityType: undefined,
      locale: undefined,
    });
  };

  async function handleSubmit(values: Record<string, unknown>) {
    let parsed: ReturnType<typeof formSchema.parse>;
    try {
      parsed = formSchema.parse({ ...values, id: editing?.id });
    } catch (err: unknown) {
      // 非 SFn 的表单 schema 校验失败，保留本地提示
      message.error(err instanceof Error ? err.message : "操作失败");
      return;
    }
    const [, err] = await sfnUnwrap(saveSFn({ data: parsed }));
    if (err) return;
    message.success(editing ? "翻译已更新" : "翻译已创建");
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    await list.reload();
  }

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      locale: "en",
      valueType: "text",
      entityType: "dict_item",
    });
    setModalOpen(true);
  }

  function openEdit(record: ContentTranslationRow) {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    const [, err] = await sfnUnwrap(deleteSFn({ data: { id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("翻译已删除");
    await list.reload();
  }

  /** 导出实体翻译数据（JSON） */
  async function handleExport() {
    if (
      await downloadExport(exportContentTranslationsSFn(), {
        name: "content_translations_export",
      })
    ) {
      message.success("导出完成");
    }
  }

  const columns = [
    {
      title: "实体类型",
      dataIndex: "entityType",
      key: "entityType",
      width: 120,
      ...list.sortProps("entityType"),
      render: (v: string) => <StatusTag value={v} options={ENTITY_TYPE_OPTIONS} />,
    },
    {
      title: "实体 ID",
      dataIndex: "entityId",
      key: "entityId",
      width: 120,
      ellipsis: true,
      copyable: true,
    },
    {
      title: "字段名",
      dataIndex: "fieldName",
      key: "fieldName",
      width: 100,
      ...list.sortProps("fieldName"),
    },
    {
      title: "语言",
      dataIndex: "locale",
      key: "locale",
      width: 90,
      ...list.sortProps("locale"),
      render: (v: string) => <StatusTag value={v} options={LOCALE_OPTIONS} />,
    },
    {
      title: "翻译值",
      dataIndex: "value",
      key: "value",
      // 弹性列：译文长度不可控，宽度为出现横向滚动时的最小可读宽
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 固定右侧列声明宽度：宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("编辑", "删除"),
      render: (_: unknown, record: ContentTranslationRow) =>
        record.locale === DEFAULT_LOCALE ? (
          // 默认语言为源语言，值存主表原字段，禁止编辑/删除
          <span className="text-xs text-muted-foreground">源语言（只读）</span>
        ) : (
          <TableOperate>
            <TableOperate.Edit
              onClick={() => openEdit(record)}
              disabled={!canManage}
              disabledReason={NO_MANAGE_PERMISSION}
            />
            <TableOperate.Delete
              recordName="这条翻译"
              disabled={!canManage}
              disabledReason={NO_MANAGE_PERMISSION}
              onConfirm={() => handleDelete(record.id)}
            />
          </TableOperate>
        ),
    },
  ];

  return (
    <AdminListPage
      title="实体翻译管理"
      description="维护业务实体字段的多语言翻译，中文为源语言不可编辑"
      extra={
        <>
          <Button
            icon={<DownloadOutlined />}
            disabled={!hasPermission(ADMIN_PERMISSIONS.TRANSLATION_EXPORT)}
            onClick={() => void handleExport()}
          >
            导出 JSON
          </Button>
          <JsonImportButton
            disabled={!hasPermission(ADMIN_PERMISSIONS.TRANSLATION_IMPORT)}
            onImport={async (jsonString) => {
              const data = JSON.parse(jsonString);
              const result = await callSfn(
                importContentTranslationsSFn({
                  data: { data },
                }),
              );
              message.success(`导入完成：新增 ${result.created} / 更新 ${result.updated}`);
              await list.reload();
            }}
          >
            导入 JSON
          </JsonImportButton>
          {withDisabledReason(
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canManage}
              onClick={openCreate}
            >
              新增翻译
            </Button>,
            !canManage,
            NO_MANAGE_PERMISSION,
          )}
        </>
      }
      filters={
        <AdminFilters onReset={resetFilters}>
          <Input.Search
            placeholder="搜索字段名或翻译值"
            allowClear
            style={{ width: 260 }}
            value={keywordDraft}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setKeywordDraft(e.target.value)}
            onSearch={applyKeyword}
          />
          <Select
            placeholder="实体类型"
            allowClear
            style={{ width: 120 }}
            value={list.filters.entityType}
            onChange={(v: string | undefined) => list.applyFilters({ entityType: v })}
            options={[
              { label: "字典条目", value: "dict_item" },
              { label: "系统配置", value: "system_config" },
            ]}
          />
          <Select
            placeholder="语言"
            allowClear
            style={{ width: 100 }}
            value={list.filters.locale}
            onChange={(v?: Locale) => list.applyFilters({ locale: v })}
            options={MANAGED_LOCALES.map((l) => ({
              label: l.toUpperCase(),
              value: l,
            }))}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无翻译" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
      />

      <AdminFormModal
        title={editing ? "编辑翻译" : "新增翻译"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={FORM_MODAL_WIDTH.base}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="entityType" label="实体类型" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "字典条目", value: "dict_item" },
                { label: "系统配置", value: "system_config" },
              ]}
            />
          </Form.Item>
          <Form.Item name="entityId" label="实体 ID" rules={[{ required: true }]}>
            <Input placeholder="UUID" />
          </Form.Item>
          <Form.Item name="fieldName" label="字段名" rules={[{ required: true }]}>
            <Input placeholder="例如：title" />
          </Form.Item>
          <Form.Item name="locale" label="语言" rules={[{ required: true }]}>
            <Select
              options={MANAGED_LOCALES.map((l) => ({
                label: l.toUpperCase(),
                value: l,
              }))}
            />
          </Form.Item>
          <Form.Item name="value" label="翻译值" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="valueType" label="编辑器类型">
            <EditorTypes.Select />
          </Form.Item>
        </Form>
      </AdminFormModal>
    </AdminListPage>
  );
}
