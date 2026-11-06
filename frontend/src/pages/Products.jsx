import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Modal, useToast, useConfirm, ClearableInput, Badge } from '../components/ui'
import { useColumnConfig } from '../components/columns'
import FilterBar from '../components/FilterBar'
import Pagination from '../components/Pagination'
import { useButtonPerm } from '../buttonPerms'

const SOURCES = ['日活', '采购', '其他']
const COLS = [
  { k: 'name', l: '产品名' },
  { k: 'category', l: '类别' },
  { k: 'source', l: '来源' },
  { k: 'purchase_price', l: '进货单价（元）', num: true },
  { k: 'default_sales_price', l: '默认出货单价（元）', num: true },
  { k: 'status', l: '状态' },
  { k: 'created_at', l: '创建时间' },
  { k: 'created_by', l: '创建人' },
  { k: 'updated_at', l: '更新时间' },
  { k: 'updated_by', l: '更新人' },
]
const FILTER_COLS = [
  { k: 'q', l: '产品名' },
  { k: 'category', l: '类别' },
  { k: 'source', l: '来源' },
]
const empty = { name: '', category: '', source: '', purchase_price: '', default_sales_price: '', note: '', status: 1 }

const IconColumns = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="16" y2="21" /></svg>
)

export default function Products() {
  const { toast, showError } = useToast()
  const [confirm, confirmEl] = useConfirm()
  const { can } = useButtonPerm()
  const { visible: cols, picker, openPicker } = useColumnConfig(COLS, 'cols_products_v2', [])
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [modal, setModal] = useState(null) // null | {id?, ...form}
  const [sort, setSort] = useState(null)
  const [categories, setCategories] = useState([])
  const [priceModal, setPriceModal] = useState(null) // null | { id, name, purchase_price, default_sales_price, items: [] }
  const [priceLoading, setPriceLoading] = useState(false)

  function load() {
    api.get('/api/products?per_page=1000').then(r => setRows(r.data?.rows || [])).catch(e => showError(e.message))
  }
  useEffect(() => {
    load()
    api.get('/api/categories').then(r => setCategories((r.data || []).map(c => c.name))).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    return rows.filter(p => {
      if (filters.q && !((p.name || '').includes(filters.q) || (p.category || '').includes(filters.q))) return false
      if (filters.category && p.category !== filters.category) return false
      if (filters.source && p.source !== filters.source) return false
      return true
    })
  }, [rows, filters])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort) list.sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : -1) * (sort.dir === 'asc' ? 1 : -1))
    return list
  }, [filtered, sort])

  const paged = sorted.slice((page - 1) * perPage, page * perPage)

  function search() { setPage(1) }
  function changePerPage(pp) { setPerPage(pp); setPage(1) }
  function goPage(p) { setPage(p) }

  function toggleSort(k) {
    setSort(s => (s && s.k === k) ? (s.dir === 'asc' ? { k, dir: 'desc' } : null) : { k, dir: 'asc' })
  }

  function openCreate() { setModal({ ...empty }) }
  function openEdit(p) {
    setModal({ id: p.id, name: p.name, category: p.category || '', source: p.source || '',
      purchase_price: p.purchase_price ?? '', default_sales_price: p.default_sales_price ?? '',
      note: p.note || '', status: p.status })
  }
  function copyProduct(p) {
    setModal({ name: `${p.name}-复制`, category: p.category || '', source: p.source || '',
      purchase_price: p.purchase_price ?? '', default_sales_price: p.default_sales_price ?? '',
      note: p.note || '', status: p.status })
  }
  async function save() {
    const name = (modal.name || '').trim()
    if (!name) { showError('请填写产品名称'); return }
    try {
      if (modal.id) await api.put(`/api/products/${modal.id}`, modal)
      else await api.post('/api/products', modal)
      toast('已保存'); setModal(null); load()
    } catch (e) { showError(e.message) }
  }
  async function del(p) {
    if (!(await confirm(`确认删除产品「${p.name}」？`))) return
    try { await api.del(`/api/products/${p.id}`); toast('已删除'); load() } catch (e) { showError(e.message) }
  }

  async function openPrice(p) {
    const info = { id: p.id, name: p.name, category: p.category || '', source: p.source || '',
      purchase_price: p.purchase_price, default_sales_price: p.default_sales_price,
      note: p.note || '', status: p.status, items: [] }
    setPriceLoading(true)
    setPriceModal(info)
    try {
      const r = await api.get(`/api/products/${p.id}/customer-prices`)
      setPriceModal({ ...info, items: r.data || [] })
    } catch (e) { showError(e.message) } finally { setPriceLoading(false) }
  }
  function setPriceItem(customer_id, sales_price) {
    setPriceModal(m => m ? { ...m, items: m.items.map(it => it.customer_id === customer_id ? { ...it, sales_price } : it) } : m)
  }
  async function savePrices() {
    if (!priceModal) return
    try {
      await api.put(`/api/products/${priceModal.id}/customer-prices`, { items: priceModal.items.map(it => ({ customer_id: it.customer_id, sales_price: it.sales_price === '' || it.sales_price == null ? null : Number(it.sales_price) })) })
      toast('代理售价已保存'); setPriceModal(null)
    } catch (e) { showError(e.message) }
  }

  function cell(c, r) {
    const v = r[c.k]
    if (c.k === 'status') return <Badge value={v === 1 ? '启用' : '停用'} />
    return v != null ? v : '—'
  }

  const fieldOptions = { category: categories, source: SOURCES }

  return (
    <div className="page">
      {confirmEl}
      {picker}
      <div className="toolbar">
        <div className="filter-wrap">
          <FilterBar cols={FILTER_COLS} filters={filters} setFilters={setFilters} onSearch={search} fieldOptions={fieldOptions} actions={true} />
        </div>
        <div className="toolbar-actions">
          {can('products:create') && <button className="btn primary" onClick={openCreate}>+ 新增产品</button>}
          <button className="btn icon" title="自定义表头" onClick={openPicker}>{IconColumns}</button>
        </div>
      </div>
      <div className="panel">
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th className="ops">操作</th>
              {cols.map(c => (
                <th key={c.k} className={c.num ? 'num' : ''} onClick={() => toggleSort(c.k)}>
                  {c.l}{sort?.k === c.k ? <span className="arr">{sort.dir === 'asc' ? '▲' : '▼'}</span> : ''}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map(p => (
                <tr key={p.id} onDoubleClick={() => openEdit(p)}>
                  <td className="ops">
                    {can('products:edit') && <button className="btn small" onClick={() => openEdit(p)}>编辑</button>}
                    {can('products:price') && <button className="btn small" onClick={() => openPrice(p)}>代理售价</button>}
                    {can('products:copy') && <button className="btn small" onClick={() => copyProduct(p)}>复制</button>}
                    {can('products:delete') && <button className="btn small danger" onClick={() => del(p)}>删除</button>}
                  </td>
                  {cols.map(c => (
                    <td key={c.k} className={c.num ? 'num' : ''}>{cell(c, p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && <div className="empty">暂无产品</div>}
        <Pagination total={sorted.length} page={page} perPage={perPage} setPage={setPage} setPerPage={changePerPage} goPage={goPage} />
      </div>

      {modal && (
        <Modal title={modal.id ? '编辑产品' : '新增产品'} onClose={() => setModal(null)} wide>
          <div className="row">
            <div className="field"><label className="required">产品名称</label>
              <ClearableInput value={modal.name} onChange={e => setModal({ ...modal, name: e.target.value })} /></div>
            <div className="field"><label>产品类别</label>
              <select value={modal.category} onChange={e => setModal({ ...modal, category: e.target.value })}>
                <option value="">请选择</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="field"><label>产品来源</label>
              <select value={modal.source} onChange={e => setModal({ ...modal, source: e.target.value })}>
                <option value="">请选择</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="row">
            <div className="field"><label>进货单价（元）</label>
              <input type="number" step="0.01" value={modal.purchase_price} onChange={e => setModal({ ...modal, purchase_price: e.target.value })} /></div>
            <div className="field"><label>默认出货单价（元）</label>
              <input type="number" step="0.01" value={modal.default_sales_price} onChange={e => setModal({ ...modal, default_sales_price: e.target.value })} /></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}><label>说明</label>
            <textarea rows={3} value={modal.note} onChange={e => setModal({ ...modal, note: e.target.value })} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setModal(null)}>取消</button>
            <button className="btn primary" onClick={save}>保存</button>
          </div>
        </Modal>
      )}

      {priceModal && (
        <Modal title="代理售价" onClose={() => setPriceModal(null)} wide>
          <div className="price-head">
            <div className="price-head-top">
              <div className="price-head-name">{priceModal.name}</div>
              <Badge value={priceModal.status === 1 ? '启用' : '停用'} />
            </div>
            <div className="price-head-meta">
              <div className="price-head-item">产品类别<b>{priceModal.category || '—'}</b></div>
              <div className="price-head-item">产品来源<b>{priceModal.source || '—'}</b></div>
              <div className="price-head-item">进货价（元）<b>{priceModal.purchase_price ?? '—'}</b></div>
              <div className="price-head-item">默认售价（元）<b>{priceModal.default_sales_price ?? '—'}</b></div>
            </div>
            {priceModal.note ? <div className="price-head-note">说明：{priceModal.note}</div> : null}
          </div>
          <div className="note">为不同代理设置该产品的销售单价，留空表示使用默认售价；修改只影响之后录入的销售，不影响历史记录。</div>
          {priceLoading ? (
            <div className="empty">加载中…</div>
          ) : (
            <div className="table-scroll" style={{ maxHeight: 340 }}>
              <table className="price-table">
                <thead><tr>
                  <th style={{ width: 220 }}>代理</th>
                  <th className="num">销售单价（元）</th>
                  <th className="num" style={{ width: 150 }}>实际售价</th>
                </tr></thead>
                <tbody>
                  {priceModal.items.map(it => {
                    const hasVal = it.sales_price !== '' && it.sales_price != null
                    return (
                      <tr key={it.customer_id}>
                        <td>{it.customer}</td>
                        <td className="num">
                          <input type="number" step="0.01" placeholder={priceModal.default_sales_price ?? '默认'}
                            value={it.sales_price ?? ''} onChange={e => setPriceItem(it.customer_id, e.target.value)} />
                        </td>
                        <td className="num price-eff">{hasVal
                          ? `¥${Number(it.sales_price)}`
                          : <span className="price-default">默认 ¥{priceModal.default_sales_price ?? '—'}</span>}</td>
                      </tr>
                    )
                  })}
                  {priceModal.items.length === 0 && (
                    <tr><td colSpan={3} className="empty">暂无下游代理</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="foot">
            <button className="btn" onClick={() => setPriceModal(null)}>取消</button>
            <button className="btn primary" onClick={savePrices}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
