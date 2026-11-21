import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast, useConfirm } from '../components/ui'
import { useButtonPerm } from '../buttonPerms'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function BillDateCalendar({ value, onChange }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const pad = n => String(n).padStart(2, '0')
  const selected = new Set((value || '').split(',').map(s => s.trim()).filter(Boolean))
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function toggle(d) {
    const ds = `${year}-${pad(month + 1)}-${pad(d)}`
    const next = new Set(selected)
    if (next.has(ds)) next.delete(ds)
    else next.add(ds)
    onChange([...next].sort().join(','))
  }
  function shift(dm) {
    let m = month + dm
    let y = year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setMonth(m); setYear(y)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(<td key={`e${i}`}></td>)
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(year, month, d).getDay()
    const isFixedOff = wd === 5 || wd === 6
    const ds = `${year}-${pad(month + 1)}-${pad(d)}`
    const isManualOff = selected.has(ds)
    cells.push(
      <td key={d}>
        <div className={`bill-day${isFixedOff ? ' fixed-off' : ''}${isManualOff ? ' manual-off' : ''}`}
             onClick={() => { if (!isFixedOff) toggle(d) }}>
          {d}
        </div>
      </td>
    )
  }
  const rows = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  return (
    <div className="bill-calendar">
      <div className="bc-head">
        <button className="btn small" type="button" onClick={() => shift(-1)}>‹ 上月</button>
        <span style={{ fontWeight: 600 }}>{year}年{month + 1}月</span>
        <button className="btn small" type="button" onClick={() => shift(1)}>下月 ›</button>
      </div>
      <table className="bc-table">
        <thead><tr>{WEEKDAYS.map(w => <th key={w}>{w}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row}</tr>)}</tbody>
      </table>
      <div className="bc-legend">
        <span><i className="dot fixed-off" /> 固定非提单日（周五、六）</span>
        <span><i className="dot manual-off" /> 手动非提单日（点击切换）</span>
      </div>
    </div>
  )
}

export default function ConfigCenter() {
  const { toast, showError } = useToast()
  const { can } = useButtonPerm()
  const [confirm, confirmEl] = useConfirm()
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [nonBillDates, setNonBillDates] = useState('')
  const [savingBill, setSavingBill] = useState(false)
  const [resetDate, setResetDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [resetAll, setResetAll] = useState(false)

  function load() {
    api.get('/api/config-center').then(r => {
      const data = r.data || []
      setItems(data)
      const nb = data.find(it => it.key === 'non_bill_dates')
      setNonBillDates(nb ? (nb.value || '') : '')
    }).catch(e => showError(e.message))
  }
  useEffect(() => { load() }, [])

  function setValue(key, value) {
    setItems(items.map(it => it.key === key ? { ...it, value } : it))
  }

  async function save(item) {
    setSaving(true)
    try {
      await api.put('/api/config-center', { key: item.key, value: item.value })
      toast('已保存')
    } catch (e) { showError(e.message) } finally { setSaving(false) }
  }

  async function saveBillDates() {
    setSavingBill(true)
    try {
      await api.put('/api/config-center', { key: 'non_bill_dates', value: nonBillDates })
      toast('已保存提单日设定')
    } catch (e) { showError(e.message) } finally { setSavingBill(false) }
  }

  async function doResetAlert() {
    if (!resetDate) { showError('请选择清除日期'); return }
    if (!(await confirm(`确认清除「${resetDate}」之前的${resetAll ? '所有' : '停单提醒'}预警数据，并重新扫描？此操作不可恢复。`))) return
    try {
      const r = await api.post('/api/alerts/reset', { date: resetDate, scope: resetAll ? 'all' : 'stop' })
      toast(r.msg || '重置完成')
    } catch (e) { showError(e.message) }
  }

  return (
    <div className="page">
      {confirmEl}
      <div style={{ display: 'flex', gap: 14, flex: '2 1 0', minHeight: 0 }}>
        <div className="panel" style={{ flex: 'none', marginBottom: 0, width: 460, overflow: 'auto' }}>
          <h3>提单日设定</h3>
          <BillDateCalendar value={nonBillDates} onChange={setNonBillDates} />
          <div style={{ marginTop: 10 }}>
            {can('config:save') && <button className="btn primary" disabled={savingBill} onClick={saveBillDates}>保存提单日设定</button>}
          </div>
          <div className="note" style={{ marginTop: 10 }}>默认周五、周六为非提单日；点击日历中的日期可额外设为非提单日（如长假期），再次点击取消。</div>
        </div>

        <div className="panel" style={{ flex: '1 1 0', minWidth: 0, marginBottom: 0 }}>
          <div className="table-scroll">
            <table>
              <thead><tr><th>配置项</th><th>值</th><th className="ops">操作</th></tr></thead>
              <tbody>
                {items.filter(it => it.key !== 'non_bill_dates').map(it => (
                  <tr key={it.key}>
                    <td>{it.label}</td>
                    <td>
                      {it.type === 'time'
                        ? <input type="time" value={it.value} onChange={e => setValue(it.key, e.target.value)} />
                        : it.type === 'number'
                          ? <input type="number" value={it.value} onChange={e => setValue(it.key, e.target.value)} />
                          : <input value={it.value} onChange={e => setValue(it.key, e.target.value)} />}
                    </td>
                    <td className="ops">{can('config:save') && <button className="btn small primary" disabled={saving} onClick={() => save(it)}>保存</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ flex: 'none' }}>
        <h3>预警数据重置</h3>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <div className="field" style={{ flex: 'none' }}><label>清除日期（此日期之前的预警）</label>
            <input type="date" value={resetDate} onChange={e => setResetDate(e.target.value)} /></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--sub)' }}>
            <input type="checkbox" checked={resetAll} onChange={e => setResetAll(e.target.checked)} />
            同时清除账单预警
          </label>
          {can('config:reset_alert') && <button className="btn danger" onClick={doResetAlert}>重置预警</button>}
        </div>
        <div className="note" style={{ marginTop: 10 }}>将按指定日期清除预警数据（默认仅停单提醒），然后立即重新扫描生成新预警。</div>
      </div>
    </div>
  )
}
