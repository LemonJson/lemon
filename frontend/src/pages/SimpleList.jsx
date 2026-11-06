import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, getToken, downloadFile, uploadFile } from '../api'
import { Modal, Badge, useToast, useConfirm, Loading, ClearableInput } from '../components/ui'
import { useColumnConfig, downloadCsv } from '../components/columns'
import FilterBar, { buildQuery } from '../components/FilterBar'
import Pagination from '../components/Pagination'
import { useButtonPerm } from '../buttonPerms'

function toDateInput(val) {
  if (!val) return ''
  return String(val).replace(/\//g, '-')
}

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
const IconDelete = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
)
const IconKey = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
)
const IconLock = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
)

function IconBtn({ title, color, onClick, children }) {
  return (
    <button className="icon-btn" title={title} onClick={onClick} style={{ color }}>{children}</button>
  )
}

const KINDS = {
  daily: {
    title: '日活数据', endpoint: '/api/daily-data', perm: 'daily',
    cols: [
      { k: 'biz_date', l: '数据日期' }, { k: 'upstream', l: '甲方' }, { k: 'task_id', l: '任务id' },
      { k: 'task_name', l: '任务名' }, { k: 'phone', l: '手机号' }, { k: 'name', l: '姓名' }, { k: 'province', l: '省' },
      { k: 'city', l: '市' }, { k: 'operator', l: '运营商' }, { k: 'cat1', l: '一级品类' }, { k: 'cat2', l: '二级品类' }, { k: 'platform', l: '平台' },
      { k: 'customer', l: '一级代理' }, { k: 'channel', l: '渠道' },
      { k: 'group_name', l: '小组' },
      { k: 'source_file', l: '来源文件名' }, { k: 'created_at', l: '创建时间' }, { k: 'updated_at', l: '更新时间' },
    ], export: true, dailyImp: true, csvImp: true, batchDel: true, batchDelAdmin: true, dist: true, check: true, showSeq: true, defaultPerPage: 500, dailyEdit: true,
      defaultHidden: ['name', 'cat1', 'cat2', 'source_file'],
  },
  sourcefiles: {
    title: '文件管理', endpoint: '/api/source-files', perm: 'file',
    cols: [
      { k: 'filename', l: '文件名' }, { k: 'category', l: '文件类型' }, { k: 'file_type', l: '扩展名' }, { k: 'biz_date', l: '数据日期' },
      { k: 'size', l: '大小' }, { k: 'created_at', l: '上传时间' },
    ], dl: true, del: true,
  },
  washnames: {
    title: '洗名库', endpoint: '/api/wash-names', perm: 'wash',
    cols: [
      { k: 'phone', l: '手机号' }, { k: 'name', l: '姓名' },
      { k: 'province', l: '省' }, { k: 'city', l: '市' }, { k: 'operator', l: '运营商' },
      { k: 'created_at', l: '创建日期' }, { k: 'updated_at', l: '更新日期' },
    ], batchDel: true, imp: true, impEndpoint: '/api/wash-names/import',
  },
  fund: {
    title: '公积金', endpoint: '/api/fund', perm: 'fund',
    cols: [
      { k: 'phone', l: '手机号' }, { k: 'name', l: '姓名' }, { k: 'id_card', l: '身份证号' }, { k: 'gender', l: '性别' },
      { k: 'province', l: '省份' }, { k: 'city', l: '地市' }, { k: 'company', l: '单位名称' }, { k: 'company_type', l: '单位性质' },
      { k: 'base', l: '缴存基数（元）', num: true }, { k: 'ratio', l: '缴存比例' }, { k: 'monthly', l: '月缴存额（元）', num: true },
      { k: 'balance', l: '账户余额（元）', num: true }, { k: 'deposit_status', l: '缴存状态' }, { k: 'open_date', l: '开户日期' },
      { k: 'pay_to', l: '缴至年月' }, { k: 'operator', l: '运营商' },
    ], del: true, imp: true, exp: true,
  },
  channels: {
    title: '渠道', endpoint: '/api/channels', perm: 'channel',
    cols: [{ k: 'name', l: '渠道名' }, { k: 'status', l: '状态' }], simple: true,
  },
  operators: {
    title: '运营商', endpoint: '/api/operators', perm: 'operator',
    cols: [{ k: 'name', l: '运营商组合' }, { k: 'status', l: '状态' }], simple: true,
  },
  urls: {
    title: '配件管理', endpoint: '/api/urls', perm: 'parts',
    cols: [
      { k: 'name', l: '名称' }, { k: 'owner', l: '归属' }, { k: 'cat1', l: '一级品类' }, { k: 'cat2', l: '二级品类' },
      { k: 'platform', l: '平台' }, { k: 'channel', l: '渠道' }, { k: 'url', l: 'URL', multiline: true }, { k: 'level', l: '等级' }, { k: 'updated_at', l: '更新时间' },
    ], addUrl: true, del: true, editUrl: true, imp: true, impEndpoint: '/api/urls/import', clear: true,
  },
  bills: {
    title: '账单', endpoint: '/api/bills', perm: 'bill',
    filterCols: [
      { k: 'customer', l: '客户' }, { k: 'biz_date', l: '业务日期' },
    ],
    cols: [
      { k: 'customer', l: '客户' }, { k: 'biz_date', l: '业务日期' }, { k: 'purchase_qty', l: '进货量', num: true },
      { k: 'sales', l: '销售金额（元）', num: true }, { k: 'balance', l: '余额（元）', num: true }, { k: 'profit', l: '利润（元）', num: true },
      { k: 'created_by', l: '创建人' }, { k: 'created_at', l: '创建时间' }, { k: 'updated_at', l: '更新时间' }, { k: 'updated_by', l: '更新人' },
    ], defaultHidden: ['updated_at', 'updated_by'], batchDel: true, batchDelAdmin: true, detail: true, imp: true, impEndpoint: '/api/bills/import', billExp: true,
  },
  alerts: {
    title: '预警中心', endpoint: '/api/alerts',
    cols: [
      { k: 'type', l: '类型' }, { k: 'customer_name', l: '客户名' },
      { k: 'order_no', l: '订单编号' }, { k: 'task_name', l: '任务名' }, { k: 'content', l: '内容' }, { k: 'time', l: '触发时间' },
    ], handle: true,
  },
  users: {
    title: '账户管理', endpoint: '/api/users',
    cols: [
      { k: 'username', l: '用户名' }, { k: 'nickname', l: '昵称' }, { k: 'role', l: '角色' },
      { k: 'status', l: '状态' }, { k: 'last_login_at', l: '最后登录' },
      { k: 'created_by', l: '创建人' }, { k: 'created_at', l: '创建时间' },
      { k: 'updated_at', l: '更新时间' }, { k: 'updated_by', l: '更新人' },
    ], defaultHidden: ['updated_at', 'updated_by'], reset: true, pwd: true,
  },
}

export default function SimpleList({ kind }) {
  const cfg = KINDS[kind]
  const { can } = useButtonPerm()
  const showBatchDel = !!cfg.batchDel && can(`${cfg.perm}:batch_delete`)
  const hasRowOps = !!(cfg.simple || cfg.editUrl || cfg.del || cfg.dl || cfg.handle || cfg.reset || cfg.pwd || cfg.detail || cfg.dailyEdit)
  const { toast, showError } = useToast()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [confirm, confirmEl] = useConfirm()
  const { visible: cols, picker, openPicker } = useColumnConfig(cfg.cols, `cols_${kind}_v2`, cfg.defaultHidden || [])
  const fileRef = useRef(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [filters, setFilters] = useState({})
  const [filterCollapsed, setFilterCollapsed] = useState(false)
  const [fieldOptions, setFieldOptions] = useState({})
  const [cascadeOpts, setCascadeOpts] = useState(null)
  const [customers, setCustomers] = useState([])
  const [simpleModal, setSimpleModal] = useState(null) // {name, status}
  const [dailyEdit, setDailyEdit] = useState(null) // {id, biz_date, upstream, task_id, ...}
  const [urlModal, setUrlModal] = useState(null) // {mode, id?, name, level, owner_id, channel_id, platform_id, urls:[string]}
  const [urlOptions, setUrlOptions] = useState({ channels: [], platforms: [] })
  const [pwdModal, setPwdModal] = useState(null)
  const [userEdit, setUserEdit] = useState(null)
  const [userCreate, setUserCreate] = useState(null)
  const [roles, setRoles] = useState([])
  const [roleCreate, setRoleCreate] = useState(null)
  const [sort, setSort] = useState(null)
  const [alertTrigger, setAlertTrigger] = useState('00:00')
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('正在导入，请稍候…')
  const [busyProgress, setBusyProgress] = useState(null)
  const [selected, setSelected] = useState([])
  const [dailyModal, setDailyModal] = useState(false)
  const [orderDetail, setOrderDetail] = useState(null)
  const [distModal, setDistModal] = useState(false)
  const [distDate, setDistDate] = useState('')
  const [distCustomerIds, setDistCustomerIds] = useState([])
  const [billDetail, setBillDetail] = useState(null)
  const [balanceEdit, setBalanceEdit] = useState(null)
  const [dailyDate, setDailyDate] = useState('')
  const dailyFileRef = useRef(null)
  const [csvModal, setCsvModal] = useState(false)
  const [csvFile, setCsvFile] = useState(null)
  const csvFileRef = useRef(null)
  const [washModal, setWashModal] = useState(false)
  const [washDate, setWashDate] = useState('')
  const washFileRef = useRef(null)
  const [sfModal, setSfModal] = useState(false)
  const [sfCategory, setSfCategory] = useState('手动')
  const sfFileRef = useRef(null)
  const [billExpModal, setBillExpModal] = useState(false)
  const [billExpStart, setBillExpStart] = useState('')
  const [billExpEnd, setBillExpEnd] = useState('')
  const [billExpCustId, setBillExpCustId] = useState(0)
  const [billSummaryModal, setBillSummaryModal] = useState(false)
  const [billSummaryType, setBillSummaryType] = useState('day')
  const [billSummaryDate, setBillSummaryDate] = useState('')
  const [billSummaryStart, setBillSummaryStart] = useState('')
  const [billSummaryEnd, setBillSummaryEnd] = useState('')
  const [genBillModal, setGenBillModal] = useState(false)
  const [genBillType, setGenBillType] = useState('day')
  const [genBillDate, setGenBillDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [genBillStart, setGenBillStart] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [genBillEnd, setGenBillEnd] = useState('')
  const [genBillCustomerIds, setGenBillCustomerIds] = useState([])
  const [checkModal, setCheckModal] = useState(false)
  const [checkDate, setCheckDate] = useState('')
  const [checkUpstream, setCheckUpstream] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [repeatDetailModal, setRepeatDetailModal] = useState(null)
  const [exportModal, setExportModal] = useState(false)
  const [exportType, setExportType] = useState('excel')
  const [batchDelModal, setBatchDelModal] = useState(false)
  const [delByDateModal, setDelByDateModal] = useState(false)
  const [delByDate, setDelByDate] = useState('')
  const [rechargeAlert, setRechargeAlert] = useState(null)
  const [rechargeRate, setRechargeRate] = useState(6.7)
  const [recentDays, setRecentDays] = useState(3)
  const [stopAlert, setStopAlert] = useState(null)
  const [importWarn, setImportWarn] = useState(null) // {title, items:[{task_id,task_name,channel}], confirm:boolean}
  const [pendingImportFiles, setPendingImportFiles] = useState(null)
  const [extractModal, setExtractModal] = useState(false)
  const [extractForm, setExtractForm] = useState({ start_date: '', end_date: '', limit: 100, target_type: '代理', customer_id: '', target_name: '', price: '', note: '' })

  useEffect(() => {
    if (kind === 'alerts') {
      api.get('/api/alert-config').then(r => { setAlertTrigger(r.data.trigger_time) }).catch(() => {})
      api.get('/api/customers/recharge-rate').then(r => setRechargeRate(r.data.rate)).catch(() => {})
    }
  }, [kind])
  async function withBusy(fn, msg = '处理中，请稍候…') {
    setBusy(true); setBusyMsg(msg); setBusyProgress(null)
    try {
      return await fn()
    } finally {
      setBusy(false); setBusyProgress(null)
    }
  }
  async function saveAlertConfig() {
    await withBusy(async () => {
      await api.put('/api/alert-config', { trigger_time: alertTrigger })
      toast('预警配置已保存')
    }, '正在保存…')
  }

  function toggleSort(k) {
    setSort(s => (s && s.k === k) ? (s.dir === 'asc' ? { k, dir: 'desc' } : null) : { k, dir: 'asc' })
  }
  const sorted = useMemo(() => {
    if (!sort) return rows
    return [...rows].sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k]
      const na = typeof va === 'number' ? va : (va == null ? '' : String(va))
      const nb = typeof vb === 'number' ? vb : (vb == null ? '' : String(vb))
      if (na < nb) return sort.dir === 'asc' ? -1 : 1
      if (na > nb) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, sort])
  function cascadeFieldOptions() {
    const base = { ...fieldOptions }
    if (kind !== 'daily' || !cascadeOpts) return base
    const uniq = arr => [...new Set(arr)]
    if (cascadeOpts.cat1) base.cat1 = cascadeOpts.cat1
    if (cascadeOpts.cat2_map) {
      base.cat2 = filters.cat1 ? (cascadeOpts.cat2_map[filters.cat1] || []) : uniq(Object.values(cascadeOpts.cat2_map).flat())
    }
    if (cascadeOpts.platform_map) {
      base.platform = filters.cat2 ? (cascadeOpts.platform_map[filters.cat2] || []) : uniq(Object.values(cascadeOpts.platform_map).flat())
    }
    if (cascadeOpts.channel_map) {
      base.channel = filters.customer ? (cascadeOpts.channel_map[filters.customer] || []) : uniq(Object.values(cascadeOpts.channel_map).flat())
    }
    if (cascadeOpts.group_name) base.group_name = cascadeOpts.group_name
    return base
  }
  function handleSetFilters(next) {
    if (kind === 'daily') {
      if (next.cat1 !== filters.cat1) { next.cat2 = ''; next.platform = '' }
      if (next.cat2 !== filters.cat2) { next.platform = '' }
      if (next.customer !== filters.customer) { next.channel = '' }
    }
    setFilters(next)
  }

  async function load(p = page, pp = perPage, f) {
    const qs = buildQuery(f === undefined ? filters : f)
    const params = qs ? qs + `&page=${p}&per_page=${pp}` : `page=${p}&per_page=${pp}`
    const r = await api.get(`${cfg.endpoint}?${params}`)
    setRows(r.data.rows); setTotal(r.data.total)
  }
  function search(f) { setPage(1); withBusy(() => load(1, perPage, f), '正在查询…') }
  function goPage(p) { setPage(p); load(p, perPage) }
  function changePerPage(pp) { setPerPage(pp); setPage(1); withBusy(() => load(1, pp), '正在查询…') }
  function dateNDaysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - (n || 0))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function defaultFilters() {
    return kind === 'daily' ? { start_date: dateNDaysAgo(recentDays) } : {}
  }
  useEffect(() => {
    setPage(1)
    const pp = cfg.defaultPerPage || 100
    setPerPage(pp)
    if (kind === 'daily') {
      api.get('/api/config-center').then(r => {
        const days = parseInt((r.data || []).find(i => i.key === 'daily_recent_days')?.value) || 3
        setRecentDays(days)
        const f = { start_date: dateNDaysAgo(days) }
        setFilters(f)
        load(1, pp, f)
      }).catch(() => {
        const f = { start_date: dateNDaysAgo(3) }
        setFilters(f)
        load(1, pp, f)
      })
    } else {
      setFilters({})
      load(1, pp, {})
    }
  }, [kind])

  const actionDone = useRef(false)
  useEffect(() => {
    const action = searchParams.get('action')
    if (kind !== 'daily' || actionDone.current) return
    if (action === 'daily') { setDailyModal(true); actionDone.current = true }
    if (action === 'wash') { setWashModal(true); actionDone.current = true }
    if (action === 'washimport') { toast('请点击「③ 导入洗名」上传洗名文件'); actionDone.current = true }
    if (action === 'dist' && customers.length) {
      setDistCustomerIds(customers.filter(c => c.ctype === 'downstream').map(c => c.id))
      setDistModal(true); actionDone.current = true
    }
  }, [searchParams, kind, customers])

  // 加载下拉选项（渠道/客户/品类/省市等）
  useEffect(() => {
    const setOpt = (k, arr) => setFieldOptions(o => ({ ...o, [k]: arr }))
    if (['users', 'channels', 'operators'].includes(kind)) setOpt('status', ['启用', '停用'])
    api.get('/api/customers?per_page=1000').then(r => setCustomers(r.data.rows)).catch(() => {})
    const need = {
      fund: [],
      bills: ['customer'],
      urls: ['channel', 'cat1', 'cat2'],
    }[kind] || []
    if (need.includes('channel')) api.get('/api/channels?per_page=1000').then(r => setOpt('channel', r.data.rows.map(c => c.name))).catch(() => {})
    if (need.includes('customer')) api.get('/api/customers?per_page=1000').then(r => setOpt('customer', r.data.rows.map(c => c.code))).catch(() => {})
    if (kind === 'urls') {
      api.get('/api/channels?per_page=1000').then(r => setUrlOptions(o => ({ ...o, channels: r.data.rows }))).catch(() => {})
      api.get('/api/platforms').then(r => setUrlOptions(o => ({ ...o, platforms: r.data }))).catch(() => {})
      api.get('/api/customers?per_page=1000').then(r => setOpt('owner', r.data.rows.map(c => ({ value: c.code, label: `${c.code} ${c.name}` })))).catch(() => {})
    }
    if (need.includes('cat1') || need.includes('cat2')) {
      api.get('/api/categories').then(r => {
        const cat1 = [], cat2 = []
        r.data.forEach(c => { cat1.push(c.name); (c.children || []).forEach(x => cat2.push(x.name)) })
        setOpt('cat1', cat1); setOpt('cat2', cat2)
      }).catch(() => {})
    }
    // 日活数据：甲方/运营商/一级代理/省市 + 级联选项（品类/代理→二级代理/渠道）
    if (kind === 'daily') {
      api.get('/api/customers?per_page=1000').then(r => {
        setOpt('upstream', r.data.rows.filter(c => c.ctype === 'upstream').map(c => c.name))
        setOpt('customer', r.data.rows.filter(c => c.ctype === 'downstream').map(c => c.code))
      }).catch(() => {})
      api.get('/api/operators?per_page=1000').then(r => setOpt('operator', r.data.rows.map(o => o.name))).catch(() => {})
      api.get('/api/regions').then(r => {
        const allCities = []
        Object.values(r.data.cities).forEach(list => allCities.push(...list))
        setOpt('province', r.data.provinces); setOpt('city', allCities)
      }).catch(() => {})
      api.get('/api/daily-data/filter-options').then(r => setCascadeOpts(r.data)).catch(() => {})
    }
    // 省份/地市来自基础数据（多选）
    if (kind === 'fund') {
      api.get('/api/regions').then(r => {
        const allCities = []
        Object.values(r.data.cities).forEach(list => allCities.push(...list))
        setOpt('province', r.data.provinces); setOpt('city', allCities)
      }).catch(() => {})
    }
    if (kind === 'washnames') {
      api.get('/api/regions').then(r => {
        const allCities = []
        Object.values(r.data.cities).forEach(list => allCities.push(...list))
        setOpt('province', r.data.provinces); setOpt('city', allCities)
      }).catch(() => {})
    }
    // 其他去重字段
    const distinctFields = { fund: ['company_type', 'operator'] }[kind] || []
    const distinctModel = kind === 'fund' ? 'fund' : 'daily_data'
    distinctFields.forEach(f => api.get(`/api/distinct?model=${distinctModel}&field=${f}`).then(r => setOpt(f, r.data)).catch(() => {}))
  }, [kind])

  async function addSimple() {
    if (await confirm('确认新增该记录？')) {
      await withBusy(async () => {
        await api.post(cfg.endpoint, { name: simpleModal.name, status: 1 })
        toast('已新增'); setSimpleModal(null); load()
      }, '正在新增…')
    }
  }
  function openDailyEdit(r) {
    setDailyEdit({
      id: r.id, biz_date: toDateInput(r.biz_date), upstream: r.upstream || '', task_id: r.task_id || '',
      task_name: r.task_name || '', phone: r.phone || '', name: r.name || '', province: r.province || '',
      city: r.city || '', operator: r.operator || '', cat1: r.cat1 || '', cat2: r.cat2 || '',
      platform: r.platform || '', customer: r.customer || '', secondary_agent: r.secondary_agent || '',
      channel: r.channel || '',
    })
  }
  async function saveDailyEdit() {
    if (!(dailyEdit.phone || '').trim()) { showError('手机号不能为空'); return }
    try {
      await withBusy(async () => {
        await api.put(`/api/daily-data/${dailyEdit.id}`, dailyEdit)
        toast('已更新'); setDailyEdit(null); load()
      }, '正在保存…')
    } catch (e) { showError(e.message) }
  }
  async function del(id) {
    if (await confirm('确认删除该记录？')) {
      await withBusy(async () => {
        await api.del(`${cfg.endpoint}/${id}`); toast('已删除'); load()
      }, '正在删除…')
    }
  }
  function toggleSelect(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  function toggleAll() {
    const ids = sorted.map(o => o.id)
    setSelected(selected.length === ids.length ? [] : ids)
  }
  async function batchDelete() {
    if (!selected.length) { showError('请先勾选要删除的数据'); return }
    if (!(await confirm(`确认删除选中的 ${selected.length} 条数据？此操作不可恢复。`))) return
    try {
      await withBusy(async () => {
        await api.post(`${cfg.endpoint}/batch-delete`, { ids: selected })
        toast('已删除'); setSelected([]); load()
      }, '正在删除…')
    } catch (e) { showError(e.message) }
  }
  async function doDeleteByDate() {
    if (!delByDate) { showError('请选择数据日期'); return }
    if (!(await confirm(`确认删除数据日期为 ${delByDate} 的全部日活数据？此操作不可恢复。`))) return
    try {
      await withBusy(async () => {
        const r = await api.post('/api/daily-data/delete-by-date', { date: delByDate })
        toast(r.msg); setDelByDateModal(false); load()
      }, '正在删除…')
    } catch (e) { showError(e.message) }
  }
  async function backfillCategory() {
    if (!(await confirm('按平台重新补充缺失的一级/二级品类信息？（需先在品类管理中维护好平台与品类映射）'))) return
    try {
      await withBusy(async () => {
        const r = await api.post('/api/daily-data/backfill-category')
        toast(r.msg); load()
      }, '正在补充品类…')
    } catch (e) { showError(e.message) }
  }
  function openAddUrl() {
    setUrlModal({ mode: 'add', name: '', level: '高', owner_id: '', channel_id: '', platform_id: '', urls: [''] })
  }
  function openEditUrl(r) {
    setUrlModal({ mode: 'edit', id: r.id, name: r.name || '', level: r.level || '中',
      owner_id: r.owner_id || '', channel_id: r.channel_id || '', platform_id: r.platform_id || '',
      urls: (r.url || '').split('\n') })
  }
  function setUrlField(k, v) { setUrlModal({ ...urlModal, [k]: v }) }
  function setUrlRow(i, v) { const urls = [...urlModal.urls]; urls[i] = v; setUrlModal({ ...urlModal, urls }) }
  function addUrlRow() { setUrlModal({ ...urlModal, urls: [...urlModal.urls, ''] }) }
  function delUrlRow(i) { setUrlModal({ ...urlModal, urls: urlModal.urls.filter((_, j) => j !== i) }) }
  async function saveUrlModal() {
    const m = urlModal
    const url = m.urls.map(s => (s || '').trim()).filter(Boolean).join('\n')
    const payload = {
      name: m.name,
      owner_id: m.owner_id ? Number(m.owner_id) : null,
      platform_id: m.platform_id ? Number(m.platform_id) : null,
      channel_id: m.channel_id ? Number(m.channel_id) : null,
      urls: [{ url, level: m.level }],
    }
    await withBusy(async () => {
      if (m.mode === 'edit') await api.put(`/api/urls/${m.id}`, payload)
      else await api.post(cfg.endpoint, payload)
      toast(m.mode === 'edit' ? '已保存' : '已新增'); setUrlModal(null); load()
    }, '正在保存…')
  }
  function openRecharge(r) {
    const d = new Date()
    setRechargeAlert({
      alert_id: r.id, customer_id: r.customer_id, customer_name: r.customer_name,
      amount_u: '', amount_rmb: '', recharge_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      note: '',
    })
  }
  async function saveRecharge() {
    const a = rechargeAlert
    const hasU = a.amount_u !== '' && a.amount_u != null && Number(a.amount_u) !== 0
    const hasRmb = a.amount_rmb !== '' && a.amount_rmb != null && Number(a.amount_rmb) !== 0
    if ((!hasU && !hasRmb) || !a.recharge_date) { showError('请填写充值金额和日期'); return }
    try {
      await withBusy(async () => {
        await api.post(`/api/customers/${a.customer_id}/recharges`, {
          amount_u: hasU ? Number(a.amount_u) : null,
          amount_rmb: hasRmb ? Number(a.amount_rmb) : null,
          recharge_date: a.recharge_date, note: a.note || '',
        })
        toast('充值成功'); setRechargeAlert(null); load()
        window.dispatchEvent(new Event('alert-count-refresh'))
      }, '正在充值…')
    } catch (e) { showError(e.message) }
  }
  function openStop(r) {
    setStopAlert({ alert_id: r.id, order_id: r.order_id, order_no: r.order_no, task_name: r.task_name })
  }
  async function doStop() {
    if (!stopAlert || !stopAlert.order_id) { showError('订单不存在'); return }
    if (!(await confirm(`确认停单「${stopAlert.task_name || stopAlert.order_no}」？`))) return
    try {
      await withBusy(async () => {
        await api.post(`/api/orders/${stopAlert.order_id}/stop`, { reason: '业务调整', note: '', order_date: null })
        toast('已停单'); setStopAlert(null); load()
        window.dispatchEvent(new Event('alert-count-refresh'))
      }, '正在停单…')
    } catch (e) { showError(e.message) }
  }
  async function resetPwd(id) {
    if (await confirm('确认重置该账户密码？')) {
      await withBusy(async () => {
        await api.post(`/api/users/${id}/reset-password`); toast('密码已重置')
      }, '正在重置密码…')
    }
  }
  async function delUser(r) {
    if (!(await confirm(`确认删除账户「${r.username}」？此操作不可恢复。`, true))) return
    try {
      await withBusy(async () => {
        await api.del(`/api/users/${r.id}`)
        toast('已删除'); load()
      }, '正在删除…')
    } catch (e) { showError(e.message) }
  }
  async function savePwd() {
    if (!pwdModal.password || pwdModal.password.length < 6) { showError('密码长度至少 6 位'); return }
    if (pwdModal.password !== pwdModal.confirm) { showError('两次输入的新密码不一致'); return }
    try {
      await withBusy(async () => {
        await api.post(`/api/users/${pwdModal.id}/set-password`, { password: pwdModal.password })
        toast('密码已修改'); setPwdModal(null)
      }, '正在保存…')
    } catch (e) { showError(e.message) }
  }

  async function openUserEdit(r) {
    try {
      const rolesRes = await api.get('/api/roles')
      setRoles(rolesRes.data || [])
      setUserEdit({ id: r.id, username: r.username, nickname: r.nickname || '', role_id: r.role_id, status: r.status })
    } catch (e) { showError(e.message) }
  }

  async function saveUserEdit() {
    if (!userEdit.nickname) { showError('昵称不能为空'); return }
    try {
      await withBusy(async () => {
        await api.put(`/api/users/${userEdit.id}`, {
          nickname: userEdit.nickname,
          role_id: userEdit.role_id,
          status: userEdit.status,
        })
        toast('已保存'); setUserEdit(null); load()
      }, '正在保存…')
    } catch (e) { showError(e.message) }
  }

  async function openUserCreate() {
    try {
      const rolesRes = await api.get('/api/roles')
      setRoles(rolesRes.data || [])
      const firstRole = (rolesRes.data || [])[0]
      setUserCreate({ username: '', nickname: '', role_id: firstRole ? firstRole.id : '', password: '' })
    } catch (e) { showError(e.message) }
  }

  async function saveUserCreate() {
    const username = (userCreate.username || '').trim()
    const nickname = (userCreate.nickname || '').trim()
    const password = userCreate.password || ''
    if (!username) { showError('用户名不能为空'); return }
    if (!nickname) { showError('昵称不能为空'); return }
    if (!userCreate.role_id) { showError('请选择角色'); return }
    if (!password) { showError('请填写初始密码'); return }
    try {
      await withBusy(async () => {
        await api.post('/api/users', { username, nickname, role_id: userCreate.role_id, password })
        toast('已创建'); setUserCreate(null); load()
      }, '正在创建…')
    } catch (e) { showError(e.message) }
  }

  async function saveRoleCreate() {
    const name = (roleCreate.name || '').trim()
    const code = (roleCreate.code || '').trim()
    if (!name) { showError('请填写角色名称'); return }
    if (!code) { showError('请填写角色编码'); return }
    try {
      await withBusy(async () => {
        await api.post('/api/roles', { name, code, note: (roleCreate.note || '').trim() })
        toast('角色已创建'); setRoleCreate(null)
        const r = await api.get('/api/roles')
        setRoles(r.data || [])
      }, '正在创建…')
    } catch (e) { showError(e.message) }
  }

  function cell(c, r) {
    const v = r[c.k]
    if (kind === 'bills' && c.k === 'customer') {
      return <a className="link" onClick={() => nav(`/customers?detail=${r.customer_id}`)}>{v}</a>
    }
    if (kind === 'daily' && c.k === 'task_id' && v) {
      return <a className="link" onClick={() => openOrderByTaskId(v)}>{v}</a>
    }
    if (kind === 'alerts' && c.k === 'order_no' && v) {
      return <a className="link" onClick={() => openOrderByNo(v)}>{v}</a>
    }
    if (kind === 'daily' && c.k === 'source_file' && r.source_file_id) {
      return <a className="link" onClick={() => downloadFile(`/api/source-files/${r.source_file_id}/download`).catch(e => showError(e.message))}>{v || '—'}</a>
    }
    if (c.k === 'size') {
      if (v == null) return '—'
      if (v < 1024) return `${v} B`
      if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
      return `${(v / 1024 / 1024).toFixed(1)} MB`
    }
    if (['status'].includes(c.k)) return <Badge value={v === 1 ? '启用' : v === 0 ? '停用' : v} />
    if (['level', 'gender', 'deposit_status', 'wash_status', 'type'].includes(c.k)) return <Badge value={v} />
    if (c.num && typeof v === 'number') return v.toLocaleString()
    if (c.multiline) return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', textAlign: 'left' }}>{v || '—'}</div>
    return v ?? '—'
  }

  function exportExcel() {
    const qs = buildQuery(filters)
    if (kind === 'fund') { downloadFile('/api/fund/export?' + qs).catch(e => showError(e.message)); toast('正在导出...'); return }
    if (kind === 'daily') {
      const colKeys = cols.map(c => c.k).join(',')
      const sep = qs ? '&' : ''
      downloadFile(`/api/daily-data/export?${qs}${sep}cols=${encodeURIComponent(colKeys)}`).catch(e => showError(e.message)); toast('正在导出...'); return
    }
    downloadCsv(`${cfg.title}.csv`, cfg.cols, rows)
    toast('已导出')
  }

  function exportDailyCsv() {
    const qs = buildQuery(filters)
    const colKeys = cols.map(c => c.k).join(',')
    const sep = qs ? '&' : ''
    downloadFile(`/api/daily-data/export-csv?${qs}${sep}cols=${encodeURIComponent(colKeys)}`).catch(e => showError(e.message))
    toast('正在导出 CSV...')
  }

  function doExport() {
    setExportModal(false)
    if (exportType === 'csv') exportDailyCsv()
    else exportExcel()
  }

  async function doExtract() {
    if (!extractForm.price && Number(extractForm.price) !== 0) { showError('请填写单价'); return }
    if (!extractForm.limit || Number(extractForm.limit) <= 0) { showError('请填写抽取条数'); return }
    if (extractForm.target_type === '代理' && !extractForm.customer_id) { showError('请选择代理'); return }
    if (extractForm.target_type === '其他人' && !(extractForm.target_name || '').trim()) { showError('请填写收款对象名称'); return }
    const body = {
      filters,
      start_date: extractForm.start_date,
      end_date: extractForm.end_date,
      limit: Number(extractForm.limit) || 0,
      customer_id: extractForm.target_type === '代理' ? (Number(extractForm.customer_id) || null) : null,
      target_name: extractForm.target_type === '其他人' ? extractForm.target_name : '',
      price: Number(extractForm.price) || 0,
      note: extractForm.note || '',
    }
    try {
      await withBusy(async () => {
        const res = await fetch('/api/daily-data/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.msg || d.detail || '抽取失败')
        }
        const blob = await res.blob()
        const cd = res.headers.get('Content-Disposition') || ''
        const m = cd.match(/filename\*=UTF-8''(.+)/)
        const filename = m ? decodeURIComponent(m[1]) : '单独抽取.zip'
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        a.click()
        URL.revokeObjectURL(a.href)
        toast('抽取完成，已下载数据与账单'); setExtractModal(false)
      }, '正在抽取数据…')
    } catch (e) { showError(e.message) }
  }

  async function importFile(file) {
    setBusy(true); setBusyMsg('正在上传文件…'); setBusyProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await uploadFile(cfg.impEndpoint || '/api/fund/import', fd, p => setBusyProgress(p))
      setBusyMsg('正在处理数据，请稍候…'); setBusyProgress(100)
      toast(data.msg); load()
    } finally {
      setBusy(false); setBusyProgress(null)
    }
  }

  async function importDaily() {
    const fs = dailyFileRef.current?.files
    if (!fs || !fs.length) { showError('请选择文件'); return }
    if (!dailyDate) { showError('请选择数据日期'); return }
    const p = { files: Array.from(fs), date: dailyDate }
    setDailyModal(false)
    setPendingImportFiles(p)
    doUploadDaily(p, false)
  }

  async function doUploadDaily(p, confirmFlag) {
    if (!p || !p.files) return
    const fd = new FormData()
    for (const f of p.files) fd.append('files', f)
    fd.append('biz_date', p.date)
    if (confirmFlag) fd.append('confirm', 'true')
    try {
      setBusy(true); setBusyMsg('正在上传文件…'); setBusyProgress(0)
      const data = await uploadFile('/api/daily-data/import', fd, x => setBusyProgress(x))
      if (data.data && data.data.needs_confirm) {
        setBusy(false); setBusyProgress(null)
        const items = [
          ...(data.data.unmatched_items || []),
          ...(data.data.stopped_items || []),
        ]
        setImportWarn({ title: '以下工单数据异常，是否继续导入？', items, confirm: true })
        return
      }
      setBusyMsg('正在处理数据，请稍候…'); setBusyProgress(100)
      toast(data.msg); load()
      const inactiveItems = (data.data && data.data.inactive_items) || []
      setBusy(false); setBusyProgress(null)
      if (inactiveItems.length) {
        setImportWarn({ title: '以下在执任务未匹配到数据（未出）', items: inactiveItems.map(x => ({ ...x, kind: '未出' })), confirm: false })
      }
    } catch (e) { setBusy(false); setBusyProgress(null); showError(e.message) }
  }

  async function doImportConfirm() {
    setImportWarn(null)
    doUploadDaily(pendingImportFiles, true)
  }

  async function exportWarnItems() {
    try {
      const res = await fetch('/api/daily-data/export-warn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({ items: importWarn.items }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.msg || d.detail || '导出失败')
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = '工单异常.xlsx'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { showError(e.message) }
  }

  async function importDailyCsv() {
    if (!csvFile) { showError('请选择 csv 文件'); return }
    setCsvModal(false)
    try {
      setBusy(true); setBusyMsg('正在导入 CSV…'); setBusyProgress(0)
      const fd = new FormData()
      fd.append('files', csvFile)
      const data = await uploadFile('/api/daily-data/import-csv', fd, p => setBusyProgress(p))
      setBusyMsg('正在入库，请稍候…'); setBusyProgress(100)
      toast(data.msg); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function doDistribute() {
    if (!distDate) { showError('请选择数据日期'); return }
    setDistModal(false)
    setBusy(true); setBusyMsg('正在准备分数据…')
    try {
      const body = { date: distDate }
      if (distCustomerIds.length) body.customer_ids = distCustomerIds
      let r = await api.post('/api/daily-data/distribute', body)
      if (r.data.needs_confirm) {
        setBusy(false)
        const issues = r.data.issues || []
        const detail = issues.map(i => `「${i.group_name}」${i.unset_count} 个订单未设定出数模版（将按 ${i.tpl_code} 出数）`).join('、')
        if (!(await confirm(`以下小组存在未设定出数模版的订单：${detail}。\n\n是否继续分数据（未设定的订单将按小组已设定的出数模版处理）？`))) return
        setBusy(true); setBusyMsg('正在分数据…')
        r = await api.post('/api/daily-data/distribute', { ...body, confirm: true })
      }
      setBusyMsg('正在分数据…'); setBusyProgress(0)
      const taskId = r.data.task_id
      const total = r.data.total
      while (true) {
        const p = await api.get(`/api/daily-data/distribute/progress/${taskId}`)
        const { done, status, error } = p.data
        setBusyProgress(total > 0 ? Math.round((done / total) * 100) : 100)
        if (status === 'done') {
          setBusyMsg('分数据完成，正在下载…')
          await downloadFile(`/api/daily-data/distribute/download/${taskId}`)
          toast('分数据完成，请查看下载')
          break
        } else if (status === 'error') {
          throw new Error(error || '分数据失败')
        }
        await new Promise(res => setTimeout(res, 500))
      }
    } catch (e) { showError(e.message || '分数据失败') } finally { setBusy(false); setBusyProgress(null) }
  }

  async function doWashExport() {
    if (!washDate) { showError('请选择数据日期'); return }
    setWashModal(false)
    try {
      await withBusy(async () => {
        const r = await api.get(`/api/daily-data/wash-stats?date=${encodeURIComponent(washDate)}`)
        const s = r.data || {}
        await downloadFile(`/api/daily-data/wash-export?date=${encodeURIComponent(washDate)}`)
        showError(`洗名导出完成\n\n一共要导出：${s.total ?? 0} 条\n已匹配洗名库：${s.matched ?? 0} 条\n需要去小逸洗名：${s.need_wash ?? 0} 条`)
      }, '正在导出洗名…')
    } catch (e) { showError(e.message) }
  }

  async function doBillExport() {
    if (!billExpStart || !billExpEnd) { showError('请选择开始和结束日期'); return }
    setBillExpModal(false)
    try {
      await withBusy(async () => {
        const p = new URLSearchParams()
        p.set('start_date', billExpStart)
        p.set('end_date', billExpEnd)
        if (billExpCustId) p.set('customer_id', billExpCustId)
        await downloadFile(`/api/bills/export?${p.toString()}`)
        toast('账单已导出')
      }, '正在导出账单…')
    } catch (e) { showError(e.message) }
  }

  async function doBillSummaryExport() {
    let params
    if (billSummaryType === 'day') {
      if (!billSummaryDate) { showError('请选择日期'); return }
      params = `date=${billSummaryDate}`
    } else {
      if (!billSummaryStart || !billSummaryEnd) { showError('请选择日期区间'); return }
      params = `start_date=${billSummaryStart}&end_date=${billSummaryEnd}`
    }
    setBillSummaryModal(false)
    try {
      await withBusy(async () => {
        await downloadFile(`/api/bills/summary-export?${params}`)
        toast('账单汇总已导出')
      }, '正在导出账单汇总…')
    } catch (e) { showError(e.message) }
  }

  async function doGenerateBill() {
    if (genBillType === 'day') {
      if (!genBillDate) { showError('请选择日期'); return }
    } else {
      if (!genBillStart || !genBillEnd) { showError('请选择开始和结束日期'); return }
      if (genBillEnd < genBillStart) { showError('结束日期不能早于开始日期'); return }
    }
    setGenBillModal(false)
    try {
      await withBusy(async () => {
        const p = new URLSearchParams()
        if (genBillType === 'day') {
          p.set('start_date', genBillDate)
        } else {
          p.set('start_date', genBillStart)
          p.set('end_date', genBillEnd)
        }
        if (genBillCustomerIds.length) p.set('customer_ids', genBillCustomerIds.join(','))
        await downloadFile(`/api/bills/generate-bill?${p.toString()}`)
        toast('账单已生成')
      }, '正在生成账单')
    } catch (e) { showError(e.message) }
  }

  async function doCheck() {
    if (!checkDate) { showError('请选择数据日期'); return }
    try {
      await withBusy(async () => {
        const r = await api.get(`/api/daily-data/check?date=${encodeURIComponent(checkDate)}&upstream=${encodeURIComponent(checkUpstream)}`)
        setCheckResult(r.data || [])
      }, '正在检查…')
    } catch (e) { showError(e.message) }
  }

  function checkMMDD(offset) {
    if (!checkDate) return ''
    const d = new Date(checkDate + 'T00:00:00')
    d.setDate(d.getDate() - offset)
    return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }

  async function doCheckExport() {
    if (!checkDate) { showError('请选择数据日期'); return }
    try {
      await withBusy(async () => {
        await downloadFile(`/api/daily-data/check-export?date=${encodeURIComponent(checkDate)}&upstream=${encodeURIComponent(checkUpstream)}`)
        toast('检查结果已导出')
      }, '正在导出…')
    } catch (e) { showError(e.message) }
  }

  async function importWash() {
    const f = washFileRef.current?.files?.[0]
    if (!f) { showError('请选择洗名文件'); return }
    setBusy(true); setBusyMsg('正在导入洗名…'); setBusyProgress(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const data = await uploadFile('/api/daily-data/import-wash', fd)
      toast(data.msg); load()
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  function downloadSourceFile(r) {
    downloadFile(`/api/source-files/${r.id}/download`).catch(e => showError(e.message))
  }

  async function uploadSourceFile() {
    const f = sfFileRef.current?.files?.[0]
    if (!f) { showError('请选择文件'); return }
    try {
      await withBusy(async () => {
        const fd = new FormData()
        fd.append('file', f)
        fd.append('category', sfCategory)
        await uploadFile('/api/source-files/upload', fd)
        toast('上传成功'); setSfModal(false); load()
      }, '正在上传文件…')
    } catch (e) { showError(e.message) }
  }

  async function viewBillDetail(id) {
    try {
      await withBusy(async () => {
        const r = await api.get(`/api/bills/${id}`)
        setBillDetail(r.data)
      }, '正在加载…')
    } catch (e) { showError(e.message) }
  }

  function openBalanceEdit() {
    setBalanceEdit({ balance: billDetail.balance ?? 0 })
  }

  async function saveBalance() {
    try {
      await withBusy(async () => {
        await api.put(`/api/bills/${billDetail.id}/balance`, { balance: Number(balanceEdit.balance) })
        toast('余额已更新'); setBalanceEdit(null)
        const r = await api.get(`/api/bills/${billDetail.id}`)
        setBillDetail(r.data); load()
      }, '正在保存…')
    } catch (e) { showError(e.message) }
  }

  async function openOrderByTaskId(taskId) {
    if (!taskId) return
    try {
      const r = await api.get('/api/orders?task_id=' + encodeURIComponent(taskId) + '&per_page=1')
      if (r.data.rows.length) setOrderDetail(r.data.rows[0])
      else showError('未找到订单 ' + taskId)
    } catch (e) { showError(e.message) }
  }

  async function openOrderByNo(no) {
    if (!no) return
    try {
      const r = await api.get('/api/orders?order_no=' + encodeURIComponent(no) + '&per_page=1')
      if (r.data.rows.length) setOrderDetail(r.data.rows[0])
      else showError('未找到订单 ' + no)
    } catch (e) { showError(e.message) }
  }

  async function clearData() {
    if (!(await confirm(`确认清空「${cfg.title}」的全部数据？此操作不可恢复。`))) return
    try {
      await withBusy(async () => {
        await api.del(cfg.endpoint)
        toast('已清空'); load()
      }, '正在清空…')
    } catch (e) { showError(e.message) }
  }

  return (
    <div className="page">
      {confirmEl}
      {picker}
      {busy && <Loading text={busyMsg} progress={busyProgress} />}
      <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} ref={fileRef} onChange={e => { if (e.target.files[0]) importFile(e.target.files[0]).catch(err => showError(err.message)); e.target.value = '' }} />
      <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} ref={washFileRef} onChange={e => { if (e.target.files[0]) importWash().catch(err => showError(err.message)); e.target.value = '' }} />
      <div className={`toolbar ${cfg.filterCols ? 'toolbar-inline' : ''}`}>
        <div className={`filter-wrap ${filterCollapsed ? 'collapsed' : ''}`}>
          {kind === 'daily' && (
            <>
              <input type="date" placeholder="数据日期 开始" value={filters.start_date || ''} onChange={e => setFilters({ ...filters, start_date: e.target.value })} />
              <span className="range-sep">—</span>
              <input type="date" placeholder="数据日期 结束" value={filters.end_date || ''} onChange={e => setFilters({ ...filters, end_date: e.target.value })} />
            </>
          )}
          <FilterBar cols={cfg.filterCols || (kind === 'daily' ? cfg.cols.filter(c => c.k !== 'biz_date') : cfg.cols)} filters={filters} setFilters={handleSetFilters} onSearch={search} fieldOptions={cascadeFieldOptions()} actions={false} />
        </div>
        <div className="toolbar-actions">
        <button className="btn primary" onClick={() => search()}>查询</button>
        <button className="btn" onClick={() => { const f = defaultFilters(); setFilters(f); search(f) }}>重置</button>
        {kind === 'washnames' && (
          <label style={{ fontSize: 12, color: 'var(--sub)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.name_empty === '1'} onChange={e => setFilters({ ...filters, name_empty: e.target.checked ? '1' : '' })} />
            仅看空姓名
          </label>
        )}
        {kind === 'daily' && (
          <label style={{ fontSize: 12, color: 'var(--sub)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.platform_empty === '1'} onChange={e => setFilters({ ...filters, platform_empty: e.target.checked ? '1' : '' })} />
            平台为空
          </label>
        )}
        <button className="btn icon" title={filterCollapsed ? '展开查询条件' : '隐藏查询条件'} onClick={() => setFilterCollapsed(!filterCollapsed)}>{filterCollapsed ? IconChevronDown : IconChevronUp}</button>
        {cfg.exp && can('fund:export') && <button className="btn green" onClick={exportExcel}>导出 Excel</button>}
        {cfg.dailyImp && can('daily:import') && <button className="btn orange" onClick={() => setDailyModal(true)}>① 导入日活</button>}
        {cfg.dist && can('daily:wash_export') && <button className="btn orange" onClick={() => setWashModal(true)}>② 导出洗名</button>}
        {cfg.dist && can('daily:wash_import') && <button className="btn orange" onClick={() => washFileRef.current.click()}>③ 导入洗名</button>}
        {cfg.dist && can('daily:distribute') && <button className="btn orange" onClick={() => { setDistCustomerIds(customers.filter(c => c.ctype === 'downstream').map(c => c.id)); setDistModal(true) }}>④ 分发数据</button>}
        {cfg.check && can('daily:check') && <button className="btn" onClick={() => { setCheckResult(null); setCheckModal(true) }}>工单检查</button>}
        {showBatchDel && kind !== 'daily' && selected.length > 0 && <button className="btn danger" onClick={batchDelete}>⚠️ 批量删除({selected.length})</button>}
        {kind === 'daily' && can('daily:backfill_category') && <button className="btn" onClick={() => backfillCategory().catch(e => showError(e.message))}>补充品类</button>}
        {kind === 'sourcefiles' && can('file:upload') && <button className="btn primary" onClick={() => { setSfCategory('手动'); setSfModal(true) }}>上传文件</button>}
        {kind === 'urls' && <button className="btn" onClick={() => downloadFile('/api/urls/import-template').catch(e => showError(e.message))}>下载模版</button>}
        {kind === 'urls' && <button className="btn green" onClick={() => { downloadFile('/api/urls/export?' + buildQuery(filters)).catch(e => showError(e.message)); toast('正在导出...'); }}>导出 Excel</button>}
        {cfg.imp && can(`${cfg.perm}:import`) && <button className="btn" onClick={() => fileRef.current.click()}>导入 Excel</button>}
        {cfg.export && can('daily:export') && <button className="btn green" onClick={() => setExportModal(true)}>导出数据</button>}
        {kind === 'daily' && can('daily:batch_delete') && <button className="btn danger" onClick={() => setBatchDelModal(true)}>⚠️ 批量删除</button>}
        {cfg.billExp && can('bill:generate') && <button className="btn orange" onClick={() => { setGenBillCustomerIds(customers.filter(c => c.ctype === 'upstream' || c.ctype === 'downstream').map(c => c.id)); setGenBillModal(true) }}>生成账单</button>}
        {cfg.simple && can(`${cfg.perm}:create`) && <button className="btn primary" onClick={() => setSimpleModal({ name: '', status: 1 })}>+ 新增</button>}
        {cfg.addUrl && can('parts:create') && <button className="btn primary" onClick={openAddUrl}>+ 新增 URL</button>}
        {cfg.clear && can(`${cfg.perm}:clear`) && <button className="btn danger" onClick={clearData}>⚠️ 清空数据</button>}
        {kind === 'users' && can('account:create') && <button className="btn primary" onClick={openUserCreate}>+ 新增账户</button>}
        {kind === 'users' && can('account:role_perms') && <button className="btn" onClick={() => nav('/role-perms')}>角色权限</button>}
        {kind === 'users' && can('account:create_role') && <button className="btn" onClick={() => setRoleCreate({ name: '', code: '', note: '' })}>新增角色</button>}
        {kind === 'alerts' && can('alert:config') && (
          <>
            <label style={{ fontSize: 12, color: 'var(--sub)' }}>触发时间</label>
            <input type="time" value={alertTrigger} onChange={e => setAlertTrigger(e.target.value)} />
            <button className="btn small" onClick={saveAlertConfig}>保存</button>
          </>
        )}
        <button className="btn icon" title="自定义表头" onClick={openPicker}>{IconColumns}</button>
        </div>
      </div>
      <div className="panel">
        <div className="table-scroll">
          <table>
            <thead><tr>{cfg.showSeq && <th className="num" style={{ width: 56 }}>序号</th>}{showBatchDel && <th style={{ width: 32 }}><input type="checkbox" checked={rows.length > 0 && selected.length === sorted.length} onChange={toggleAll} /></th>}{hasRowOps && <th className="ops">操作</th>}{cols.map(c => <th key={c.k} className={c.num ? 'num' : ''} onClick={() => toggleSort(c.k)}>{c.l}{sort?.k === c.k ? <span className="arr">{sort.dir === 'asc' ? '▲' : '▼'}</span> : ''}</th>)}</tr></thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id}>
                  {cfg.showSeq && <td className="num">{(page - 1) * perPage + i + 1}</td>}
                  {showBatchDel && <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} /></td>}
                  {hasRowOps && <td className="ops">
                    {cfg.detail && can('bill:detail') && <button className="btn small" onClick={() => viewBillDetail(r.id)}>详情</button>}
                    {cfg.simple && can(`${cfg.perm}:edit`) && <button className="btn small" onClick={() => toast('编辑')}>编辑</button>}
                    {cfg.editUrl && can('parts:edit') && <button className="btn small" onClick={() => openEditUrl(r)}>编辑</button>}
                    {cfg.dailyEdit && can('daily:edit') && <button className="btn small" onClick={() => openDailyEdit(r)}>编辑</button>}
                    {cfg.del && can(`${cfg.perm}:delete`) && <button className="btn small danger" onClick={() => del(r.id)}>删除</button>}
                    {cfg.dl && can('file:download') && <button className="btn small" onClick={() => downloadSourceFile(r)}>下载</button>}
                    {cfg.handle && r.type === '账单预警' && can('alert:handle') && <button className="btn small primary" onClick={() => openRecharge(r)}>充值</button>}
                    {cfg.handle && r.type === '停单提醒' && can('alert:handle') && <button className="btn small primary" onClick={() => openStop(r)}>停单</button>}
                    {cfg.reset && can('account:reset') && <IconBtn title="重置密码" color="#2563eb" onClick={() => resetPwd(r.id)}>{IconKey}</IconBtn>}
                    {cfg.pwd && can('account:reset') && <IconBtn title="修改密码" color="#7c3aed" onClick={() => setPwdModal({ id: r.id, username: r.username, password: '', confirm: '' })}>{IconLock}</IconBtn>}
                    {kind === 'users' && can('account:edit') && <IconBtn title="编辑" color="#2563eb" onClick={() => openUserEdit(r)}>{IconEdit}</IconBtn>}
                    {kind === 'users' && can('account:delete') && <IconBtn title="删除" color="#dc2626" onClick={() => delUser(r)}>{IconDelete}</IconBtn>}
                  </td>}
                  {cols.map(c => <td key={c.k} className={c.num ? 'num' : ''}>{cell(c, r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="empty">暂无数据</div>}
        <Pagination total={total} page={page} perPage={perPage} setPage={setPage} setPerPage={changePerPage} goPage={goPage} />
      </div>

      {simpleModal && (
        <Modal title="新增" onClose={() => setSimpleModal(null)}>
          <div className="row">
            <div className="field"><label>名称</label><ClearableInput value={simpleModal.name} onChange={e => setSimpleModal({ ...simpleModal, name: e.target.value })} /></div>
            <div className="field"><label>状态</label><select value={simpleModal.status} onChange={e => setSimpleModal({ ...simpleModal, status: Number(e.target.value) })}><option value={1}>启用</option><option value={0}>停用</option></select></div>
          </div>
          <div className="foot"><button className="btn" onClick={() => setSimpleModal(null)}>取消</button><button className="btn primary" onClick={addSimple}>保存</button></div>
        </Modal>
      )}

      {sfModal && (
        <Modal title="上传文件" onClose={() => setSfModal(false)}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>文件类型</label>
            <select value={sfCategory} onChange={e => setSfCategory(e.target.value)}>
              <option value="手动">手动</option>
              <option value="进货">进货</option>
              <option value="出货">出货</option>
              <option value="提单">提单</option>
            </select>
          </div>
          <input type="file" ref={sfFileRef} />
          <div className="foot">
            <button className="btn" onClick={() => setSfModal(false)}>取消</button>
            <button className="btn primary" onClick={() => uploadSourceFile().catch(e => showError(e.message))}>上传</button>
          </div>
        </Modal>
      )}

      {dailyEdit && (
        <Modal title="编辑日活数据" onClose={() => setDailyEdit(null)} wide>
          <div className="row">
            <div className="field"><label>数据日期</label><input type="date" value={dailyEdit.biz_date} onChange={e => setDailyEdit({ ...dailyEdit, biz_date: e.target.value })} /></div>
            <div className="field"><label>手机号</label><ClearableInput value={dailyEdit.phone} onChange={e => setDailyEdit({ ...dailyEdit, phone: e.target.value })} /></div>
            <div className="field"><label>姓名</label><ClearableInput value={dailyEdit.name} onChange={e => setDailyEdit({ ...dailyEdit, name: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>甲方</label><ClearableInput value={dailyEdit.upstream} onChange={e => setDailyEdit({ ...dailyEdit, upstream: e.target.value })} /></div>
            <div className="field"><label>任务id</label><ClearableInput value={dailyEdit.task_id} onChange={e => setDailyEdit({ ...dailyEdit, task_id: e.target.value })} /></div>
            <div className="field"><label>任务名</label><ClearableInput value={dailyEdit.task_name} onChange={e => setDailyEdit({ ...dailyEdit, task_name: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>省</label><ClearableInput value={dailyEdit.province} onChange={e => setDailyEdit({ ...dailyEdit, province: e.target.value })} /></div>
            <div className="field"><label>市</label><ClearableInput value={dailyEdit.city} onChange={e => setDailyEdit({ ...dailyEdit, city: e.target.value })} /></div>
            <div className="field"><label>运营商</label><ClearableInput value={dailyEdit.operator} onChange={e => setDailyEdit({ ...dailyEdit, operator: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>一级品类</label><ClearableInput value={dailyEdit.cat1} onChange={e => setDailyEdit({ ...dailyEdit, cat1: e.target.value })} /></div>
            <div className="field"><label>二级品类</label><ClearableInput value={dailyEdit.cat2} onChange={e => setDailyEdit({ ...dailyEdit, cat2: e.target.value })} /></div>
            <div className="field"><label>平台</label><ClearableInput value={dailyEdit.platform} onChange={e => setDailyEdit({ ...dailyEdit, platform: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>一级代理</label><ClearableInput value={dailyEdit.customer} onChange={e => setDailyEdit({ ...dailyEdit, customer: e.target.value })} /></div>
            <div className="field"><label>二级代理</label><ClearableInput value={dailyEdit.secondary_agent} onChange={e => setDailyEdit({ ...dailyEdit, secondary_agent: e.target.value })} /></div>
            <div className="field"><label>渠道</label><ClearableInput value={dailyEdit.channel} onChange={e => setDailyEdit({ ...dailyEdit, channel: e.target.value })} /></div>
          </div>
          <div className="foot"><button className="btn" onClick={() => setDailyEdit(null)}>取消</button><button className="btn primary" onClick={saveDailyEdit}>保存</button></div>
        </Modal>
      )}

      {dailyModal && (
        <Modal title="导入日活数据" onClose={() => setDailyModal(false)}>
          <div className="note">支持上传 zip（牛的数据包）或 excel（新的数据文件）。文件会先保存到「元文件管理」，再解析导入。</div>
          <div className="field" style={{ marginBottom: 12 }}><label className="required">数据日期</label>
            <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 14 }}><label className="required">文件（zip / xlsx / xls，可多选）</label>
            <input type="file" accept=".zip,.xlsx,.xls" multiple ref={dailyFileRef} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setDailyModal(false)}>取消</button>
            <button className="btn primary" onClick={() => importDaily().catch(e => showError(e.message))}>开始导入</button>
          </div>
        </Modal>
      )}

      {csvModal && (
        <Modal title="导入 CSV（原样入库）" onClose={() => setCsvModal(false)}>
          <div className="note">按「日活数据」表结构逐行原样写入（不做订单关联/洗名补全/去重之外的加工）。表头需含：数据日期、甲方、任务id、任务名、手机号、姓名、省、市、运营商等。按（数据日期+任务id+手机号）自动去重。</div>
          <div className="field" style={{ marginBottom: 14 }}><label className="required">CSV 文件</label>
            <input type="file" accept=".csv" ref={csvFileRef} onChange={e => setCsvFile(e.target.files[0] || null)} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setCsvModal(false)}>取消</button>
            <button className="btn primary" onClick={() => importDailyCsv().catch(e => showError(e.message))}>开始导入</button>
          </div>
        </Modal>
      )}

      {distModal && (() => {
        const downstreamCustomers = customers.filter(c => c.ctype === 'downstream')
        const allChecked = downstreamCustomers.length > 0 && downstreamCustomers.every(c => distCustomerIds.includes(c.id))
        function toggleAll() {
          setDistCustomerIds(allChecked ? [] : downstreamCustomers.map(c => c.id))
        }
        return (
        <Modal title="分数据" onClose={() => setDistModal(false)}>
          <div className="note">选择数据日期，将该日期下的日活数据按订单的小组分组，用对应订单的出数模版生成文件打包下载。</div>
          <div className="field" style={{ marginBottom: 14 }}><label className="required">数据日期</label>
            <input type="date" value={distDate} onChange={e => setDistDate(e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>一级代理（点击名称选中 / 取消）</label>
            <div className="agent-list">
              <button type="button" className="agent-chip agent-chip-all" onClick={toggleAll}>{allChecked ? '全不选' : '全选'}</button>
              {downstreamCustomers.map(c => {
                const on = distCustomerIds.includes(c.id)
                return (
                  <button type="button" key={c.id} className={`agent-chip ${on ? 'on' : ''}`} onClick={() => {
                    setDistCustomerIds(ids => ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])
                  }}>
                    {c.code} {c.name}
                  </button>
                )
              })}
              {downstreamCustomers.length === 0 && <div className="empty">暂无下游客户</div>}
            </div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setDistModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doDistribute().catch(e => showError(e.message))}>分数据</button>
          </div>
        </Modal>
        )
      })()}

      {extractModal && (
        <Modal title="单独抽取" onClose={() => setExtractModal(false)}>
          <div className="note">按当前查询条件抽取日活数据，生成「抽取数据」与「账单」文件；给代理时扣减余额，给其他人只出账单。</div>
          <div className="row">
            <div className="field"><label>时间段 开始</label><input type="date" value={extractForm.start_date} onChange={e => setExtractForm({ ...extractForm, start_date: e.target.value })} /></div>
            <div className="field"><label>时间段 结束</label><input type="date" value={extractForm.end_date} onChange={e => setExtractForm({ ...extractForm, end_date: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label className="required">抽取条数</label><input type="number" value={extractForm.limit} onChange={e => setExtractForm({ ...extractForm, limit: e.target.value })} /></div>
            <div className="field"><label className="required">单价(元/条)</label><input type="number" step="0.01" value={extractForm.price} onChange={e => setExtractForm({ ...extractForm, price: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>收款对象</label>
              <select value={extractForm.target_type} onChange={e => setExtractForm({ ...extractForm, target_type: e.target.value })}>
                <option value="代理">代理</option><option value="其他人">其他人</option>
              </select></div>
            {extractForm.target_type === '代理' ? (
              <div className="field"><label className="required">选择代理</label>
                <select value={extractForm.customer_id} onChange={e => setExtractForm({ ...extractForm, customer_id: e.target.value })}>
                  <option value="">请选择</option>{customers.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select></div>
            ) : (
              <div className="field"><label className="required">收款对象名称</label><ClearableInput value={extractForm.target_name} onChange={e => setExtractForm({ ...extractForm, target_name: e.target.value })} placeholder="如 张某某" /></div>
            )}
          </div>
          <div className="field" style={{ marginBottom: 12 }}><label>备注</label><ClearableInput value={extractForm.note} onChange={e => setExtractForm({ ...extractForm, note: e.target.value })} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setExtractModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doExtract().catch(e => showError(e.message))}>抽取并记账</button>
          </div>
        </Modal>
      )}

      {exportModal && (
        <Modal title="导出数据" onClose={() => setExportModal(false)}>
          <div className="note">选择导出格式。</div>
          <div className="export-opts">
            <label className={`export-opt ${exportType === 'excel' ? 'on' : ''}`}>
              <input type="radio" name="exportType" checked={exportType === 'excel'} onChange={() => setExportType('excel')} />
              <span className="eo-title">Excel</span>
              <span className="eo-sub">导出为 .xlsx 文件（默认）</span>
            </label>
            <label className={`export-opt ${exportType === 'csv' ? 'on' : ''}`}>
              <input type="radio" name="exportType" checked={exportType === 'csv'} onChange={() => setExportType('csv')} />
              <span className="eo-title">CSV</span>
              <span className="eo-sub">导出为 .csv 文件</span>
            </label>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setExportModal(false)}>取消</button>
            <button className="btn primary" onClick={doExport}>导出</button>
          </div>
        </Modal>
      )}

      {batchDelModal && (
        <Modal title="批量删除日活数据" onClose={() => setBatchDelModal(false)}>
          <div className="note">选择删除方式（仅管理员可用，不可恢复）。</div>
          <div className="batch-del-list">
            <button className="batch-del-item" disabled={selected.length === 0} onClick={() => { setBatchDelModal(false); batchDelete() }}>
              <span className="bd-title">按选择对象删除</span>
              <span className="bd-sub">{selected.length > 0 ? `删除当前勾选的 ${selected.length} 条数据` : '请先在列表中勾选数据'}</span>
            </button>
            <button className="batch-del-item" onClick={() => { setBatchDelModal(false); setDelByDateModal(true) }}>
              <span className="bd-title">按指定日期删除</span>
              <span className="bd-sub">删除所选数据日期下的全部日活数据</span>
            </button>
          </div>
          <div className="foot"><button className="btn" onClick={() => setBatchDelModal(false)}>取消</button></div>
        </Modal>
      )}

      {delByDateModal && (
        <Modal title="按日期删除日活数据" onClose={() => setDelByDateModal(false)}>
          <div className="note">删除所选数据日期下的全部日活数据（仅管理员可用，不可恢复）。</div>
          <div className="field" style={{ marginBottom: 14 }}><label className="required">数据日期</label>
            <input type="date" value={delByDate} onChange={e => setDelByDate(e.target.value)} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setDelByDateModal(false)}>取消</button>
            <button className="btn danger" onClick={() => doDeleteByDate().catch(e => showError(e.message))}>删除</button>
          </div>
        </Modal>
      )}

      {rechargeAlert && (
        <Modal title={`账户充值 · ${rechargeAlert.customer_name}`} onClose={() => setRechargeAlert(null)}>
          <div className="row">
            <div className="field"><label>充值金额 (U)</label>
              <input type="number" value={rechargeAlert.amount_u} onChange={e => { const u = e.target.value; setRechargeAlert({ ...rechargeAlert, amount_u: u, amount_rmb: u ? (u * rechargeRate).toFixed(2) : '' }) }} />
            </div>
            <div className="field"><label>折算人民币 (元)</label>
              <input type="number" value={rechargeAlert.amount_rmb} onChange={e => { const r = e.target.value; setRechargeAlert({ ...rechargeAlert, amount_rmb: r, amount_u: r ? (r / rechargeRate).toFixed(2) : '' }) }} />
            </div>
          </div>
          <div className="row">
            <div className="field"><label>充值日期</label><input type="date" value={rechargeAlert.recharge_date} onChange={e => setRechargeAlert({ ...rechargeAlert, recharge_date: e.target.value })} /></div>
            <div className="field"><label>备注</label><ClearableInput value={rechargeAlert.note} onChange={e => setRechargeAlert({ ...rechargeAlert, note: e.target.value })} /></div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setRechargeAlert(null)}>取消</button>
            <button className="btn primary" onClick={() => saveRecharge().catch(e => showError(e.message))}>确认充值</button>
          </div>
        </Modal>
      )}

      {stopAlert && (
        <Modal title="停单确认" onClose={() => setStopAlert(null)}>
          <div className="note">确认停单「{stopAlert.task_name || stopAlert.order_no}」？停单后该订单将停止采集。</div>
          <div className="foot">
            <button className="btn" onClick={() => setStopAlert(null)}>取消</button>
            <button className="btn danger" onClick={() => doStop().catch(e => showError(e.message))}>确认停单</button>
          </div>
        </Modal>
      )}

      {importWarn && (
        <Modal title={importWarn.title} onClose={() => setImportWarn(null)} wide>
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th style={{ width: 56 }}>序号</th><th>工单号</th><th>任务名</th><th className="num">数量</th><th>原因</th></tr></thead>
              <tbody>
                {importWarn.items.map((x, i) => (
                  <tr key={i}><td className="num">{i + 1}</td><td>{x.task_id || '—'}</td><td>{x.task_name || '—'}</td><td className="num">{x.qty ?? '—'}</td><td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{x.reason || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="foot">
            <button className="btn" onClick={exportWarnItems}>导出异常</button>
            {importWarn.confirm ? (
              <>
                <button className="btn" onClick={() => setImportWarn(null)}>取消</button>
                <button className="btn primary" onClick={doImportConfirm}>继续导入</button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setImportWarn(null)}>关闭</button>
            )}
          </div>
        </Modal>
      )}

      {washModal && (
        <Modal title="洗名" onClose={() => setWashModal(false)}>
          <div className="note">导出所选日期下，姓名为空且关联订单「是否加名=是」的手机号。</div>
          <div className="field" style={{ marginBottom: 14 }}><label className="required">数据日期</label>
            <input type="date" value={washDate} onChange={e => setWashDate(e.target.value)} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setWashModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doWashExport().catch(e => showError(e.message))}>导出</button>
          </div>
        </Modal>
      )}

      {billExpModal && (
        <Modal title="导出账单明细" onClose={() => setBillExpModal(false)}>
          <div className="note">按日期期间导出账单明细（含充值记录和余额）；不选代理则导出全部代理。</div>
          <div className="row">
            <div className="field"><label className="required">开始日期</label>
              <input type="date" value={billExpStart} onChange={e => setBillExpStart(e.target.value)} /></div>
            <div className="field"><label className="required">结束日期</label>
              <input type="date" value={billExpEnd} onChange={e => setBillExpEnd(e.target.value)} /></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}><label>代理</label>
            <select value={billExpCustId} onChange={e => setBillExpCustId(Number(e.target.value))}>
              <option value={0}>全部代理</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            </select></div>
          <div className="foot">
            <button className="btn" onClick={() => setBillExpModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doBillExport().catch(e => showError(e.message))}>导出</button>
          </div>
        </Modal>
      )}

      {billSummaryModal && (
        <Modal title="导出账单汇总" onClose={() => setBillSummaryModal(false)}>
          <div className="note">特定日期：导出该日账单，顶部附补数金额/理由；日期区间：导出每天的上游+下游汇总，末列备注=当天补数理由。</div>
          <div className="field" style={{ marginBottom: 12 }}><label>导出类型</label>
            <select value={billSummaryType} onChange={e => setBillSummaryType(e.target.value)}>
              <option value="day">特定日期账单</option>
              <option value="range">日期区间账单</option>
            </select></div>
          {billSummaryType === 'day' ? (
            <div className="field" style={{ marginBottom: 12 }}><label className="required">日期</label>
              <input type="date" value={billSummaryDate} onChange={e => setBillSummaryDate(e.target.value)} /></div>
          ) : (
            <div className="row">
              <div className="field"><label className="required">开始日期</label>
                <input type="date" value={billSummaryStart} onChange={e => setBillSummaryStart(e.target.value)} /></div>
              <div className="field"><label className="required">结束日期</label>
                <input type="date" value={billSummaryEnd} onChange={e => setBillSummaryEnd(e.target.value)} /></div>
            </div>
          )}
          <div className="foot">
            <button className="btn" onClick={() => setBillSummaryModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doBillSummaryExport().catch(e => showError(e.message))}>导出</button>
          </div>
        </Modal>
      )}

      {genBillModal && (() => {
        const billCustomers = customers
          .filter(c => c.ctype === 'upstream' || c.ctype === 'downstream')
          .sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0))
        const allChecked = billCustomers.length > 0 && billCustomers.every(c => genBillCustomerIds.includes(c.id))
        function toggleAll() {
          setGenBillCustomerIds(allChecked ? [] : billCustomers.map(c => c.id))
        }
        return (
        <Modal title="生成账单" onClose={() => setGenBillModal(false)}>
          <div className="note">特定日期：汇总从月初第一天到该日、明细只生成该日；日期区间：汇总与明细覆盖整个区间（每天一页明细）。使用 MB-031 模版，打包 ZIP 下载。</div>
          <div className="field" style={{ marginBottom: 12 }}><label>生成类型</label>
            <select value={genBillType} onChange={e => setGenBillType(e.target.value)}>
              <option value="day">特定日期账单</option>
              <option value="range">日期区间账单</option>
            </select></div>
          {genBillType === 'day' ? (
            <div className="field" style={{ marginBottom: 12 }}><label className="required">日期</label>
              <input type="date" value={genBillDate} onChange={e => setGenBillDate(e.target.value)} /></div>
          ) : (
            <div className="row">
              <div className="field"><label className="required">开始日期</label>
                <input type="date" value={genBillStart} onChange={e => setGenBillStart(e.target.value)} /></div>
              <div className="field"><label className="required">结束日期</label>
                <input type="date" value={genBillEnd} onChange={e => setGenBillEnd(e.target.value)} /></div>
            </div>
          )}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>客户（默认全部，点击名称选中 / 取消）</label>
            <div className="agent-list">
              <button type="button" className="agent-chip agent-chip-all" onClick={toggleAll}>{allChecked ? '全不选' : '全选'}</button>
              {billCustomers.map(c => {
                const on = genBillCustomerIds.includes(c.id)
                return (
                  <button type="button" key={c.id} className={`agent-chip ${on ? 'on' : ''}`} onClick={() => {
                    setGenBillCustomerIds(ids => ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])
                  }}>
                    {c.code} {c.name}
                  </button>
                )
              })}
              {billCustomers.length === 0 && <div className="empty">暂无客户</div>}
            </div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setGenBillModal(false)}>取消</button>
            <button className="btn primary" onClick={() => doGenerateBill().catch(e => showError(e.message))}>生成</button>
          </div>
        </Modal>
        )
      })()}

      {checkModal && (
        <Modal title="工单检查" onClose={() => setCheckModal(false)} wide style={{ width: 1092 }}>
          <div className="note">按所选甲方和「在执」工单在所选数据日期的数据量情况（按数据量降序）。</div>
          <div className="row">
            <div className="field"><label className="required">数据日期</label>
              <input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} /></div>
            <div className="field"><label>甲方</label>
              <select value={checkUpstream} onChange={e => setCheckUpstream(e.target.value)}>
                <option value="">全部</option>
                {(fieldOptions.upstream || []).map(u => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn primary" onClick={() => doCheck().catch(e => showError(e.message))}>检查</button>
            </div>
          </div>
          {checkResult && (
            <div className="table-scroll" style={{ maxHeight: 420 }}>
              <table>
                <thead><tr><th>工单号</th><th>任务名</th><th>渠道</th><th className="num">{checkMMDD(0)}</th><th className="num">{checkMMDD(1)}</th><th className="num">{checkMMDD(2)}</th><th className="num">超出订单数量</th><th className="num">违规地区</th><th>重复出现</th></tr></thead>
                <tbody>
                  {checkResult.map((r, i) => (
                    <tr key={i}>
                      <td>{r.task_id || '—'}</td>
                      <td>{r.task_name || '—'}</td>
                      <td>{r.channel || '—'}</td>
                      <td className="num">{r.count}</td>
                      <td className="num">{r.count_prev1 == null ? '/' : r.count_prev1}</td>
                      <td className="num">{r.count_prev2 == null ? '/' : r.count_prev2}</td>
                      <td className="num">{r.over_qty}</td>
                      <td className="num">{r.region_violation}</td>
                      <td>
                        {(r.repeat_dates || []).length
                          ? <a className="link" style={{ color: 'var(--red)' }} onClick={() => setRepeatDetailModal({ task_id: r.task_id, task_name: r.task_name, detail: r.repeat_detail || [] })}>有</a>
                          : '无'}
                      </td>
                    </tr>
                  ))}
                  {checkResult.length === 0 && <tr><td colSpan={9} className="empty">无匹配的在执工单</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="foot">
            {checkResult && checkResult.length > 0 && <button className="btn green" onClick={() => doCheckExport().catch(e => showError(e.message))}>导出检查结果</button>}
            <button className="btn primary" onClick={() => setCheckModal(false)}>关闭</button>
          </div>
        </Modal>
      )}

      {repeatDetailModal && (() => {
        const rows = (repeatDetailModal.detail || []).map(d => ({
          phone: d.phone,
          dates: [...(d.dates || [])].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
        }))
        return (
          <Modal title={`重复手机号详情 · ${repeatDetailModal.task_id || ''}`} onClose={() => setRepeatDetailModal(null)} wide>
            <div className="table-scroll" style={{ maxHeight: 440 }}>
              <table>
                <thead><tr><th style={{ width: 60 }}>序号</th><th>工单号</th><th>手机号</th><th>日期</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td>{repeatDetailModal.task_id || '—'}</td>
                      <td>{r.phone}</td>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{r.dates.join('、')}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} className="empty">暂无重复数据</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="foot"><button className="btn primary" onClick={() => setRepeatDetailModal(null)}>关闭</button></div>
          </Modal>
        )
      })()}

      {billDetail && (
        <Modal title="账单详情" onClose={() => setBillDetail(null)} wide>
          <div className="row">
            <div className="field"><label>代理</label><div className="readonly">{billDetail.customer || '—'}</div></div>
            <div className="field"><label>业务日期</label><div className="readonly">{billDetail.biz_date || '—'}</div></div>
            <div className="field"><label>进货量</label><div className="readonly">{billDetail.purchase_qty ?? '—'}</div></div>
            <div className="field"><label>销售金额（元）</label><div className="readonly">{billDetail.sales != null ? billDetail.sales : '—'}</div></div>
          </div>
          <div className="row">
            <div className="field"><label>余额（元）</label><div className="readonly">{billDetail.balance != null ? billDetail.balance : '—'}</div></div>
            <div className="field"><label>利润（元）</label><div className="readonly">{billDetail.profit != null ? billDetail.profit : '—'}</div></div>
          </div>
          <div className="panel" style={{ marginTop: 8 }}>
            <div className="table-scroll">
              <table>
                <thead><tr><th>任务/产品</th><th className="num">数量</th><th className="num">进货单价（元）</th><th className="num">出货单价（元）</th><th className="num">金额（元）</th></tr></thead>
                <tbody>
                  {(billDetail.groups || []).map(g => (
                    <tr key={g.task_name + g.order_no}>
                      <td>{g.task_name}</td>
                      <td className="num">{g.qty}</td>
                      <td className="num">{g.purchase_price}</td>
                      <td className="num">{g.sales_price}</td>
                      <td className="num">{g.amount}</td>
                    </tr>
                  ))}
                  {(billDetail.groups || []).length === 0 && <tr><td colSpan={5} className="empty">暂无明细</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="foot">
            {can('bill:edit_balance') && <button className="btn" onClick={openBalanceEdit}>修改余额</button>}
            <button className="btn primary" onClick={() => setBillDetail(null)}>关闭</button>
          </div>
        </Modal>
      )}

      {balanceEdit && (
        <Modal title="修改余额" onClose={() => setBalanceEdit(null)}>
          <div className="field" style={{ marginBottom: 12 }}><label>账单余额（元）</label>
            <input type="number" step="0.01" value={balanceEdit.balance} onChange={e => setBalanceEdit({ balance: e.target.value })} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setBalanceEdit(null)}>取消</button>
            <button className="btn primary" onClick={saveBalance}>保存</button>
          </div>
        </Modal>
      )}

      {orderDetail && (
        <Modal title={`订单 ${orderDetail.order_no} 详情`} onClose={() => setOrderDetail(null)} wide>
          <div className="row">
            <div className="field"><label>订单号</label><div className="readonly">{orderDetail.order_no || '—'}</div></div>
            <div className="field"><label>状态</label><div className="readonly">{orderDetail.status || '—'}</div></div>
            <div className="field"><label>任务名</label><div className="readonly">{orderDetail.task_name || '—'}</div></div>
            <div className="field"><label>工单号</label><div className="readonly">{orderDetail.task_id || '—'}</div></div>
          </div>
          <div className="row">
            <div className="field"><label>更新日期</label><div className="readonly">{orderDetail.order_date || '—'}</div></div>
            <div className="field"><label>甲方</label><div className="readonly">{orderDetail.upstream || '—'}</div></div>
            <div className="field"><label>一级代理</label><div className="readonly">{orderDetail.customer || '—'}</div></div>
            <div className="field"><label>二级代理</label><div className="readonly">{orderDetail.secondary_agent || '—'}</div></div>
          </div>
          <div className="row">
            <div className="field"><label>渠道</label><div className="readonly">{orderDetail.channel || '—'}</div></div>
            <div className="field"><label>运营商</label><div className="readonly">{orderDetail.operator || '—'}</div></div>
            <div className="field"><label>平台</label><div className="readonly">{orderDetail.platform || '—'}</div></div>
            <div className="field"><label>定价</label><div className="readonly">{orderDetail.price != null ? orderDetail.price : '—'}</div></div>
          </div>
          <div className="row">
            <div className="field"><label>数量</label><div className="readonly">{orderDetail.qty ?? '—'}</div></div>
            <div className="field"><label>年龄下限</label><div className="readonly">{orderDetail.age_min ?? '—'}</div></div>
            <div className="field"><label>年龄上限</label><div className="readonly">{orderDetail.age_max ?? '—'}</div></div>
            <div className="field"><label>pv</label><div className="readonly">{orderDetail.pv ?? '—'}</div></div>
          </div>
          <div className="row">
            <div className="field"><label>省份</label><div className="readonly">{orderDetail.province || '—'}</div></div>
            <div className="field"><label>地市</label><div className="readonly">{orderDetail.city || '—'}</div></div>
            <div className="field"><label>排除省份</label><div className="readonly">{orderDetail.excl_province || '—'}</div></div>
            <div className="field"><label>排除地市</label><div className="readonly">{orderDetail.excl_city || '—'}</div></div>
          </div>
          <div className="row">
            <div className="field"><label>开始日期</label><div className="readonly">{orderDetail.start_date || '—'}</div></div>
            <div className="field"><label>截止日期</label><div className="readonly">{orderDetail.end_date || '—'}</div></div>
            <div className="field"><label>小组</label><div className="readonly">{orderDetail.group_name || '—'}</div></div>
            <div className="field"><label>是否加名</label><div className="readonly">{orderDetail.add_name ? '是' : '否'}</div></div>
          </div>
          <div className="row">
            <div className="field">
              <label>URL 列表</label>
              <div className="readonly" style={{ height: 'auto', minHeight: 32, whiteSpace: 'pre-wrap', padding: '6px 13px' }}>{(orderDetail.urls || []).join('\n') || '—'}</div>
            </div>
          </div>
          <div className="foot"><button className="btn primary" onClick={() => setOrderDetail(null)}>关闭</button></div>
        </Modal>
      )}

      {urlModal && (
        <Modal title={urlModal.mode === 'edit' ? '编辑配件' : '新增配件'} onClose={() => setUrlModal(null)} wide>
          <div className="row">
            <div className="field"><label>名称</label><ClearableInput value={urlModal.name} onChange={e => setUrlField('name', e.target.value)} /></div>
            <div className="field"><label>等级</label><select value={urlModal.level} onChange={e => setUrlField('level', e.target.value)}><option>高</option><option>中</option><option>低</option></select></div>
          </div>
          <div className="row">
            <div className="field"><label>归属</label>
              <select value={urlModal.owner_id} onChange={e => setUrlField('owner_id', e.target.value)}>
                <option value="">请选择</option>{customers.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select></div>
            <div className="field"><label>渠道</label>
              <select value={urlModal.channel_id} onChange={e => setUrlField('channel_id', e.target.value)}>
                <option value="">请选择</option>{urlOptions.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field"><label>平台</label>
              <select value={urlModal.platform_id} onChange={e => setUrlField('platform_id', e.target.value)}>
                <option value="">请选择</option>{urlOptions.platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          </div>
          <div className="field" style={{ marginBottom: 8 }}><label>URL（每行一个）</label></div>
          {urlModal.urls.map((u, i) => (
            <div className="row" key={i}>
              <div className="field" style={{ flex: 1 }}><ClearableInput placeholder="https://..." value={u} onChange={e => setUrlRow(i, e.target.value)} /></div>
              <button className="btn small danger" style={{ alignSelf: 'center' }} onClick={() => delUrlRow(i)}>删除</button>
            </div>
          ))}
          <button className="btn small" onClick={addUrlRow}>+ 添加 URL</button>
          <div className="foot"><button className="btn" onClick={() => setUrlModal(null)}>取消</button><button className="btn primary" onClick={saveUrlModal}>保存</button></div>
        </Modal>
      )}

      {userCreate && (
        <Modal title="新增账户" onClose={() => setUserCreate(null)}>
          <div className="field" style={{ marginBottom: 10 }}><label className="required">用户名</label>
            <ClearableInput value={userCreate.username} onChange={e => setUserCreate({ ...userCreate, username: e.target.value })} /></div>
          <div className="field" style={{ marginBottom: 10 }}><label className="required">昵称</label>
            <ClearableInput value={userCreate.nickname} onChange={e => setUserCreate({ ...userCreate, nickname: e.target.value })} /></div>
          <div className="field" style={{ marginBottom: 10 }}><label className="required">角色</label>
            <select value={userCreate.role_id ?? ''} onChange={e => setUserCreate({ ...userCreate, role_id: Number(e.target.value) })}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
          <div className="field" style={{ marginBottom: 14 }}><label className="required">初始密码</label>
            <ClearableInput value={userCreate.password} onChange={e => setUserCreate({ ...userCreate, password: e.target.value })} placeholder="至少 6 位" /></div>
          <div className="foot">
            <button className="btn" onClick={() => setUserCreate(null)}>取消</button>
            <button className="btn primary" onClick={saveUserCreate}>创建</button>
          </div>
        </Modal>
      )}

      {pwdModal && (
        <Modal title={`修改密码 · ${pwdModal.username}`} onClose={() => setPwdModal(null)}>
          <div className="field" style={{ marginBottom: 10 }}><label>新密码</label><input type="password" value={pwdModal.password} onChange={e => setPwdModal({ ...pwdModal, password: e.target.value })} placeholder="至少 6 位" /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>确认新密码</label><input type="password" value={pwdModal.confirm} onChange={e => setPwdModal({ ...pwdModal, confirm: e.target.value })} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setPwdModal(null)}>取消</button>
            <button className="btn primary" onClick={savePwd}>确认修改</button>
          </div>
        </Modal>
      )}

      {userEdit && (
        <Modal title={`编辑账户 · ${userEdit.username}`} onClose={() => setUserEdit(null)}>
          <div className="field" style={{ marginBottom: 10 }}><label>昵称</label>
            <ClearableInput value={userEdit.nickname} onChange={e => setUserEdit({ ...userEdit, nickname: e.target.value })} /></div>
          <div className="field" style={{ marginBottom: 10 }}><label>角色</label>
            <select value={userEdit.role_id ?? ''} onChange={e => setUserEdit({ ...userEdit, role_id: Number(e.target.value) })}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
          <div className="field" style={{ marginBottom: 14 }}><label>状态</label>
            <select value={userEdit.status} onChange={e => setUserEdit({ ...userEdit, status: Number(e.target.value) })}>
              <option value={1}>启用</option>
              <option value={0}>停用</option>
            </select></div>
          <div className="foot">
            <button className="btn" onClick={() => setUserEdit(null)}>取消</button>
            <button className="btn primary" onClick={saveUserEdit}>保存</button>
          </div>
        </Modal>
      )}

      {roleCreate && (
        <Modal title="新增角色" onClose={() => setRoleCreate(null)}>
          <div className="field" style={{ marginBottom: 10 }}><label>角色名称</label>
            <ClearableInput value={roleCreate.name} onChange={e => setRoleCreate({ ...roleCreate, name: e.target.value })} placeholder="如：运营助理" /></div>
          <div className="field" style={{ marginBottom: 10 }}><label>角色编码</label>
            <ClearableInput value={roleCreate.code} onChange={e => setRoleCreate({ ...roleCreate, code: e.target.value })} placeholder="如：operator2（唯一，用于系统识别）" /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>备注</label>
            <ClearableInput value={roleCreate.note} onChange={e => setRoleCreate({ ...roleCreate, note: e.target.value })} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setRoleCreate(null)}>取消</button>
            <button className="btn primary" onClick={saveRoleCreate}>创建</button>
          </div>
        </Modal>
      )}

    </div>
  )
}
