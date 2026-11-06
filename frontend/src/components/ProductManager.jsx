import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Modal, useToast, ClearableInput, Badge } from './ui'
import { useButtonPerm } from '../buttonPerms'

const SOURCES = ['日活', '采购', '其他']
const empty = { name: '', category: '', source: '', purchase_price: '', default_sales_price: '', note: '', status: 1 }

export default function ProductManager({ onClose, onChanged }) {
  const { toast, showError } = useToast()
  const { can } = useButtonPerm()
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [kw, setKw] = useState('')
  const [editModal, setEditModal] = useState(null) // null | {id?, ...form}
  const [priceModal, setPriceModal] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)

  function load() {
    api.get('/api/products?per_page=1000').then(r => setRows(r.data?.rows || [])).catch(e => showError(e.message))
  }
  useEffect(() => {
    load()
    api.get('/api/categories').then(r => setCategories((r.data || []).map(c => c.name))).catch(() => {})
  }, [])

  const filtered = rows.filter(p => !kw || (p.name || '').includes(kw) || (p.category || '').includes(kw))

  function refresh() {
    load()
    if (onChanged) onChanged()
  }

  function openCreate() { setEditModal({ ...empty }) }
  function openEdit(p) {
    setEditModal({ id: p.id, name: p.name, category: p.category || '', source: p.source || '',
      purchase_price: p.purchase_price ?? '', default_sales_price: p.default_sales_price ?? '',
      note: p.note || '', status: p.status })
  }
  async function saveEdit() {
    const name = (editModal.name || '').trim()
    if (!name) { showError('请填写产品名称'); return }
    try {
      if (editModal.id) await api.put(`/api/products/${editModal.id}`, editModal)
      else await api.post('/api/products', editModal)
      toast('已保存'); setEditModal(null); refresh()
    } catch (e) { showError(e.message) }
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
      toast('代理售价已保存'); setPriceModal(null); refresh()
    } catch (e) { showError(e.message) }
  }

  return (
    <Modal title="维护产品" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <ClearableInput placeholder="搜索产品名/类别" value={kw} onChange={e => setKw(e.target.value)} style={{ width: 220 }} />
        <span style={{ flex: 1 }} />
        {can('products:create') && <button className="btn primary" onClick={openCreate}>+ 新增产品</button>}
      </div>
      <div className="table-scroll" style={{ maxHeight: 420 }}>
        <table>
          <thead><tr>
            <th>产品名</th><th>类别</th><th>来源</th>
            <th className="num">进货价（元）</th><th className="num">默认售价（元）</th><th>状态</th>
            <th className="ops">操作</th>
          </tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.category || '—'}</td>
                <td>{p.source || '—'}</td>
                <td className="num">{p.purchase_price ?? '—'}</td>
                <td className="num">{p.default_sales_price ?? '—'}</td>
                <td><Badge value={p.status === 1 ? '启用' : '停用'} /></td>
                <td className="ops">
                  {can('products:edit') && <button className="btn small" onClick={() => openEdit(p)}>编辑</button>}{' '}
                  {can('products:price') && <button className="btn small" onClick={() => openPrice(p)}>代理售价</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty">暂无产品</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="foot">
        <button className="btn" onClick={onClose}>关闭</button>
      </div>

      {editModal && (
        <Modal title={editModal.id ? '编辑产品' : '新增产品'} onClose={() => setEditModal(null)} wide>
          <div className="row">
            <div className="field"><label className="required">产品名称</label>
              <ClearableInput value={editModal.name} onChange={e => setEditModal({ ...editModal, name: e.target.value })} /></div>
            <div className="field"><label>产品类别</label>
              <select value={editModal.category} onChange={e => setEditModal({ ...editModal, category: e.target.value })}>
                <option value="">请选择</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="field"><label>产品来源</label>
              <select value={editModal.source} onChange={e => setEditModal({ ...editModal, source: e.target.value })}>
                <option value="">请选择</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="row">
            <div className="field"><label>进货单价（元）</label>
              <input type="number" step="0.01" value={editModal.purchase_price} onChange={e => setEditModal({ ...editModal, purchase_price: e.target.value })} /></div>
            <div className="field"><label>默认出货单价（元）</label>
              <input type="number" step="0.01" value={editModal.default_sales_price} onChange={e => setEditModal({ ...editModal, default_sales_price: e.target.value })} /></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}><label>说明</label>
            <textarea rows={3} value={editModal.note} onChange={e => setEditModal({ ...editModal, note: e.target.value })} /></div>
          <div className="foot">
            <button className="btn" onClick={() => setEditModal(null)}>取消</button>
            <button className="btn primary" onClick={saveEdit}>保存</button>
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
                  {priceModal.items.length === 0 && <tr><td colSpan={3} className="empty">暂无下游代理</td></tr>}
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
    </Modal>
  )
}
