import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, downloadFile, getToken, getUser, uploadFile } from '../api'
import { Modal, Badge, useToast, useConfirm, Loading, ClearableInput } from '../components/ui'
import { useColumnConfig } from '../components/columns'
import FilterBar, { buildQuery } from '../components/FilterBar'
import Pagination from '../components/Pagination'
import MultiSelect from '../components/MultiSelect'
import { useButtonPerm } from '../buttonPerms'

const IconChevronDown = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
)
const IconChevronUp = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
)
const IconColumns = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="16" y2="21" /></svg>
)
const IconEdit = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
)
const IconModify = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
)
const IconStop = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
)
const IconDelete = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
)
const IconCopy = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
)
const IconReopen = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
)
const IconUndo = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
)

function IconBtn({ title, color, onClick, children }) {
  return (
    <button className="icon-btn" title={title} onClick={onClick} style={{ color }}>{children}</button>
  )
}

const COLS = [
  { k: 'status', l: '状态' }, { k: 'task_name', l: '任务名' }, { k: 'order_date', l: '更新日期' }, { k: 'upstream', l: '甲方' },
  { k: 'order_no', l: '订单号' }, { k: 'task_id', l: '工单号' }, { k: 'dup_order_nos', l: '重复订单' },
  { k: 'customer', l: '一级代理' }, { k: 'price', l: '定价（元）' },
  { k: 'platform', l: '平台' }, { k: 'group_name', l: '小组' }, { k: 'tpl_code', l: '出数模版' },
  { k: 'add_name', l: '是否加名' }, { k: 'check_collision', l: '是否撞库' }, { k: 'channel', l: '渠道' }, { k: 'operator', l: '运营商' },
  { k: 'url', l: 'url' }, { k: 'qty', l: '数量' },
  { k: 'age_min', l: '年龄下限' }, { k: 'age_max', l: '年龄上限' }, { k: 'pv', l: 'pv' },
  { k: 'province', l: '省份' }, { k: 'excl_province', l: '排除省份' }, { k: 'city', l: '地市' },
  { k: 'excl_city', l: '排除地市' }, { k: 'start_date', l: '开始日期' }, { k: 'first_output_date', l: '初次出数日期' },
  { k: 'end_date', l: '截止日期' }, { k: 'last_output_date', l: '末次出数日期' }, { k: 'duration', l: '时长' },
  { k: 'created_at', l: '创建时间' }, { k: 'updated_at', l: '更新时间' },
  { k: 'created_by', l: '创建人' }, { k: 'updated_by', l: '更新人' },
]

const DETAIL_REGIONS = [
  { title: '基础信息', keys: ['order_date', 'order_no', 'task_id', 'upstream', 'status', 'customer', 'dup_order_nos', 'channel', 'operator', 'start_date', 'end_date'] },
  { title: '分数信息', keys: ['task_name', 'platform', 'group_name', 'tpl_code', 'add_name', 'check_collision', 'price', 'first_output_date', 'last_output_date', 'duration'] },
  { title: '提单信息', keys: ['qty', 'pv', 'age_min', 'age_max', 'province', 'city', 'excl_province', 'excl_city', 'url'] },
]

const FILTER_COLS = [
  { k: 'status', l: '状态' }, { k: 'order_date', l: '更新日期' },
  { k: 'upstream', l: '甲方' }, { k: 'order_no', l: '订单号' }, { k: 'task_id', l: '工单号' }, { k: 'empty_task', l: '空工单' },
  { k: 'customer', l: '一级代理' },
  { k: 'platform', l: '平台' }, { k: 'empty_platform', l: '空平台' }, { k: 'group_name', l: '小组' }, { k: 'task_name', l: '任务名' },
  { k: 'add_name', l: '是否加名' }, { k: 'check_collision', l: '是否撞库' }, { k: 'has_alert', l: '是否预警' }, { k: 'channel', l: '渠道' }, { k: 'operator', l: '运营商' },
  { k: 'tpl_code', l: '出数模版' }, { k: 'url', l: 'url' },
  { k: 'province', l: '省份' }, { k: 'excl_province', l: '排除省份' }, { k: 'city', l: '地市' },
  { k: 'excl_city', l: '排除地市' },
]

const emptyForm = { order_no: '', customer_id: '', upstream_id: '', channel_id: '', operator_id: '', task_name: '', task_id: '', qty: '', duration: '', province: '', city: '', excl_province: '', excl_city: '', age_min: '', age_max: '', pv: '', start_date: '', end_date: '', order_date: '', price: '', secondary_agent: '', platform: '', tpl_id: '', group_name: '', add_name: false, check_collision: false, template_id: '', filename_rule: '', status: '未提', url: '' }

const REGION_SEP = /[|｜,，;；]/
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toDateInput(val) {
  if (!val) return ''
  return String(val).replace(/\//g, '-')
}
function fmtRegion(val) {
  return (val || '').split(REGION_SEP).map(s => s.trim()).filter(Boolean).join('|')
}
function toComma(val) {
  return (val || '').split(REGION_SEP).map(s => s.trim()).filter(Boolean).join(',')
}
function fmtYymmdd(val) {
  return String(val || '').replace(/\D/g, '').slice(2)
}

export default function Orders({ variant = 'orders' }) {
  const { toast, showError } = useToast()
  const [confirm, confirmEl] = useConfirm()
  const [searchParams] = useSearchParams()
  const isStop = variant === 'stop'
  const user = getUser() || {}
  const isAdmin = user.role_code === 'admin' || (user.permissions || []).includes('*')
  const { can } = useButtonPerm()
  const BASE_COLS = isStop ? [{ k: 'batch_no', l: '提单批次' }, ...COLS] : COLS
  const { visible: cols, picker, openPicker } = useColumnConfig(BASE_COLS, isStop ? 'cols_stop_manage' : 'cols_order')
  const [rows, setRows] = useState([])
  const [customers, setCustomers] = useState([])
  const [upstreams, setUpstreams] = useState([])
  const [channels, setChannels] = useState([])
  const [operators, setOperators] = useState([])
  const [filters, setFilters] = useState({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(100)
  const [sort, setSort] = useState(null)
  const [modal, setModal] = useState(null) // null | 'create' | 'edit' | 'modify'
  const [form, setForm] = useState(emptyForm)
  const origIdentity = useRef(null) // 编辑前的身份字段（customer_id/upstream_id/task_name）
  const [detail, setDetail] = useState(null)
  const [stopTarget, setStopTarget] = useState(null)
  const [stopDate, setStopDate] = useState('')
  const [stopReason, setStopReason] = useState('业务调整')
  const [bizDate, setBizDate] = useState('')

  function defaultOrderDate() { return bizDate || todayStr() }
  const [reopenTarget, setReopenTarget] = useState(null)
  const [batchReopenForm, setBatchReopenForm] = useState({ order_date: '', start_date: '', end_date: '' })
  const [extendTarget, setExtendTarget] = useState(null)
  const [extendDate, setExtendDate] = useState('')
  const [reopenOrder, setReopenOrder] = useState(null)
  const [reopenForm, setReopenForm] = useState({ order_date: '', start_date: '', end_date: '' })
  const [urlDetail, setUrlDetail] = useState(null)
  const [regionDetail, setRegionDetail] = useState(null)
  const [geo, setGeo] = useState({ provinces: [], citiesMap: {} })
  const [tpls, setTpls] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [dateOptions, setDateOptions] = useState({ start_date: [], end_date: [] })
  const [tplPreview, setTplPreview] = useState(null)
  const [importModal, setImportModal] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importFileRef = useRef(null)
  const [receiptModal, setReceiptModal] = useState(false)
  const [receiptResult, setReceiptResult] = useState(null)
  const [receiptParty, setReceiptParty] = useState('牛')
  const receiptFileRef = useRef(null)
  const [selected, setSelected] = useState([])
  const [groupModal, setGroupModal] = useState(false)
  const [groupVal, setGroupVal] = useState('')
  const [catCheckModal, setCatCheckModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [busyProgress, setBusyProgress] = useState(null)
  const [genModal, setGenModal] = useState(false)
  const [genDate, setGenDate] = useState('')
  const [confirmModal, setConfirmModal] = useState(false)
  const [confirmDate, setConfirmDate] = useState('')
  const [pendingCheck, setPendingCheck] = useState(null)
  const [filterCollapsed, setFilterCollapsed] = useState(false)

  async function load(p = page, pp = perPage, f) {
    const qs = buildQuery(f === undefined ? filters : f)
    const params = qs ? qs + `&page=${p}&per_page=${pp}` : `page=${p}&per_page=${pp}`
    const r = await api.get('/api/orders?' + params)
    setRows(r.data.rows); setTotal(r.data.total)
    return r.data.total
  }
  async function search(f) {
    setPage(1); setBusy(true); setBusyMsg('正在查询，请稍候…')
    try {
      const total = await load(1, perPage, f)
      toast(`查询完成，共 ${total} 条`)
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }
  function goPage(p) { setPage(p); load(p, perPage) }
  function changePerPage(pp) { setPerPage(pp); setPage(1); load(1, pp) }
  function doCatCheck(issue) {
    setCatCheckModal(false)
    const next = filters.plat_issue === issue ? '' : issue
    const f = { ...filters, plat_issue: next }
    setFilters(f); search(f)
  }
  useEffect(() => {
    const on = searchParams.get('order_no')
    if (searchParams.get('receipt') === '1') {
      setReceiptResult(null); setReceiptModal(true)
    }
    if (on) {
      setFilters({ order_no: on })
      load(1, perPage, { order_no: on })
    } else {
      load()
    }
  }, [])
  useEffect(() => {
    api.get('/api/customers?per_page=1000').then(r => {
      setCustomers(r.data.rows.filter(c => c.ctype === 'downstream')
        .sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0)))
      setUpstreams(r.data.rows.filter(c => c.ctype === 'upstream'))
    }).catch(() => {})
    api.get('/api/channels?per_page=1000').then(r => setChannels(r.data.rows)).catch(() => {})
    api.get('/api/operators?per_page=1000').then(r => setOperators(r.data.rows)).catch(() => {})
    api.get('/api/regions').then(r => {
      setGeo({ provinces: r.data.provinces, citiesMap: r.data.cities })
    }).catch(() => {})
    api.get('/api/templates').then(r => setTpls(r.data || [])).catch(() => {})
    api.get('/api/platforms').then(r => setPlatforms(r.data || [])).catch(() => {})
    api.get('/api/distinct?model=orders&field=start_date').then(r => setDateOptions(o => ({ ...o, start_date: r.data || [] }))).catch(() => {})
    api.get('/api/distinct?model=orders&field=end_date').then(r => setDateOptions(o => ({ ...o, end_date: r.data || [] }))).catch(() => {})
    api.get('/api/orders/business-date').then(r => setBizDate(r.data?.date || '')).catch(() => {})
  }, [])

  const allCities = [...new Set(Object.values(geo.citiesMap).flat())]
  const fieldOptions = {
    status: ['未提', '在执', '待停', '已停', '改单'],
    upstream: upstreams.map(u => u.name),
    customer: customers.map(c => c.code),
    channel: channels.map(c => c.name),
    no_cat2: ['有', '无'],
    add_name: ['是', '否'],
    check_collision: ['是', '否'],
    has_alert: ['有', '无'],
    empty_task: ['有', '无'],
    empty_platform: ['有', '无'],
    operator: operators.map(o => o.name),
    dup: ['有', '无'],
    province: geo.provinces,
    city: allCities,
  }

  const provinceOptions = ['全国', ...geo.provinces]
  const selectedProvinces = (form.province || '').split(',').filter(Boolean)
  const isNational = selectedProvinces.includes('全国')
  const cityOptions = isNational
    ? []
    : [...new Set(selectedProvinces.filter(p => p !== '全国').flatMap(p => geo.citiesMap[p] || []))]
  const exclCityOptions = isNational
    ? [...new Set(Object.values(geo.citiesMap).flat())]
    : [...new Set(selectedProvinces.filter(p => p !== '全国').flatMap(p => geo.citiesMap[p] || []))]
  const computedDuration = (form.start_date && form.end_date)
    ? String(Math.round((new Date(form.end_date + 'T00:00:00') - new Date(form.start_date + 'T00:00:00')) / 86400000))
    : ''

  const isModify = modal === 'modify'
  const isEdit = modal === 'edit'
  const editStatus = isEdit ? (origIdentity.current?.status || '未提') : ''
  const isEditGai = isEdit && editStatus === '改单'
  const isEditZhi = isEdit && editStatus === '在执'
  const restrictEdit = isEditGai || isEditZhi
  const showScore = !isModify
  const showTidabiao = isAdmin || !restrictEdit
  const disBase = isModify || (restrictEdit && !isAdmin)

  function sorted() {
    const list = [...rows]
    if (sort) list.sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : -1) * (sort.dir === 'asc' ? 1 : -1))
    return list
  }

  function openCreate() { origIdentity.current = null; setForm({ ...emptyForm, order_date: todayStr() }); setModal('create') }

  function toggleSelect(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  function toggleAll() {
    const ids = sorted().map(o => o.id)
    setSelected(selected.length === ids.length ? [] : ids)
  }
  function batchStop() {
    if (!selected.length) { showError('请先勾选要停单的订单'); return }
    setStopDate(defaultOrderDate())
    setStopReason('业务调整')
    setStopTarget({ ids: selected, batch: true })
  }

  async function batchDelete() {
    if (!selected.length) { showError('请先勾选要删除的订单'); return }
    if (!(await confirm(`确认删除选中的 ${selected.length} 个订单？此操作不可恢复。`))) return
    setBusy(true); setBusyMsg('正在删除，请稍候…')
    try {
      await api.post('/api/orders/batch-delete', { ids: selected })
      toast('已批量删除'); setSelected([]); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function batchReopen() {
    if (!selected.length) { showError('请先勾选要复提的订单'); return }
    setBatchReopenForm({ order_date: defaultOrderDate(), start_date: '', end_date: '' })
    setReopenTarget({ ids: selected })
  }

  async function doReopen() {
    if (!batchReopenForm.order_date) { showError('请选择更新日期'); return }
    if (!reopenTarget) return
    if (!(await confirm(`确认将选中的 ${reopenTarget.ids.length} 个订单从「已停」改为「未提」，并将更新日期更新为 ${batchReopenForm.order_date}？`))) return
    setBusy(true); setBusyMsg('正在批量复提，请稍候…')
    try {
      const r = await api.post('/api/orders/batch-reopen', { ids: reopenTarget.ids, ...batchReopenForm })
      toast(r.msg); setReopenTarget(null); setBatchReopenForm({ order_date: '', start_date: '', end_date: '' }); setSelected([]); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  function batchExtend() {
    if (!selected.length) { showError('请先勾选要延期的订单'); return }
    setExtendDate('')
    setExtendTarget({ ids: selected })
  }

  async function doExtend() {
    if (!extendDate) { showError('请选择截止日期'); return }
    if (!extendTarget) return
    if (!(await confirm(`确认将选中的 ${extendTarget.ids.length} 个订单的截止日期更新为 ${extendDate}？`))) return
    setBusy(true); setBusyMsg('正在批量延期，请稍候…')
    try {
      const r = await api.post('/api/orders/batch-extend', { ids: extendTarget.ids, end_date: extendDate })
      toast(r.msg); setExtendTarget(null); setExtendDate(''); setSelected([]); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  function openReopen(o) {
    setReopenOrder(o)
    setReopenForm({ order_date: defaultOrderDate(), start_date: toDateInput(o.start_date), end_date: toDateInput(o.end_date) })
  }

  async function doReopenOrder() {
    if (!reopenOrder) return
    if (!reopenForm.order_date) { showError('请选择更新日期'); return }
    if (!(await confirm(`确认将该订单复提：状态改为「未提」，更新日期 ${reopenForm.order_date}？`))) return
    setBusy(true); setBusyMsg('正在复提，请稍候…')
    try {
      const r = await api.post(`/api/orders/${reopenOrder.id}/reopen`, reopenForm)
      toast(r.msg); setReopenOrder(null); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function batchGroup() {
    setBusy(true); setBusyMsg('正在修改小组，请稍候…')
    try {
      await api.post('/api/orders/batch-group', { ids: selected, group_name: groupVal })
      toast('小组已批量修改'); setGroupModal(false); setSelected([]); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  function openEdit(o, mode) {
    const m = mode || 'edit'
    origIdentity.current = {
      customer_id: o.customer_id, upstream_id: o.upstream_id, task_name: o.task_name || '',
      task_id: o.task_id || '', status: o.status || '未提',
      url: (o.urls || []).join('\n'),
      qty: o.qty ?? '', province: toComma(o.province), city: toComma(o.city),
      excl_province: toComma(o.excl_province), excl_city: toComma(o.excl_city),
      age_min: o.age_min ?? '', age_max: o.age_max ?? '', pv: o.pv ?? '',
    }
    setForm({
      id: o.id,
      order_no: o.order_no || '',
      customer_id: o.customer_id, upstream_id: o.upstream_id, channel_id: o.channel_id, operator_id: o.operator_id ?? '', task_name: o.task_name,
      task_id: o.task_id || '', qty: o.qty ?? '', duration: o.duration || '',
      province: toComma(o.province), city: toComma(o.city), excl_province: toComma(o.excl_province),
      excl_city: toComma(o.excl_city), age_min: o.age_min ?? '', age_max: o.age_max ?? '', pv: o.pv ?? '',
      start_date: toDateInput(o.start_date), end_date: toDateInput(o.end_date),
      order_date: m === 'modify' ? defaultOrderDate() : toDateInput(o.order_date), price: o.price ?? '', secondary_agent: o.secondary_agent || '',
      platform: o.platform || '', tpl_id: o.tpl_id ?? '', group_name: o.group_name || '',
      export_filename: o.export_filename || '', add_name: !!o.add_name, check_collision: !!o.check_collision,
      template_id: o.template_id ?? '', filename_rule: o.filename_rule || '', dist_config: o.dist_config || null,
      status: m === 'modify' ? '改单' : (o.status || '未提'),
      url: (o.urls || []).join('\n'),
    })
    setModal(m)
  }

  function openModify(o) { openEdit(o, 'modify') }

  function copyCreate(o) {
    origIdentity.current = null
    setForm({
      ...emptyForm,
      customer_id: o.customer_id, upstream_id: o.upstream_id, channel_id: o.channel_id, operator_id: o.operator_id ?? '', task_name: o.task_name,
      qty: o.qty ?? '', duration: o.duration || '',
      province: toComma(o.province), city: toComma(o.city), excl_province: toComma(o.excl_province),
      excl_city: toComma(o.excl_city), age_min: o.age_min ?? '', age_max: o.age_max ?? '', pv: o.pv ?? '',
      price: o.price ?? '', secondary_agent: o.secondary_agent || '',
      platform: o.platform || '', tpl_id: o.tpl_id ?? '', group_name: o.group_name || '',
      export_filename: o.export_filename || '', add_name: !!o.add_name, check_collision: !!o.check_collision,
      template_id: o.template_id ?? '', filename_rule: o.filename_rule || '', dist_config: o.dist_config || null,
      order_date: todayStr(),
      url: (o.urls || []).join('\n'),
    })
    setModal('create')
  }

  async function save() {
    const missing = []
    if (!form.order_date) missing.push('更新日期')
    if (modal !== 'modify') {
      if (!(form.task_name || '').trim()) missing.push('任务名')
      if (!form.start_date) missing.push('开始日期')
      if (!form.end_date) missing.push('截止日期')
      if (!form.upstream_id) missing.push('上游')
      if (!form.customer_id) missing.push('一级代理')
    }
    if (form.qty === '' || form.qty == null) missing.push('数量')
    if (!(form.url || '').trim()) missing.push('URL')
    if (missing.length) { showError('缺少必填字段：' + missing.join('、')); return }
    // 变更字段红字提醒（状态/工单号/任务名/一级代理/甲方/改单涉及字段）
    if (origIdentity.current) {
      const o = origIdentity.current
      const eq = (a, b) => (a == null ? '' : String(a)) === (b == null ? '' : String(b))
      const changed = []
      if (!eq(form.customer_id, o.customer_id)) changed.push('一级代理')
      if (!eq(form.upstream_id, o.upstream_id)) changed.push('甲方')
      if (!eq(form.task_name, o.task_name)) changed.push('任务名')
      if (!eq(form.task_id, o.task_id)) changed.push('工单号')
      if (!eq(form.status, o.status)) changed.push('状态')
      if (!eq(form.url, o.url)) changed.push('url')
      if (!eq(form.qty, o.qty)) changed.push('数量')
      if (!eq(form.province, o.province)) changed.push('省份')
      if (!eq(form.city, o.city)) changed.push('地市')
      if (!eq(form.excl_province, o.excl_province)) changed.push('排除省')
      if (!eq(form.excl_city, o.excl_city)) changed.push('排除地市')
      if (!eq(form.age_min, o.age_min)) changed.push('年龄下限')
      if (!eq(form.age_max, o.age_max)) changed.push('年龄上限')
      if (!eq(form.pv, o.pv)) changed.push('pv')
      if (changed.length) {
        if (!(await confirm(`以下字段已发生变更：\n${changed.join('、')}\n\n请确认无误后保存。`, true))) return
      }
    }
    if (!(await confirm('确认保存该订单？'))) return
    setBusy(true); setBusyMsg('正在保存，请稍候…')
    try {
      const body = { ...form, qty: form.qty === '' ? null : Number(form.qty), age_min: form.age_min === '' ? null : Number(form.age_min), age_max: form.age_max === '' ? null : Number(form.age_max), pv: form.pv === '' ? null : Number(form.pv), customer_id: Number(form.customer_id), upstream_id: form.upstream_id ? Number(form.upstream_id) : null, channel_id: form.channel_id ? Number(form.channel_id) : null, operator_id: form.operator_id ? Number(form.operator_id) : null, template_id: form.template_id === '' || form.template_id == null ? null : Number(form.template_id), tpl_id: form.tpl_id === '' || form.tpl_id == null ? null : Number(form.tpl_id), price: form.price === '' || form.price == null ? null : Number(form.price), order_date: form.order_date || null, duration: computedDuration, urls: (form.url || '').split('\n').map(s => s.trim()).filter(Boolean).map(u => ({ url: u, level: '高' })) }
      const r = modal === 'create' ? await api.post('/api/orders', body) : await api.put(`/api/orders/${form.id}`, body)
      toast(r.msg || '已保存'); setModal(null); load()
      if (r.warning) showError(r.warning)
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function stop() {
    if (!stopDate) { showError('请选择更新日期'); return }
    const isBatch = stopTarget && stopTarget.batch
    if (!(await confirm(isBatch ? `确认停单选中的 ${stopTarget.ids.length} 个订单？` : '确认停单？'))) return
    setBusy(true); setBusyMsg('正在停单，请稍候…')
    try {
      if (isBatch) {
        await api.post('/api/orders/batch-stop', { ids: stopTarget.ids, reason: stopReason, note: '', order_date: stopDate })
        toast('已批量停单'); setSelected([])
      } else {
        await api.post(`/api/orders/${stopTarget.id}/stop`, { reason: stopReason, note: '', order_date: stopDate })
        toast('已停')
      }
      setStopTarget(null); setStopDate(''); load(); window.dispatchEvent(new Event('alert-count-refresh'))
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function cancelStop(o) {
    if (!(await confirm(`确认取消停单「${o.task_name || o.order_no}」？状态将恢复为「在执」。`))) return
    setBusy(true); setBusyMsg('正在取消停单，请稍候…')
    try {
      await api.post(`/api/orders/${o.id}/cancel-stop`)
      toast('已取消停单'); load(); window.dispatchEvent(new Event('alert-count-refresh'))
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function delOrder(o) {
    if (!(await confirm(`确认删除订单 ${o.order_no}？此操作不可恢复。`))) return
    setBusy(true); setBusyMsg('正在删除，请稍候…')
    try {
      await api.del(`/api/orders/${o.id}`)
      toast('已删除'); setSelected(s => s.filter(x => x !== o.id)); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function importOrders(file) {
    setBusy(true); setBusyMsg('正在上传导入文件…'); setBusyProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await uploadFile('/api/orders/import', fd, p => setBusyProgress(p))
      setBusyMsg('正在处理导入数据，请稍候…'); setBusyProgress(100)
      setImportResult(data.data)
      load()
    } finally {
      setBusy(false); setBusyProgress(null)
    }
  }

  async function importReceipt(file) {
    setBusy(true); setBusyMsg('正在上传回执文件…'); setBusyProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('party', receiptParty)
      const data = await uploadFile('/api/orders/import-receipt', fd, p => setBusyProgress(p))
      setBusyMsg('正在处理回执数据，请稍候…'); setBusyProgress(100)
      setReceiptResult(data.data)
      load()
    } finally {
      setBusy(false); setBusyProgress(null)
    }
  }

  async function doGenerate() {
    setGenModal(false)
    setBusy(true); setBusyMsg('正在生成提单表，请稍候…')
    try {
      const body = { date: genDate, order_ids: selected.length ? selected : [] }
      const res = await fetch('/api/orders/generate-tidabiao', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.msg || d.detail || '生成失败') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const mmdd = genDate.replace('-', '').slice(4)
      a.href = url
      a.download = `提单表-${mmdd}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast('已生成提单表，请查看下载')
    } finally {
      setBusy(false)
    }
  }

  async function doConfirm() {
    setBusy(true); setBusyMsg('正在检查待确认订单…')
    try {
      const r = await api.get('/api/orders/confirm-tidabiao/pending-check?date=' + encodeURIComponent(confirmDate))
      const pending = r.data || []
      setBusy(false)
      if (pending.length > 0) {
        setConfirmModal(false)
        setPendingCheck(pending)
        return
      }
      await runConfirm()
    } catch (e) { setBusy(false); showError(e.message) }
  }

  async function runConfirm() {
    setBusy(true); setBusyMsg('正在提单确认，请稍候…')
    try {
      const body = { date: confirmDate, order_ids: selected.length ? selected : [] }
      const r = await api.post('/api/orders/confirm-tidabiao', body)
      toast(r.msg || '提单确认完成'); setSelected([]); load()
    } catch (e) { showError(e.message) } finally { setBusy(false) }
  }

  async function showTpl(o) {
    if (!o.tpl_id) { showError('该订单未设置出数模版'); return }
    try {
      const r = await api.get(`/api/templates/${o.tpl_id}/preview`)
      setTplPreview(r.data)
    } catch (e) { showError(e.message) }
  }

  async function openOrderByNo(no) {
    try {
      const r = await api.get('/api/orders?order_no=' + encodeURIComponent(no) + '&per_page=1')
      if (r.data.rows.length) setDetail(r.data.rows[0])
      else showError('未找到订单 ' + no)
    } catch (e) { showError(e.message) }
  }

  async function checkDuplicates() {
    setBusy(true); setBusyMsg('正在验重，请稍候…')
    try {
      const r = await api.post('/api/orders/check-duplicates')
      toast(r.msg || '验重完成')
      const f = { ...filters, dup: '有' }
      setFilters(f); load(1, perPage, f)
    } catch (e) { showError(e.message) } finally { setBusy(false) }
  }

  function orderCell(o, c) {
    const num = ['qty', 'pv', 'age_min', 'age_max'].includes(c.k)
    if (c.k === 'status') return <td className={num ? 'num' : ''}><Badge value={o.status} /></td>
    if (c.k === 'url') return <td><a className="link" onClick={e => { e.stopPropagation(); setUrlDetail(o) }}>{o.url}</a></td>
    if (c.k === 'tpl_code') return <td>{o.tpl_code ? <a className="link" onClick={e => { e.stopPropagation(); showTpl(o) }}>{o.tpl_code}</a> : '—'}</td>
    if (c.k === 'add_name') return <td><Badge value={o.add_name ? '是' : '否'} /></td>
    if (c.k === 'check_collision') return <td><Badge value={o.check_collision ? '是' : '否'} /></td>
    if (c.k === 'region') return <td><a className="link" onClick={e => { e.stopPropagation(); setRegionDetail(o) }}>{o.region || '—'}</a></td>
    if (c.k === 'dup_order_nos') {
      const nos = (o.dup_order_nos || '').split('\n').filter(Boolean)
      if (!nos.length) return <td>—</td>
      return <td style={{ whiteSpace: 'nowrap' }}>{nos.map((no, i) => (
        <React.Fragment key={no}>
          {i > 0 && <br />}
          <a className="link" onClick={e => { e.stopPropagation(); openOrderByNo(no) }}>{no}</a>
        </React.Fragment>
      ))}</td>
    }
    if (c.k === 'price') return <td className="num">{o.price != null ? o.price : '—'}</td>
    if (['province', 'city', 'excl_province', 'excl_city'].includes(c.k)) {
      const val = o[c.k] || ''
      const parts = val.split(/[|｜,，;；]/).map(s => s.trim()).filter(Boolean)
      if (parts.length > 3) return <td title={val}>{parts[0]} 等{parts.length}个</td>
      return <td title={val}>{parts.join('|') || '—'}</td>
    }
    return <td className={num ? 'num' : ''}>{o[c.k] ?? '—'}</td>
  }

  function summarizeFilters() {
    const parts = []
    FILTER_COLS.forEach(c => {
      const v = filters[c.k]
      if (v !== undefined && v !== null && v !== '') {
        parts.push(`${c.l}：${Array.isArray(v) ? v.join('、') : v}`)
      }
    })
    if (filters.start_date) parts.push(`开始日期：${filters.start_date.split(',').filter(Boolean).join('、')}`)
    if (filters.end_date) parts.push(`截止日期：${filters.end_date.split(',').filter(Boolean).join('、')}`)
    if (filters.has_alert === '有') parts.push('预警：有')
    else if (filters.has_alert === '无') parts.push('预警：无')
    if (filters.plat_issue === 'missing') parts.push('品类检查：平台不存在')
    else if (filters.plat_issue === 'no_cat2') parts.push('品类检查：平台无二级品类')
    if (filters.dup === '有') parts.push('重复订单：有')
    return parts.length ? parts.join('\n') : '无筛选条件（导出全部订单）'
  }

  async function exportExcel() {
    const summary = summarizeFilters()
    if (!(await confirm(`确认按以下筛选条件导出订单数据？\n\n${summary}`))) return
    setBusy(true); setBusyMsg('正在导出订单，请稍候…')
    try {
      const qs = buildQuery(filters)
      await downloadFile('/api/orders/export?' + qs)
      toast('订单导出完成')
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function exportTemplate() {
    setBusy(true); setBusyMsg('正在导出模版…')
    try {
      await downloadFile('/api/orders/export-template')
      toast('模版已导出')
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  return (
    <div className="page">
      {confirmEl}
      {picker}
      {busy && <Loading text={busyMsg} progress={busyProgress} />}
      <div className="toolbar">
        <div className={`filter-wrap ${filterCollapsed ? 'collapsed' : ''}`}>
          <FilterBar cols={FILTER_COLS} filters={filters} setFilters={setFilters} onSearch={search} fieldOptions={fieldOptions} actions={false} />
          <MultiSelect full searchable placeholder="开始日期" options={(dateOptions.start_date || []).map(d => ({ value: d, label: fmtYymmdd(d) }))} value={filters.start_date || ''} onChange={v => setFilters({ ...filters, start_date: v })} />
          <MultiSelect full searchable placeholder="截止日期" options={(dateOptions.end_date || []).map(d => ({ value: d, label: fmtYymmdd(d) }))} value={filters.end_date || ''} onChange={v => setFilters({ ...filters, end_date: v })} />
        </div>
        <div className="toolbar-actions">
          <button className="btn primary" onClick={() => search()}>查询</button>
          <button className="btn" onClick={() => { setFilters({}); search({}) }}>重置</button>
          <button className="btn icon" title={filterCollapsed ? '展开查询条件' : '隐藏查询条件'} onClick={() => setFilterCollapsed(!filterCollapsed)}>{filterCollapsed ? IconChevronDown : IconChevronUp}</button>
          {can('order:export') && <button className="btn green" onClick={exportExcel}>导出订单</button>}
          {!isStop && can('order:export_template') && <button className="btn" onClick={exportTemplate}>导出模版</button>}
          {!isStop && can('order:import') && <button className="btn" onClick={() => { setImportResult(null); setImportModal(true) }}>导入订单</button>}
          {!isStop && can('order:import') && <button className="btn" onClick={() => { setReceiptResult(null); setReceiptModal(true) }}>导入回执</button>}
          {!isStop && can('order:tidabiao') && <button className="btn green" onClick={() => { setGenDate(defaultOrderDate()); setGenModal(true) }}>生成提单表</button>}
          {!isStop && can('order:confirm') && <button className="btn orange" onClick={() => setConfirmModal(true)}>提单确认</button>}
          {!isStop && can('order:check_dup') && <button className="btn" onClick={checkDuplicates}>订单验重</button>}
          {can('order:cat_check') && <button className={`btn ${filters.plat_issue ? 'primary' : ''}`} onClick={() => setCatCheckModal(true)}>品类检查</button>}
          {!isStop && can('order:batch_stop') && selected.length > 0 && <button className="btn danger-outline" onClick={batchStop}>批量停单({selected.length})</button>}
          {!isStop && can('order:batch_delete') && selected.length > 0 && <button className="btn danger" onClick={batchDelete}>⚠️ 批量删除({selected.length})</button>}
          {!isStop && can('order:batch_reopen') && selected.length > 0 && <button className="btn" onClick={batchReopen}>批量复提({selected.length})</button>}
          {!isStop && can('order:batch_group') && selected.length > 0 && <button className="btn" onClick={() => { setGroupVal(''); setGroupModal(true) }}>批量修改小组({selected.length})</button>}
          {!isStop && can('order:batch_extend') && selected.length > 0 && <button className="btn" onClick={batchExtend}>批量延期({selected.length})</button>}
          {!isStop && can('order:create') && <button className="btn primary" onClick={openCreate}>+ 新建提单</button>}
          <button className="btn icon" title="自定义表头" onClick={openPicker}>{IconColumns}</button>
        </div>
      </div>

      <div className="panel">
        <div className="table-scroll">
        <table>
          <thead><tr>
            {!isStop && <th style={{ width: 32 }}><input type="checkbox" checked={rows.length > 0 && selected.length === sorted().length} onChange={toggleAll} /></th>}
            {!isStop && <th className="ops">操作</th>}
            {cols.map(c => (
              <th key={c.k} className={['qty', 'pv', 'age_min', 'age_max'].includes(c.k) ? 'num' : ''} onClick={() => setSort(sort?.k === c.k ? (sort.dir === 'asc' ? { k: c.k, dir: 'desc' } : null) : { k: c.k, dir: 'asc' })}>
                {c.l}{sort?.k === c.k ? <span className="arr">{sort.dir === 'asc' ? '▲' : '▼'}</span> : ''}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted().map(o => (
              <tr key={o.id} className={o.has_alert ? 'row-alert' : 'clickable'} onDoubleClick={() => setDetail(o)}>
                {!isStop && <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleSelect(o.id)} onClick={e => e.stopPropagation()} /></td>}
                {!isStop && (
                <td className="ops">
                  {can('order:edit') && (isAdmin || ['在执', '未提', '改单'].includes(o.status)) && <IconBtn title="编辑" color="#2563eb" onClick={e => { e.stopPropagation(); openEdit(o) }}>{IconEdit}</IconBtn>}
                  {can('order:modify') && ['在执', '待停', '改单'].includes(o.status) && <IconBtn title="改单" color="#7c3aed" onClick={e => { e.stopPropagation(); openModify(o) }}>{IconModify}</IconBtn>}
                  {can('order:reopen') && o.status === '已停' && <IconBtn title="复提" color="#059669" onClick={e => { e.stopPropagation(); openReopen(o) }}>{IconReopen}</IconBtn>}
                  {can('order:cancel_stop') && o.status === '待停' && <IconBtn title="取消停单" color="#059669" onClick={e => { e.stopPropagation(); cancelStop(o) }}>{IconUndo}</IconBtn>}
                  {can('order:stop') && ['在执', '改单'].includes(o.status) && <IconBtn title="停单" color="#d97706" onClick={e => { e.stopPropagation(); setStopDate(defaultOrderDate()); setStopReason('业务调整'); setStopTarget(o) }}>{IconStop}</IconBtn>}
                  {can('order:copy') && <IconBtn title="复制新增" color="#0891b2" onClick={e => { e.stopPropagation(); copyCreate(o) }}>{IconCopy}</IconBtn>}
                  {can('order:delete') && <IconBtn title="删除" color="#dc2626" onClick={e => { e.stopPropagation(); delOrder(o) }}>{IconDelete}</IconBtn>}
                </td>
                )}
                {cols.map(c => <React.Fragment key={c.k}>{orderCell(o, c)}</React.Fragment>)}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {rows.length === 0 && <div className="empty">暂无数据</div>}
        <Pagination total={total} page={page} perPage={perPage} setPage={setPage} setPerPage={changePerPage} goPage={goPage} />
      </div>

      {modal && (
        <Modal title={modal === 'create' ? '新建提单' : (modal === 'modify' ? '改单' : '编辑订单')} onClose={() => setModal(null)} wide>
          <div className="region-title" style={{ display: 'flex', alignItems: 'center', gap: 24, paddingRight: 12 }}>
            <span>基础信息</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="required" style={{ margin: 0, fontSize: 12, color: 'var(--sub)', whiteSpace: 'nowrap' }}>更新日期</label>
              <input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} style={{ width: 160, height: 32 }} />
            </div>
          </div>
          <div className="row">
            <div className="field"><label className="required">开始日期</label><input type="date" value={form.start_date} disabled={disBase} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="field"><label className="required">截止日期</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            <div className="field"><label>订单编号</label><input value={form.order_no} disabled placeholder="自动生成" /></div>
            <div className="field"><label>工单号</label><ClearableInput value={form.task_id} disabled={disBase} onChange={e => setForm({ ...form, task_id: e.target.value })} placeholder="自动生成" /></div>
          </div>
          <div className="row">
            <div className="field"><label className="required">上游</label>
              <select value={form.upstream_id} disabled={disBase} onChange={e => setForm({ ...form, upstream_id: e.target.value })}>
                <option value="">请选择</option>{upstreams.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field"><label>状态</label>
              <select value={form.status} disabled={disBase} onChange={e => setForm({ ...form, status: e.target.value })}>
                {['未提', '在执', '待停', '已停', '改单'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field"><label className="required">一级代理</label>
              <select value={form.customer_id} disabled={disBase} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">请选择</option>{customers.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select></div>
            <div className="field"><label>渠道</label>
              <select value={form.channel_id} disabled={disBase} onChange={e => setForm({ ...form, channel_id: e.target.value })}>
                <option value="">请选择</option>{channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <div className="row">
            <div className="field"><label>运营商</label>
              <select value={form.operator_id} disabled={disBase} onChange={e => setForm({ ...form, operator_id: e.target.value })}>
                <option value="">请选择</option>{operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></div>
          </div>

          {showScore && (
            <>
              <div className="region-title">分数信息</div>
              <div className="row">
                <div className="field"><label className="required">任务名</label><ClearableInput value={form.task_name} disabled={isModify} onChange={e => setForm({ ...form, task_name: e.target.value })} /></div>
                <div className="field"><label>平台</label>
                  <ClearableInput list="platform-list" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} placeholder="输入搜索或选择平台" />
                  <datalist id="platform-list">{platforms.map(p => <option key={p.id} value={p.name} />)}</datalist>
                </div>
                <div className="field"><label>分组</label><ClearableInput value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })} placeholder="分组文本" /></div>
                <div className="field"><label>模版编号</label>
                  <select value={form.tpl_id} onChange={e => setForm({ ...form, tpl_id: e.target.value })}>
                    <option value="">请选择模版</option>
                    {tpls.map(t => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
                  </select></div>
              </div>
              <div className="row">
                <div className="field"><label>是否加名</label>
                  <select value={form.add_name ? '是' : '否'} onChange={e => setForm({ ...form, add_name: e.target.value === '是' })}>
                    <option>否</option><option>是</option>
                  </select></div>
                <div className="field"><label>是否撞库</label>
                  <select value={form.check_collision ? '是' : '否'} onChange={e => setForm({ ...form, check_collision: e.target.value === '是' })}>
                    <option>否</option><option>是</option>
                  </select></div>
                <div className="field"><label>定价（元）</label><input type="number" step="0.0001" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="元/条" /></div>
                <div className="field"><label>时长（自动）</label><input value={computedDuration} disabled placeholder="自动计算" /></div>
              </div>
            </>
          )}

          {showTidabiao && (
            <>
              <div className="region-title">提单信息</div>
              <div className="row">
                <div className="field"><label className="required">数量</label><input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></div>
                <div className="field"><label>PV</label><input type="number" value={form.pv} onChange={e => setForm({ ...form, pv: e.target.value })} /></div>
                <div className="field"><label>年龄下限</label><input type="number" value={form.age_min} onChange={e => setForm({ ...form, age_min: e.target.value })} /></div>
                <div className="field"><label>年龄上限</label><input type="number" value={form.age_max} onChange={e => setForm({ ...form, age_max: e.target.value })} /></div>
              </div>
              <div className="row">
                <div className="field"><label>省份（含全国）</label><MultiSelect full searchable options={provinceOptions} value={form.province} onChange={v => {
                  let provs = v.split(',').filter(Boolean)
                  const national = provs.includes('全国')
                  if (national) provs = ['全国']
                  setForm({ ...form, province: provs.join(','), city: '', excl_city: '', excl_province: national ? form.excl_province : '' })
                }} placeholder="选择省份" /></div>
                <div className="field"><label>地市（随省份联动）</label><MultiSelect full searchable disabled={isNational} options={cityOptions} value={form.city} onChange={v => setForm({ ...form, city: v })} placeholder={isNational ? '省份为全国不可选' : (cityOptions.length ? '选择地市' : '请先选择省份')} /></div>
              </div>
              <div className="row">
                <div className="field"><label>排除省（仅全国）</label><MultiSelect full searchable disabled={!isNational} options={geo.provinces} value={form.excl_province} onChange={v => setForm({ ...form, excl_province: v })} placeholder={isNational ? '选择排除省' : '省份非全国不可选'} /></div>
                <div className="field"><label>排除市（随省份联动）</label><MultiSelect full searchable disabled={!exclCityOptions.length} options={exclCityOptions} value={form.excl_city} onChange={v => setForm({ ...form, excl_city: v })} placeholder={exclCityOptions.length ? '选择排除市' : '请先选择省份'} /></div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}><label className="required">URL（多行，一行一个）</label>
                <textarea rows={3} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
            </>
          )}
          <div className="foot">
            <button className="btn" onClick={() => setModal(null)}>取消</button>
            <button className="btn primary" onClick={save}>保存</button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`订单 ${detail.order_no} 详情`} onClose={() => setDetail(null)} wide>
          {DETAIL_REGIONS.map(region => (
            <div key={region.title}>
              <div className="region-title">{region.title}</div>
              {Array.from({ length: Math.ceil(region.keys.length / 4) }, (_, ri) => (
                <div className="row" key={ri}>
                  {region.keys.slice(ri * 4, ri * 4 + 4).map(k => {
                    const c = BASE_COLS.find(x => x.k === k)
                    if (!c) return null
                    const isRegion = ['province', 'city', 'excl_province', 'excl_city'].includes(k)
                    const isBool = ['add_name', 'check_collision'].includes(k)
                    const val = isRegion ? fmtRegion(detail[k]) : isBool ? (detail[k] ? '是' : '否') : (detail[k] ?? '—')
                    return (
                      <div className="field" key={k}>
                        <label>{c.l}</label>
                        <div className="readonly" title={val} style={isRegion ? { height: 'auto', minHeight: 32, whiteSpace: 'pre-wrap' } : {}}>{val || '—'}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
          <div className="row">
            <div className="field">
              <label>URL 列表</label>
              <div className="readonly" style={{ height: 'auto', minHeight: 32, whiteSpace: 'pre-wrap', padding: '6px 13px' }}>{(detail.urls || []).join('\n') || '—'}</div>
            </div>
          </div>
          <div className="row">
            <div className="field"><label>创建时间</label><div className="readonly">{detail.created_at || '—'}</div></div>
            <div className="field"><label>创建人</label><div className="readonly">{detail.created_by || '—'}</div></div>
            <div className="field"><label>更新时间</label><div className="readonly">{detail.updated_at || '—'}</div></div>
            <div className="field"><label>更新人</label><div className="readonly">{detail.updated_by || '—'}</div></div>
          </div>
          <div className="foot"><button className="btn primary" onClick={() => setDetail(null)}>关闭</button></div>
        </Modal>
      )}

      {stopTarget && (
        <Modal title={stopTarget.batch ? '批量停单确认' : '停单确认'} onClose={() => setStopTarget(null)}>
          <div className="note">{stopTarget.batch ? `停单选中的 ${stopTarget.ids.length} 个订单，停单后将停止采集，并将更新日期更新为所选日期。` : '停单后该订单将停止采集，并将更新日期更新为所选日期。'}</div>
          <div className="field" style={{ marginBottom: 12 }}><label className="required">更新日期</label>
            <input type="date" value={stopDate} onChange={e => setStopDate(e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 12 }}><label>停单原因</label>
            <select style={{ width: '100%' }} value={stopReason} onChange={e => setStopReason(e.target.value)}><option>业务调整</option><option>数据质量不达标</option><option>合同到期</option><option>其他</option></select></div>
          <div className="foot">
            <button className="btn" onClick={() => setStopTarget(null)}>取消</button>
            <button className="btn danger" onClick={stop}>确认停单</button>
          </div>
        </Modal>
      )}

      {reopenTarget && (
        <Modal title="批量复提确认" onClose={() => setReopenTarget(null)}>
          <div className="note">将选中的 {reopenTarget.ids.length} 个订单从「已停」改为「未提」。可修改更新日期（默认当天）、开始日期、截止日期。</div>
          <div className="row">
            <div className="field"><label className="required">更新日期</label><input type="date" value={batchReopenForm.order_date} onChange={e => setBatchReopenForm({ ...batchReopenForm, order_date: e.target.value })} /></div>
            <div className="field"><label>开始日期</label><input type="date" value={batchReopenForm.start_date} onChange={e => setBatchReopenForm({ ...batchReopenForm, start_date: e.target.value })} /></div>
            <div className="field"><label>截止日期</label><input type="date" value={batchReopenForm.end_date} onChange={e => setBatchReopenForm({ ...batchReopenForm, end_date: e.target.value })} /></div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setReopenTarget(null)}>取消</button>
            <button className="btn primary" onClick={doReopen}>确认复提</button>
          </div>
        </Modal>
      )}

      {extendTarget && (
        <Modal title="批量延期确认" onClose={() => setExtendTarget(null)}>
          <div className="note">将选中的 {extendTarget.ids.length} 个订单的截止日期更新为所选日期。</div>
          <div className="field" style={{ marginBottom: 12 }}><label className="required">截止日期</label>
            <input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setExtendTarget(null)}>取消</button>
            <button className="btn primary" onClick={doExtend}>确认延期</button>
          </div>
        </Modal>
      )}

      {reopenOrder && (
        <Modal title={`复提 · ${reopenOrder.task_name || reopenOrder.order_no}`} onClose={() => setReopenOrder(null)}>
          <div className="note">将该订单从「已停」改为「未提」。可修改更新日期（默认当天）、开始日期、截止日期。</div>
          <div className="row">
            <div className="field"><label className="required">更新日期</label><input type="date" value={reopenForm.order_date} onChange={e => setReopenForm({ ...reopenForm, order_date: e.target.value })} /></div>
            <div className="field"><label>开始日期</label><input type="date" value={reopenForm.start_date} onChange={e => setReopenForm({ ...reopenForm, start_date: e.target.value })} /></div>
            <div className="field"><label>截止日期</label><input type="date" value={reopenForm.end_date} onChange={e => setReopenForm({ ...reopenForm, end_date: e.target.value })} /></div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setReopenOrder(null)}>取消</button>
            <button className="btn primary" onClick={doReopenOrder}>确认复提</button>
          </div>
        </Modal>
      )}

      {urlDetail && (
        <Modal title={`订单 ${urlDetail.order_no} · URL 详情`} onClose={() => setUrlDetail(null)}>
          <table><thead><tr><th>URL</th></tr></thead>
            <tbody>{(urlDetail.urls || []).map((u, i) => <tr key={i}><td>{u}</td></tr>)}</tbody></table>
          {(urlDetail.urls || []).length === 0 && <div className="empty">暂无 URL</div>}
          <div className="foot"><button className="btn primary" onClick={() => setUrlDetail(null)}>关闭</button></div>
        </Modal>
      )}

      {regionDetail && (
        <Modal title={`订单 ${regionDetail.order_no} · 地区详情`} onClose={() => setRegionDetail(null)}>
          <table className="kv"><tbody>
            <tr><td>省份</td><td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fmtRegion(regionDetail.province) || '—'}</td></tr>
            <tr><td>地市</td><td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fmtRegion(regionDetail.city) || '—'}</td></tr>
            <tr><td>排除省份</td><td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fmtRegion(regionDetail.excl_province) || '—'}</td></tr>
            <tr><td>排除地市</td><td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fmtRegion(regionDetail.excl_city) || '—'}</td></tr>
          </tbody></table>
          <div className="foot"><button className="btn primary" onClick={() => setRegionDetail(null)}>关闭</button></div>
        </Modal>
      )}

      {tplPreview && (
        <Modal title={`模版预览 · ${tplPreview.filename}`} onClose={() => setTplPreview(null)} wide>
          {tplPreview.sheets.map((s, si) => (
            <div key={si} style={{ marginBottom: 12 }}>
              <div className="note" style={{ marginBottom: 6 }}>工作表：{s.name}</div>
              <div className="table-scroll" style={{ maxHeight: 420 }}>
                <div dangerouslySetInnerHTML={{ __html: s.html }} />
              </div>
            </div>
          ))}
          <div className="foot"><button className="btn primary" onClick={() => setTplPreview(null)}>关闭</button></div>
        </Modal>
      )}

      {importModal && (
        <Modal title="批量导入原始订单" onClose={() => setImportModal(false)}>
          <div className="note">支持 csv / xlsx。表头参考【模版】提单表.xlsx：开始、截止、更新、状态、甲方、订单号、工单号、代理、定价、平台、小组、模版、加名、撞库、渠道、运营商、任务名、url、数量、时长、下限、上限、pv、省份、排除省份、地市、排除地市。</div>
          <input type="file" accept=".csv,.xlsx,.xls" ref={importFileRef} />
          {importResult && (
            <div>
              <div className="note" style={{ background: importResult.errors.length ? '#fef2f2' : '#ecfdf5', border: '1px solid ' + (importResult.errors.length ? '#fecaca' : '#a7f3d0') }}>
                导入 {importResult.imported} 条，更新 {importResult.updated || 0} 条，失败 {importResult.errors.length} 条
                {importResult.errors.length > 0 && (
                  <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 6 }}>
                    {importResult.errors.map((e, i) => <div key={i}>第 {e.row} 行：{e.reason}</div>)}
                  </div>
                )}
              </div>
              {(importResult.warnings || []).length > 0 && (
                <div className="note" style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                  身份字段提醒 {importResult.warnings.length} 条
                  {importResult.warnings.slice(0, 10).map((w, i) => <div key={i}>第 {w.row} 行：{w.reason}</div>)}
                </div>
              )}
            </div>
          )}
          <div className="foot">
            <button className="btn" onClick={() => setImportModal(false)}>关闭</button>
            <button className="btn primary" disabled={importResult !== null} onClick={() => {
              const f = importFileRef.current?.files?.[0]
              if (!f) { showError('请选择文件'); return }
              importOrders(f).then(() => toast('导入完成')).catch(e => showError(e.message))
            }}>{importResult !== null ? '已导入' : '开始导入'}</button>
          </div>
        </Modal>
      )}

      {receiptModal && (
        <Modal title="导入回执（按任务名更新工单号）" onClose={() => setReceiptModal(false)} wide>
          <div className="note">回执文件需包含「任务名」「任务ID/工单号」「运营商」「渠道（类型）」列，将按 回执来源 + 任务名 + 运营商 + 渠道 且工单号为空 匹配订单并更新工单号；未匹配或多匹配会提示且不更新。</div>
          <div className="row">
            <div className="field"><label>回执来源</label>
              <select value={receiptParty} onChange={e => setReceiptParty(e.target.value)}>
                {upstreams.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select></div>
          </div>
          <input type="file" accept=".xlsx,.xls" ref={receiptFileRef} />
          {receiptResult && (
            <div className="table-scroll" style={{ maxHeight: 420 }}>
              <div className="note" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                更新 {receiptResult.updated} 条
                <table style={{ marginTop: 6, width: '100%' }}>
                  <thead><tr><th>回执来源</th><th>工单号</th><th>任务名</th><th>运营商</th><th>类型</th></tr></thead>
                  <tbody>
                    {(receiptResult.updated_list || []).map((e, i) => (
                      <tr key={i}><td>{e.party}</td><td>{e.task_id}</td><td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{e.task_name}</td><td>{e.operator}</td><td>{e.channel}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(receiptResult.errors || []).length > 0 && (
                <div className="note" style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
                  失败 {receiptResult.errors.length} 条
                  <table style={{ marginTop: 6, width: '100%' }}>
                    <thead><tr><th>工单号</th><th>任务名</th><th>原因</th></tr></thead>
                    <tbody>
                      {receiptResult.errors.map((e, i) => (
                        <tr key={i}><td>{e.task_id || '—'}</td><td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{e.task_name}</td><td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{e.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div className="foot">
            <button className="btn" onClick={() => setReceiptModal(false)}>关闭</button>
            <button className="btn primary" disabled={receiptResult !== null} onClick={() => {
              const f = receiptFileRef.current?.files?.[0]
              if (!f) { showError('请选择文件'); return }
              importReceipt(f).then(() => toast('回执导入完成')).catch(e => showError(e.message))
            }}>{receiptResult !== null ? '已导入' : '开始导入'}</button>
          </div>
        </Modal>
      )}

      {genModal && (
        <Modal title="生成提单表" onClose={() => setGenModal(false)}>
          <div className="note">按勾选的订单生成文件（不改变订单状态）。勾选订单的更新日期必须与所选日期一致。状态规则：未提→提单表，改单→改单表，待停→停单表。</div>
          <div className="field" style={{ marginBottom: 14 }}><label>更新日期</label>
            <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setGenModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doGenerate().catch(e => showError(e.message))}>生成</button>
          </div>
        </Modal>
      )}

      {confirmModal && (
        <Modal title="提单确认" onClose={() => setConfirmModal(false)}>
          <div className="note">选择提单日期，对更新日期与提单日期一致的订单更新状态：未提/改单→在执，待停→已停；并同步写入提单历史。</div>
          <div className="field" style={{ marginBottom: 14 }}><label>提单日期</label>
            <input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setConfirmModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doConfirm().catch(e => showError(e.message))}>确认</button>
          </div>
        </Modal>
      )}

      {pendingCheck && (
        <Modal title="存在早于提单日期的未确认订单" onClose={() => setPendingCheck(null)} wide>
          <div className="note" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            存在 {pendingCheck.length} 条更新日期早于所选提单日期的订单，仍为「未提/待停/改单」，可能遗漏了提单确认。是否继续提单确认？
          </div>
          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr><th>更新日期</th><th>订单号</th><th>任务名</th><th>状态</th></tr></thead>
              <tbody>
                {pendingCheck.map((o, i) => (
                  <tr key={i}><td>{o.order_date}</td><td>{o.order_no}</td><td>{o.task_name}</td><td><Badge value={o.status} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setPendingCheck(null)}>取消</button>
            <button className="btn primary" onClick={() => { setPendingCheck(null); runConfirm().catch(e => showError(e.message)) }}>继续提单确认</button>
          </div>
        </Modal>
      )}

      {groupModal && (
        <Modal title={`批量修改小组（${selected.length} 单）`} onClose={() => setGroupModal(false)}>
          <div className="field" style={{ marginBottom: 14 }}><label>小组</label>
            <ClearableInput value={groupVal} onChange={e => setGroupVal(e.target.value)} placeholder="留空则清空小组" /></div>
          <div className="foot">
            <button className="btn" onClick={() => setGroupModal(false)}>取消</button>
            <button className="btn primary" onClick={batchGroup}>保存</button>
          </div>
        </Modal>
      )}

      {catCheckModal && (
        <Modal title="品类检查" onClose={() => setCatCheckModal(false)}>
          <div className="note">根据品类管理中的平台与二级品类数据，过滤存在问题的订单。</div>
          <div className="batch-del-list">
            <button className={`batch-del-item ${filters.plat_issue === 'missing' ? 'on' : ''}`} onClick={() => doCatCheck('missing')}>
              <span className="bd-title">平台不存在检查</span>
              <span className="bd-sub">过滤 platform 为空、或不在品类管理平台表中的订单</span>
            </button>
            <button className={`batch-del-item ${filters.plat_issue === 'no_cat2' ? 'on' : ''}`} onClick={() => doCatCheck('no_cat2')}>
              <span className="bd-title">平台无二级品类检查</span>
              <span className="bd-sub">过滤平台存在、但没有有效二级品类的订单</span>
            </button>
          </div>
          <div className="foot"><button className="btn" onClick={() => setCatCheckModal(false)}>取消</button></div>
        </Modal>
      )}
    </div>
  )
}
