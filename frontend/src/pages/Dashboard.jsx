import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast, Modal } from '../components/ui'
import Chart from '../components/Chart'

const MEDALS = ['🥇', '🥈', '🥉']

function fmt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function Dashboard() {
  const { toast, showError } = useToast()
  const [s, setS] = useState(null)
  const [rank, setRank] = useState([])
  const [trend, setTrend] = useState([])
  const [range, setRange] = useState('7')
  const [startD, setStartD] = useState('')
  const [endD, setEndD] = useState('')
  const [dailyBills, setDailyBills] = useState([])
  const [editWalletDate, setEditWalletDate] = useState(null)
  const [agentTrend, setAgentTrend] = useState({ dates: [], series: [] })
  const [agents, setAgents] = useState([])
  const [agentIds, setAgentIds] = useState([])
  const [agentSelectModal, setAgentSelectModal] = useState(false)
  const [agentMetric, setAgentMetric] = useState('out_qty')
  const [agentRange, setAgentRange] = useState('7')
  const [agentStart, setAgentStart] = useState('')
  const [agentEnd, setAgentEnd] = useState('')

  function loadCharts(start = '', end = '') {
    api.get(`/api/dashboard/trend?start=${start}&end=${end}`).then(r => setTrend(r.data)).catch(() => {})
  }
  function loadSummary() {
    api.get('/api/dashboard/summary').then(r => setS(r.data)).catch(e => showError(e.message))
  }
  function loadDailyBills() {
    api.get('/api/dashboard/daily-bills').then(r => setDailyBills(r.data || [])).catch(() => {})
  }
  function loadAgentTrend(start = '', end = '', ids = agentIds) {
    const qs = ids.length ? `&customer_ids=${ids.join(',')}` : ''
    api.get(`/api/dashboard/agent-trend?start=${start}&end=${end}${qs}`).then(r => setAgentTrend(r.data)).catch(() => {})
  }
  useEffect(() => {
    loadSummary()
    api.get('/api/dashboard/rank').then(r => setRank(r.data)).catch(() => {})
    loadCharts()
    loadDailyBills()
    loadAgentTrend()
    api.get('/api/customers?per_page=1000').then(r => {
      const rows = r.data?.rows || []
      const downs = rows.filter(c => c.ctype === 'downstream').sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0))
      const ups = rows.filter(c => c.ctype === 'upstream').sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0))
      setAgents([...downs, ...ups])
    }).catch(() => {})
  }, [])

  async function saveWallet(row, val) {
    const v = val === '' ? null : val
    try {
      await api.put('/api/dashboard/daily-bills/wallet', { date: row.date, wallet_balance: v })
      setDailyBills(list => list.map(r => r.date === row.date ? { ...r, wallet_balance: v === null ? null : Number(v) } : r))
      toast('已保存')
      loadSummary()
      reloadTrend()
    } catch (e) { showError(e.message) }
  }

  function pick7() { setRange('7'); loadCharts() }
  function pick30() {
    setRange('30')
    const e = new Date(), st = new Date()
    st.setDate(st.getDate() - 29)
    loadCharts(fmt(st), fmt(e))
  }
  function pickCustom() { setRange('custom') }
  function applyCustom() { loadCharts(startD, endD) }

  function reloadTrend() {
    if (range === '30') {
      const e = new Date(), st = new Date()
      st.setDate(st.getDate() - 29)
      loadCharts(fmt(st), fmt(e))
    } else if (range === 'custom') {
      loadCharts(startD, endD)
    } else {
      loadCharts()
    }
  }

  function pickAgent7() { setAgentRange('7'); loadAgentTrend() }
  function pickAgent30() {
    setAgentRange('30')
    const e = new Date(), st = new Date()
    st.setDate(st.getDate() - 29)
    loadAgentTrend(fmt(st), fmt(e))
  }
  function pickAgentCustom() { setAgentRange('custom') }
  function applyAgentCustom() { loadAgentTrend(agentStart, agentEnd) }
  function applyAgentSelect() { setAgentSelectModal(false); loadAgentTrend() }

  const AGENT_METRICS = [
    { key: 'active', label: '在执订单', unit: '单' },
    { key: 'out_qty', label: '供货量', unit: '条' },
    { key: 'sales', label: '销售额', unit: '元' },
    { key: 'profit', label: '利润', unit: '元' },
    { key: 'balance', label: '余额', unit: '元' },
  ]
  const hasDownstream = agentTrend.series.some(s => s.ctype === 'downstream')
  const visibleMetrics = AGENT_METRICS.filter(m => m.key !== 'profit' || hasDownstream)
  const curMetric = visibleMetrics.find(m => m.key === agentMetric) || visibleMetrics[0]
  const agentTrendOption = {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0 },
    grid: { left: 60, right: 30, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: agentTrend.dates.map(d => d.slice(5)) },
    yAxis: { type: 'value', name: curMetric.unit, minInterval: 1 },
    series: agentTrend.series.map(s => ({
      name: `${s.code} ${s.name}`,
      type: 'line',
      smooth: curMetric.key !== 'active',
      step: curMetric.key === 'active' ? 'end' : undefined,
      data: s[curMetric.key] || [],
    })),
  }

  const trendOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['日活进货量', '日活交付量', '利润', '总余额'] },
    grid: { left: 60, right: 70, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: trend.map(r => r.date) },
    yAxis: [{ type: 'value', name: '条' }, { type: 'value', name: '元', splitLine: { show: false } }],
    series: [
      { name: '日活进货量', type: 'bar', data: trend.map(r => r.in_qty), itemStyle: { color: '#e2e8f0' } },
      { name: '日活交付量', type: 'bar', data: trend.map(r => r.out_qty), itemStyle: { color: '#93c5fd' } },
      { name: '利润', type: 'line', yAxisIndex: 1, data: trend.map(r => r.profit), itemStyle: { color: '#dc2626' } },
      { name: '总余额', type: 'line', yAxisIndex: 1, data: trend.map(r => r.total_balance), itemStyle: { color: '#000000' } },
    ],
  }

  const kpis = [
    { icon: '📝', label: '在执订单量', value: s?.order_count ?? '-', bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', c: 'var(--blue)' },
    { icon: '📊', label: '日活总量', value: s?.daily_total ?? '-', bg: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', c: 'var(--green)' },
    { icon: '💰', label: '总余额（元）', value: s?.total_balance != null ? s.total_balance : '-', bg: 'linear-gradient(135deg,#fefce8,#fef9c3)', c: 'var(--amber)' },
    { icon: '💹', label: '本月利润（元）', value: s?.month_profit != null ? s.month_profit : '-', bg: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', c: 'var(--violet)' },
  ]

  return (
    <div className="page-scroll">
      <div className="cards">
        {kpis.map((k, i) => (
          <div className="card kpi" key={i}>
            <div className="kpi-icon" style={{ background: k.bg, color: k.c }}>{k.icon}</div>
            <div className="kpi-body">
              <div className="t">{k.label}</div>
              <div className="v" style={{ color: k.c }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row-trend">
        <div className="panel trend-panel">
          <h3 style={{ justifyContent: 'space-between' }}>
            <span>入出与利润趋势</span>
            <span>
              <button className={`btn small ${range === '7' ? 'primary' : ''}`} onClick={pick7}>7天</button>{' '}
              <button className={`btn small ${range === '30' ? 'primary' : ''}`} onClick={pick30}>30天</button>{' '}
              <button className={`btn small ${range === 'custom' ? 'primary' : ''}`} onClick={pickCustom}>自定义</button>
              {range === 'custom' && (
                <>
                  <input type="date" value={startD} onChange={e => setStartD(e.target.value)} />
                  <span>~</span>
                  <input type="date" value={endD} onChange={e => setEndD(e.target.value)} />
                  <button className="btn primary small" onClick={applyCustom}>统计</button>
                </>
              )}
            </span>
          </h3>
          <Chart option={trendOption} height={300} />
        </div>
        <div className="panel daily-bill-panel">
          <div className="notif-head">
            <span className="notif-title">📒 每日账单</span>
          </div>
          {dailyBills.length === 0 ? <div className="empty">暂无数据</div> : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead><tr><th style={{ width: 52 }}>日期</th><th className="num">利润（元）</th><th className="num">账单余额（元）</th><th className="num">钱包余额（U）</th></tr></thead>
                <tbody>
                  {dailyBills.map(r => (
                    <tr key={r.date}>
                      <td style={{ width: 52, whiteSpace: 'nowrap' }}>{r.date.slice(5)}</td>
                      <td className="num" style={{ color: r.profit < 0 ? 'var(--red)' : 'inherit' }}>{r.profit != null ? r.profit.toLocaleString() : '—'}</td>
                      <td className="num">{r.bill_balance != null ? r.bill_balance.toLocaleString() : '—'}</td>
                      <td className="num">
                        {editWalletDate === r.date ? (
                          <input
                            type="number" step="0.0001"
                            autoFocus
                            defaultValue={r.wallet_balance ?? ''}
                            className="wallet-input"
                            onBlur={e => {
                              if (e.target.value !== String(r.wallet_balance ?? '')) saveWallet(r, e.target.value)
                              setEditWalletDate(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.target.blur()
                              if (e.key === 'Escape') setEditWalletDate(null)
                            }}
                          />
                        ) : (
                          <span
                            className="wallet-display"
                            title="双击编辑钱包余额"
                            onDoubleClick={() => setEditWalletDate(r.date)}
                          >
                            {r.wallet_balance != null ? r.wallet_balance : 0}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="row-full">
        <div className="panel">
          <h3 style={{ justifyContent: 'space-between' }}>
            <span>
              客户统计
              <button className="btn small" style={{ marginLeft: 10 }} onClick={() => setAgentSelectModal(true)}>选择客户（{agentIds.length || agents.length}）</button>
            </span>
            <span>
              {visibleMetrics.map(m => (
                <button key={m.key} className={`btn small ${agentMetric === m.key ? 'primary' : ''}`} onClick={() => setAgentMetric(m.key)}>{m.label}</button>
              ))}{' '}
              <button className={`btn small ${agentRange === '7' ? 'primary' : ''}`} onClick={pickAgent7}>7天</button>{' '}
              <button className={`btn small ${agentRange === '30' ? 'primary' : ''}`} onClick={pickAgent30}>30天</button>{' '}
              <button className={`btn small ${agentRange === 'custom' ? 'primary' : ''}`} onClick={pickAgentCustom}>自定义</button>
              {agentRange === 'custom' && (
                <>
                  <input type="date" value={agentStart} onChange={e => setAgentStart(e.target.value)} />
                  <span>~</span>
                  <input type="date" value={agentEnd} onChange={e => setAgentEnd(e.target.value)} />
                  <button className="btn primary small" onClick={applyAgentCustom}>统计</button>
                </>
              )}
            </span>
          </h3>
          <Chart option={agentTrendOption} height={300} />
        </div>

        <div className="panel">
          <h3>代理排名</h3>
          {rank.length === 0 ? <div className="empty">暂无数据</div> : (
            <div style={{ height: 300, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>排名</th><th>客户</th><th className="num">业务量</th><th className="num">销售额（元）</th><th className="num">利润（元）</th><th className="num">余额（元）</th></tr></thead>
                <tbody>
                  {rank.map((r, i) => (
                    <tr key={i}>
                      <td>{MEDALS[i] || i + 1}</td>
                      <td>{r.code} {r.name}</td>
                      <td className="num">{r.qty}</td>
                      <td className="num">¥{r.sales.toLocaleString()}</td>
                      <td className="num" style={{ color: r.profit < 0 ? 'var(--red)' : 'inherit' }}>¥{r.profit.toLocaleString()}</td>
                      <td className="num" style={{ color: r.balance < 0 ? 'var(--red)' : 'var(--green)' }}>¥{r.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {agentSelectModal && (() => {
        const allChecked = agents.length > 0 && agents.every(c => agentIds.includes(c.id))
        function toggleAll() { setAgentIds(allChecked ? [] : agents.map(c => c.id)) }
        return (
          <Modal title="客户统计 · 选择客户" onClose={() => setAgentSelectModal(false)} wide>
            <div className="note">选择客户（含上游/下游），图表按客户展示所选客户的趋势线；不选则展示全部客户。</div>
            <div className="field" style={{ marginBottom: 14 }}><label>客户（点击名称选中 / 取消）</label>
              <div className="agent-list">
                <button type="button" className="agent-chip agent-chip-all" onClick={toggleAll}>{allChecked ? '全不选' : '全选'}</button>
                {agents.map(c => {
                  const on = agentIds.includes(c.id)
                  return (
                    <button type="button" key={c.id} className={`agent-chip ${on ? 'on' : ''}`} onClick={() => {
                      setAgentIds(ids => ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])
                    }}>{c.code} {c.name}</button>
                  )
                })}
                {agents.length === 0 && <div className="empty">暂无客户</div>}
              </div>
            </div>
            <div className="foot">
              <button className="btn" onClick={() => setAgentSelectModal(false)}>取消</button>
              <button className="btn primary" onClick={applyAgentSelect}>确定</button>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
