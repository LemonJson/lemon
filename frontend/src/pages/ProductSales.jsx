import React, { useEffect, useRef, useState } from 'react'
import { api, uploadFile, downloadFile } from '../api'
import { useToast, useConfirm, Modal, ClearableInput } from '../components/ui'
import { useColumnConfig } from '../components/columns'
import { useButtonPerm } from '../buttonPerms'
import ProductManager from '../components/ProductManager'

const IconColumns = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="16" y2="21" /></svg>
)

const PS_COLS = [
  { k: 'customer', l: '客户', width: '12%' },
  { k: 'region', l: '地区', width: '9.6%' },
  { k: 'product', l: '产品', width: '14.4%' },
  { k: 'qty', l: '数量', width: '8%', num: true },
  { k: 'purchase_price', l: '进货单价（元）', width: '10%', num: true },
  { k: 'sales_price', l: '出货单价（元）', width: '10%', num: true },
  { k: 'sales_amount', l: '销售金额（元）', width: '10%', num: true },
  { k: 'profit', l: '利润（元）', width: '8%', num: true },
  { k: 'created_by', l: '创建人', width: '7%' },
  { k: 'created_at', l: '创建时间', width: '11%' },
  { k: 'updated_by', l: '更新人', width: '7%' },
  { k: 'updated_at', l: '更新时间', width: '11%' },
  { k: 'ops', l: '操作', width: '8%', center: true },
]
const PS_DEFAULT_HIDDEN = ['created_by', 'created_at', 'updated_by', 'updated_at']

function fmt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function blankPsRow(date) {
  return { id: 'new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), isNew: true, sale_date: date,
           customer_id: '', customer: '', product_id: '', product: '', region: '', qty: '', purchase_price: '', sales_price: '', note: '' }
}

function isBlankRow(p) {
  return !p.customer_id && !p.product_id && (p.qty === '' || p.qty == null)
    && (p.purchase_price === '' || p.purchase_price == null) && (p.sales_price === '' || p.sales_price == null)
}

function withBlankRows(list, date) {
  const current = list.filter(p => p.sale_date === date)
  if (current.length >= 10) return list
  const blanks = Array(10 - current.length).fill(0).map(() => blankPsRow(date))
  return [...blanks, ...list]
}

export default function ProductSales() {
  const { toast, showError } = useToast()
  const { can } = useButtonPerm()
  const [confirm, confirmEl] = useConfirm()
  const { visible: psCols, picker: psPicker, openPicker } = useColumnConfig(PS_COLS, 'cols_product_sales_v1', PS_DEFAULT_HIDDEN)
  const [productSales, setProductSales] = useState([])
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [customerPriceMap, setCustomerPriceMap] = useState({})
  const [regions, setRegions] = useState([])
  const [psImportResult, setPsImportResult] = useState(null)
  const [psExportModal, setPsExportModal] = useState(false)
  const [showProductManager, setShowProductManager] = useState(false)
  const [psDate, setPsDate] = useState(() => fmt(new Date()))
  const psFileRef = useRef(null)
  const today = fmt(new Date())
  const yesterday = fmt(new Date(Date.now() - 86400000))
  const isToday = psDate === today
  const isEditable = isToday || psDate === yesterday
  const isFuture = psDate > today
  const daysAhead = isFuture ? Math.round((new Date(psDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : 0

  function loadProductSales() {
    api.get('/api/product-sales?per_page=1000').then(r => {
      const rows = (r.data?.rows || []).slice().sort((a, b) => (a.sale_date < b.sale_date ? 1 : a.sale_date > b.sale_date ? -1 : (b.id - a.id)))
      setProductSales(isEditable ? withBlankRows(rows, psDate) : rows)
    }).catch(() => {})
  }

  function loadProductsAndPrices() {
    api.get('/api/products?per_page=1000').then(r => setProducts(r.data?.rows || [])).catch(() => {})
    api.get('/api/product-customer-prices').then(r => {
      const map = {}
      ;(r.data || []).forEach(x => {
        if (!map[x.product_id]) map[x.product_id] = {}
        map[x.product_id][x.customer_id] = x.sales_price
      })
      setCustomerPriceMap(map)
    }).catch(() => {})
  }

  useEffect(() => {
    loadProductSales()
    loadProductsAndPrices()
    api.get('/api/customers?per_page=1000').then(r => setCustomers(r.data?.rows?.filter(c => c.ctype === 'downstream').sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0)) || [])).catch(() => {})
    api.get('/api/regions').then(r => {
      const provs = r.data?.provinces || []
      const cities = Object.values(r.data?.cities || {}).flat()
      setRegions([...new Set([...provs, ...cities])].sort((a, b) => a.localeCompare(b, 'zh')))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setProductSales(list => isEditable ? withBlankRows(list, psDate) : list)
  }, [psDate])

  function updatePs(id, patch) {
    setProductSales(list => list.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  function addPsRow() {
    setProductSales(list => [blankPsRow(psDate), ...list])
  }
  function onPickPsCustomer(row, text) {
    const c = customers.find(x => `${x.code} ${x.name}` === text) || customers.find(x => x.code === text) || customers.find(x => x.name === text)
    const patch = { customer: text, customer_id: c ? c.id : '' }
    if (c && row.product_id) {
      const prod = products.find(p => p.id === row.product_id)
      if (prod) {
        const cp = customerPriceMap[row.product_id]?.[c.id]
        patch.sales_price = cp != null ? cp : (prod.default_sales_price ?? '')
        patch.purchase_price = prod.purchase_price ?? ''
      }
    }
    updatePs(row.id, patch)
  }
  function onPickPsProduct(row, text) {
    const prod = products.find(x => x.name === text)
    if (prod) {
      const cp = customerPriceMap[prod.id]?.[row.customer_id]
      const sp = cp != null ? cp : (prod.default_sales_price ?? '')
      updatePs(row.id, { product: text, product_id: prod.id, sales_price: sp, purchase_price: prod.purchase_price ?? '' })
    } else {
      updatePs(row.id, { product: text, product_id: '' })
    }
  }
  function psCalc(p) {
    const qty = Number(p.qty) || 0
    const sp = Number(p.sales_price) || 0
    const pp = Number(p.purchase_price) || 0
    return { sales_amount: qty * sp, profit: qty * (sp - pp) }
  }
  const filteredSales = productSales
    .filter(p => !psDate || p.sale_date === psDate)
    .sort((a, b) => (isBlankRow(a) ? 1 : 0) - (isBlankRow(b) ? 1 : 0))

  async function saveAll() {
    const rows = filteredSales.filter(p => !isBlankRow(p))
    if (rows.length === 0) { showError('没有可保存的数据'); return }
    const invalid = []
    rows.forEach((p, i) => {
      if (!p.customer_id) invalid.push(`第 ${i + 1} 行：请选择客户`)
      if (!p.product_id) invalid.push(`第 ${i + 1} 行：请选择产品`)
      if (!p.region) invalid.push(`第 ${i + 1} 行：请填写地区`)
      else if (!regions.includes(p.region)) invalid.push(`第 ${i + 1} 行：地区不存在「${p.region}」`)
      if (p.qty === '' || p.qty == null || !(Number(p.qty) > 0)) invalid.push(`第 ${i + 1} 行：请填写有效的数量`)
    })
    if (invalid.length) { showError(invalid.join('；')); return }
    if (!(await confirm(`确认批量保存当前 ${rows.length} 条产品销售数据？保存后将生成账单数据。`))) return
    try {
      const body = {
        date: psDate,
        rows: rows.map(p => ({
          id: p.isNew ? null : p.id,
          customer_id: Number(p.customer_id),
          product_id: Number(p.product_id),
          region: p.region || '',
          qty: Number(p.qty),
          purchase_price: p.purchase_price === '' ? null : Number(p.purchase_price),
          sales_price: p.sales_price === '' ? null : Number(p.sales_price),
          note: p.note || '',
        })),
      }
      await api.post('/api/product-sales/save-batch', body)
      toast('已保存并生成账单'); loadProductSales()
    } catch (e) { showError(e.message) }
  }
  async function delPs(p) {
    if (p.isNew) { setProductSales(list => list.filter(r => r.id !== p.id)); return }
    const label = [p.customer, p.region, p.product].filter(Boolean).join(' / ')
    if (!(await confirm(`确认删除该产品销售记录？${label ? '\n' + label : ''}\n此操作不可恢复。`, true))) return
    try { await api.del(`/api/product-sales/${p.id}`); toast('已删除'); loadProductSales() } catch (e) { showError(e.message) }
  }

  async function importProductSales(file) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await uploadFile('/api/product-sales/import', fd)
      loadProductSales()
      const dates = data.data?.dates || []
      if (dates.length === 1) setPsDate(dates[0])
      const errors = data.data?.errors || []
      if (errors.length > 0) {
        setPsImportResult({ imported: data.data?.imported || 0, errors })
      } else {
        toast(data.msg || '导入完成')
      }
    } catch (e) { showError(e.message) }
  }

  function exportPsTemplate() {
    downloadFile('/api/product-sales/template').catch(e => showError(e.message))
  }

  function exportPs(scope) {
    const url = scope === 'all' ? '/api/product-sales/export' : `/api/product-sales/export?date=${psDate}`
    downloadFile(url).catch(e => showError(e.message))
    setPsExportModal(false)
  }

  function renderPsCell(p, col) {
    const calc = psCalc(p)
    switch (col.k) {
      case 'customer':
        return <ClearableInput list="ps-customers" value={p.customer || ''} disabled={!isEditable} placeholder="输入或选择客户" onChange={e => onPickPsCustomer(p, e.target.value)} />
      case 'region':
        return <ClearableInput list="ps-regions" value={p.region || ''} disabled={!isEditable} placeholder="省份/地市" onChange={e => updatePs(p.id, { region: e.target.value })} />
      case 'product':
        return <ClearableInput list="ps-products" value={p.product || ''} disabled={!isEditable} placeholder="输入或选择产品" onChange={e => onPickPsProduct(p, e.target.value)} />
      case 'qty':
        return <input type="number" value={p.qty} disabled={!isEditable} onChange={e => updatePs(p.id, { qty: e.target.value })} />
      case 'purchase_price':
        return <input type="number" step="0.01" value={p.purchase_price} disabled={!isEditable} onChange={e => updatePs(p.id, { purchase_price: e.target.value })} />
      case 'sales_price':
        return <input type="number" step="0.01" value={p.sales_price} disabled={!isEditable} onChange={e => updatePs(p.id, { sales_price: e.target.value })} />
      case 'sales_amount':
        return <span>¥{calc.sales_amount.toFixed(2)}</span>
      case 'profit':
        return <span style={{ color: calc.profit < 0 ? 'var(--red)' : 'inherit' }}>¥{calc.profit.toFixed(2)}</span>
      case 'created_by':
        return <span className="audit-who">{p.created_by || '—'}</span>
      case 'created_at':
        return <span className="audit-time">{p.created_at || '—'}</span>
      case 'updated_by':
        return <span className="audit-who">{p.updated_by || '—'}</span>
      case 'updated_at':
        return <span className="audit-time">{p.updated_at || '—'}</span>
      case 'ops':
        return isEditable && can('product:delete') ? <button className="btn small danger" onClick={() => delPs(p)}>删除</button> : null
      default:
        return null
    }
  }

  return (
    <div className="page-scroll">
      {confirmEl}
      {psPicker}
      <div className="panel">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>
            销售日期
            <input type="date" value={psDate} onChange={e => setPsDate(e.target.value)} style={{ marginLeft: 10, height: 30 }} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} ref={psFileRef} onChange={e => { if (e.target.files[0]) importProductSales(e.target.files[0]).catch(err => showError(err.message)); e.target.value = '' }} />
            {can('product:export') && <button className="btn green" onClick={() => setPsExportModal(true)}>导出 Excel</button>}
            {can('product:export_template') && <button className="btn" onClick={exportPsTemplate}>导出模版</button>}
            {can('product:import') && <button className="btn orange" onClick={() => psFileRef.current.click()}>导入 Excel</button>}
            {can('products:edit') && <button className="btn" onClick={() => setShowProductManager(true)}>维护产品</button>}
            {isEditable && can('product:create') && <button className="btn primary" onClick={addPsRow}>+ 新增</button>}
            {isEditable && can('product:save') && <button className="btn primary" onClick={saveAll}>批量保存</button>}
            <button className="btn icon" title="自定义表头" onClick={openPicker}>{IconColumns}</button>
          </span>
        </h3>
        {isFuture ? (
          <div className="empty">产品不支持预售，请在 {daysAhead} 天后创建销售订单</div>
        ) : (!isEditable && filteredSales.length === 0) ? (
          <div className="empty">{psDate.replace(/-/g, '')}没有产品销售数据</div>
        ) : (
          <>
            <datalist id="ps-customers">{customers.map(c => <option key={c.id} value={`${c.code} ${c.name}`} />)}</datalist>
            <datalist id="ps-products">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
            <datalist id="ps-regions">{regions.map(r => <option key={r} value={r} />)}</datalist>
            <div style={{ height: 400, overflowY: 'auto', overflowX: 'auto' }}>
              <table className="ps-table">
                <colgroup>
                  {psCols.map(col => <col key={col.k} style={{ width: col.width }} />)}
                </colgroup>
                <thead><tr>{psCols.map(col => <th key={col.k} className="center">{col.l}</th>)}</tr></thead>
                <tbody>
                  {filteredSales.map(p => (
                    <tr key={p.id}>
                      {psCols.map(col => (
                        <td key={col.k} className={col.k === 'ops' ? 'ops' : (col.num ? 'num' : '')}>
                          {renderPsCell(p, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {psImportResult && (
        <Modal title="导入结果" onClose={() => setPsImportResult(null)} wide>
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            成功导入 <b style={{ color: 'var(--green)' }}>{psImportResult.imported}</b> 条，
            失败 <b style={{ color: 'var(--red)' }}>{psImportResult.errors.length}</b> 条，请修改后重新导入：
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 14px', background: '#fafbfd' }}>
            {psImportResult.errors.map((e, i) => (
              <div key={i} style={{ padding: '3px 0', fontSize: 13, color: 'var(--red)', wordBreak: 'break-all' }}>
                {i + 1}. {e}
              </div>
            ))}
          </div>
          <div className="foot">
            <button className="btn primary" onClick={() => setPsImportResult(null)}>关闭</button>
          </div>
        </Modal>
      )}

      {psExportModal && (
        <Modal title="导出产品销售" onClose={() => setPsExportModal(false)}>
          <div style={{ marginBottom: 16, fontSize: 14 }}>请选择导出范围：</div>
          <div className="foot">
            <button className="btn" onClick={() => exportPs('current')}>导出当前日期数据</button>
            <button className="btn primary" onClick={() => exportPs('all')}>导出全部数据</button>
          </div>
        </Modal>
      )}

      {showProductManager && (
        <ProductManager onClose={() => setShowProductManager(false)} onChanged={loadProductsAndPrices} />
      )}
    </div>
  )
}
