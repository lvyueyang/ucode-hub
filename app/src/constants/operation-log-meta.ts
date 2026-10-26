/**
 * 操作日志展示元数据：模块/动作的颜色与中文名映射
 * 供操作日志明细页、分析页与仪表盘共用，避免各处重复维护
 */

/** 模块对应 Tag 颜色 */
export const MODULE_COLORS: Record<string, string> = {
  admin: "purple",
  client: "cyan",
  "admin-role": "orange",
  "client-role": "volcano",
  dict: "green",
  config: "geekblue",
  file: "lime",
  "file-explorer": "lime",
  translation: "magenta",
  message: "purple",
  "ai-provider": "geekblue",
  device: "geekblue",
};

/** 动作对应 Tag 颜色 */
export const ACTION_COLORS: Record<string, string> = {
  create: "green",
  update: "blue",
  delete: "red",
  change_status: "gold",
  set_published: "gold",
  reset_pwd: "orange",
  export: "cyan",
  import: "purple",
  upload: "geekblue",
  make_permanent: "lime",
  rename: "cyan",
  mkdir: "cyan",
  update_tag: "magenta",
  overwrite_image: "volcano",
  backup_image: "orange",
  login: "cyan",
  request: "geekblue",
  // 登记即新建一台用户资产，与 create 同色；吊销是危险但非删除的处置，与 delete 的红区分
  register: "green",
  revoke: "volcano",
};

/** 模块中文名映射 */
export const MODULE_LABELS: Record<string, string> = {
  admin: "管理员",
  client: "客户端用户",
  "admin-role": "角色",
  "client-role": "客户端角色",
  dict: "字典",
  config: "系统配置",
  file: "文件",
  "file-explorer": "文件资源管理器",
  translation: "翻译",
  message: "消息",
  "ai-provider": "AI 厂商",
  device: "设备",
};

/** 动作中文名映射 */
export const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  change_status: "状态变更",
  set_published: "上下架",
  reset_pwd: "重置密码",
  export: "导出",
  import: "导入",
  upload: "上传",
  make_permanent: "转为永久",
  rename: "重命名",
  mkdir: "新建目录",
  update_tag: "修改标签",
  overwrite_image: "覆盖原图",
  backup_image: "备份原图",
  login: "登录",
  request: "外部请求",
  register: "登记",
  revoke: "吊销",
};
