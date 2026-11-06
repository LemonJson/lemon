import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast, useConfirm } from '../components/ui'

const TYPE_ICON = {
  order: '📝', bill: '💰', customer: '👤', product: '📦', product_sale: '🛒',
  channel: '🔗', operator: '📡', platform: '🖥️', category: '🗂️',
}

const TABS = [
  { key: 'order', label: '订单', types: ['order'] },
  { key: 'bill', label: '账单', types: ['bill'] },
  { key: 'customer', label: '客户', types: ['customer'] },
  { key: 'product', label: '产品', types: ['product', 'product_sale'] },
  { key: 'master', label: '主数据', types: ['channel', 'operator', 'platform', 'category'] },
]

const PAGE_SIZE = 10

export default function Trash() {
  const { toast, showError } = useToast()
  const [confirm, confirmEl] = useConfirm()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('order')
  const [expanded, setExpanded] = useState({})

  async function load() {
    setLoading(true)
    try {
      const r = await api.get('/api/trash')
      setGroups(r.data || [])
    } catch (e) { showError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function restore(type, id) {
    try {
      await api.post('/api/trash/restore', { type, id })
      toast('已恢复')
      load()
    } catch (e) { showError(e.message) }
  }

  async function purge(type, id, label) {
    if (!(await confirm(`确定彻底删除「${label}」？此操作不可恢复。`, true))) return
    try {
      await api.del(`/api/trash/${type}/${id}`)
      toast('已彻底删除')
      load()
    } catch (e) { showError(e.message) }
  }

  const activeTypes = (TABS.find(t => t.key === activeTab) || TABS[0]).types
  const tabGroups = groups.filter(g => activeTypes.includes(g.type))
  function tabCount(key) {
    const types = (TABS.find(t => t.key === key) || TABS[0]).types
    return groups.filter(g => types.includes(g.type)).reduce((s, g) => s + g.count, 0)
  }
  function visibleItems(g) {
    return expanded[g.type] ? g.items : g.items.slice(0, PAGE_SIZE)
  }

  return (
    <div className="page">
      {confirmEl}
      <div className="toolbar">
        <span className="note" style={{ color: 'var(--sub)' }}>垃圾箱收纳被删除的数据，可恢复或彻底删除。</span>
        <span className="spacer" />
        <button className="btn" onClick={load}>刷新</button>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <div key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}（{tabCount(t.key)}）
          </div>
        ))}
      </div>

      {loading && <div className="empty">加载中…</div>}
      {!loading && groups.length === 0 && <div className="empty">垃圾箱为空</div>}
      {!loading && groups.length > 0 && tabGroups.length === 0 && <div className="empty">该分类下暂无数据</div>}

      {tabGroups.map(g => {
        const shown = visibleItems(g)
        const hasMore = g.items.length > PAGE_SIZE
        return (
          <div className="panel" key={g.type}>
            <h3>{TYPE_ICON[g.type] || '🗑️'} {g.type_label}（{g.count}）</h3>
            <div className="table-scroll">
              <table>
                <thead><tr><th>名称</th><th>删除时间</th><th className="ops">操作</th></tr></thead>
                <tbody>
                  {shown.map(it => (
                    <tr key={it.id}>
                      <td>{it.label}</td>
                      <td style={{ color: 'var(--sub)' }}>{it.deleted_at}</td>
                      <td className="ops">
                        <button className="btn small" onClick={() => restore(g.type, it.id)}>恢复</button>{' '}
                        <button className="btn small danger" onClick={() => purge(g.type, it.id, it.label)}>彻底删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="pager">
                <button className="btn small" onClick={() => setExpanded(e => ({ ...e, [g.type]: !e[g.type] }))}>
                  {expanded[g.type] ? '收起' : `查看更多（共 ${g.count} 条）`}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
