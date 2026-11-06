// 菜单 → 按钮 权限树（账户管理·角色权限页面使用）
// 每个菜单一项 view 权限（menu），下面挂多个按钮（button）
export const PERM_TREE = [
  { module: 'dashboard', label: '工作台', perm: 'dashboard:view', buttons: [] },
  { module: 'order', label: '订单管理', perm: 'order:view', buttons: [
    { code: 'order:create', label: '新增提单' },
    { code: 'order:edit', label: '编辑' },
    { code: 'order:copy', label: '复制新增' },
    { code: 'order:modify', label: '改单' },
    { code: 'order:stop', label: '停单' },
    { code: 'order:cancel_stop', label: '取消停单' },
    { code: 'order:reopen', label: '复提' },
    { code: 'order:batch_stop', label: '批量停单' },
    { code: 'order:batch_reopen', label: '批量复提' },
    { code: 'order:batch_extend', label: '批量延期' },
    { code: 'order:batch_group', label: '批量修改小组' },
    { code: 'order:delete', label: '删除' },
    { code: 'order:batch_delete', label: '批量删除' },
    { code: 'order:import', label: '导入' },
    { code: 'order:export', label: '导出订单' },
    { code: 'order:export_template', label: '导出模版' },
    { code: 'order:check_dup', label: '订单验重' },
    { code: 'order:cat_check', label: '品类检查' },
    { code: 'order:tidabiao', label: '生成提单表' },
    { code: 'order:confirm', label: '提单确认' },
  ] },
  { module: 'daily', label: '日活管理', perm: 'daily:view', buttons: [
    { code: 'daily:import', label: '导入日活' },
    { code: 'daily:wash_export', label: '导出洗名' },
    { code: 'daily:wash_import', label: '导入洗名' },
    { code: 'daily:distribute', label: '分发数据' },
    { code: 'daily:check', label: '工单检查' },
    { code: 'daily:backfill_category', label: '补充品类' },
    { code: 'daily:batch_delete', label: '批量删除' },
    { code: 'daily:extract', label: '单独抽取' },
    { code: 'daily:edit', label: '编辑' },
    { code: 'daily:export', label: '导出数据' },
  ] },
  { module: 'product', label: '产品销售', perm: 'product:view', buttons: [
    { code: 'product:create', label: '新增' },
    { code: 'product:save', label: '批量保存' },
    { code: 'product:delete', label: '删除' },
    { code: 'product:import', label: '导入' },
    { code: 'product:export', label: '导出 Excel' },
    { code: 'product:export_template', label: '导出模版' },
  ] },
  { module: 'bill', label: '账单管理', perm: 'bill:view', buttons: [
    { code: 'bill:generate', label: '生成账单' },
    { code: 'bill:import', label: '导入' },
    { code: 'bill:batch_delete', label: '批量删除' },
    { code: 'bill:detail', label: '详情' },
    { code: 'bill:edit_balance', label: '修改余额' },
  ] },
  { module: 'customer', label: '客户管理', perm: 'customer:view', buttons: [
    { code: 'customer:create', label: '新增' },
    { code: 'customer:edit', label: '编辑' },
    { code: 'customer:detail', label: '详情' },
    { code: 'customer:recharge', label: '充值' },
    { code: 'customer:edit_balance', label: '修改余额' },
    { code: 'customer:save_rate', label: '保存汇率' },
    { code: 'customer:save_price', label: '保存单价' },
    { code: 'customer:delete', label: '删除' },
  ] },
  { module: 'alert', label: '预警中心', perm: 'alert:view', buttons: [
    { code: 'alert:handle', label: '处理/充值' },
    { code: 'alert:config', label: '触发时间配置' },
  ] },
  { module: 'wash', label: '洗名库', perm: 'wash:view', buttons: [
    { code: 'wash:import', label: '导入' },
    { code: 'wash:batch_delete', label: '批量删除' },
  ] },
  { module: 'fund', label: '公积金', perm: 'fund:view', buttons: [
    { code: 'fund:create', label: '新增' },
    { code: 'fund:edit', label: '编辑' },
    { code: 'fund:import', label: '导入' },
    { code: 'fund:export', label: '导出 Excel' },
    { code: 'fund:delete', label: '删除' },
  ] },
  { module: 'file', label: '文件管理', perm: 'file:view', buttons: [
    { code: 'file:upload', label: '上传' },
    { code: 'file:download', label: '下载' },
    { code: 'file:delete', label: '删除' },
  ] },
  { module: 'parts', label: '配件管理', perm: 'parts:view', buttons: [
    { code: 'parts:create', label: '新增 URL' },
    { code: 'parts:edit', label: '编辑' },
    { code: 'parts:delete', label: '删除' },
    { code: 'parts:import', label: '导入' },
    { code: 'parts:clear', label: '清空' },
  ] },
  { module: 'category', label: '品类管理', perm: 'category:view', buttons: [
    { code: 'category:create', label: '新增' },
    { code: 'category:edit', label: '编辑' },
    { code: 'category:delete', label: '删除' },
    { code: 'category:import', label: '导入' },
  ] },
  { module: 'channel', label: '渠道管理', perm: 'channel:view', buttons: [
    { code: 'channel:create', label: '新增' },
    { code: 'channel:edit', label: '编辑' },
    { code: 'channel:delete', label: '删除' },
  ] },
  { module: 'operator', label: '运营商管理', perm: 'operator:view', buttons: [
    { code: 'operator:create', label: '新增' },
    { code: 'operator:edit', label: '编辑' },
    { code: 'operator:delete', label: '删除' },
  ] },
  { module: 'template', label: '模版管理', perm: 'template:view', buttons: [
    { code: 'template:create', label: '新增' },
    { code: 'template:edit', label: '编辑' },
    { code: 'template:delete', label: '删除' },
    { code: 'template:upload', label: '上传文件' },
    { code: 'template:download', label: '下载' },
  ] },
  { module: 'products', label: '产品管理', perm: 'product:view', buttons: [
    { code: 'products:create', label: '新增' },
    { code: 'products:edit', label: '编辑' },
    { code: 'products:copy', label: '复制' },
    { code: 'products:delete', label: '删除' },
    { code: 'products:price', label: '代理售价' },
  ] },
  { module: 'account', label: '账户管理', perm: 'account:view', buttons: [
    { code: 'account:create', label: '新增账户' },
    { code: 'account:edit', label: '编辑' },
    { code: 'account:reset', label: '重置密码' },
    { code: 'account:delete', label: '删除' },
    { code: 'account:role_perms', label: '角色权限' },
    { code: 'account:create_role', label: '新增角色' },
  ] },
  { module: 'config', label: '配置中心', perm: 'config:view', buttons: [
    { code: 'config:save', label: '保存' },
    { code: 'config:reset_alert', label: '重置预警' },
  ] },
]

// 默认仅管理员拥有的按钮动作（delete / batch_delete / clear）
const ADMIN_ONLY_ACTIONS = new Set(['delete', 'batch_delete', 'clear'])

export function isAdminOnlyCode(code) {
  const action = code.split(':').pop()
  return ADMIN_ONLY_ACTIONS.has(action)
}
