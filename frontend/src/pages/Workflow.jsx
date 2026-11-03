import React, { useEffect, useRef, useState } from 'react'
import { api, getToken, uploadFile, downloadFile } from '../api'
import { Modal, useToast, useConfirm, Loading } from '../components/ui'

const STEP_KEYS = ['receipt', 'daily', 'wash', 'washimport', 'dist', 'bill']
const STEPS = {
  receipt: { label: '导入回执', desc: '上传回执文件，按回执来源+任务名匹配订单更新工单号' },
  daily: { label: '导入日活', desc: '上传日活数据文件（zip/excel/csv）' },
  wash: { label: '导出洗名', desc: '按数据日期导出洗名文件' },
  washimport: { label: '导入洗名', desc: '导入洗名文件（手机号→姓名）' },
  dist: { label: '分发数据', desc: '选择代理，按小组生成数据文件并记账' },
  bill: { label: '生成账单', desc: '选择客户（上游/下游），生成账单并下载' },
}

export default function Workflow() {
  const { toast, showError } = useToast()
  const [confirm, confirmEl] = useConfirm()
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState({})
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [busyProgress, setBusyProgress] = useState(null)

  const [bizDate, setBizDate] = useState('')
  const [upstreams, setUpstreams] = useState([])
  const [downstreams, setDownstreams] = useState([])
  const [receiptParty, setReceiptParty] = useState('牛')
  const [receiptFile, setReceiptFile] = useState(null)
  const [dailyFiles, setDailyFiles] = useState([])
  const [washImportFile, setWashImportFile] = useState(null)

  const [receiptResult, setReceiptResult] = useState(null)
  const [warn, setWarn] = useState(null)
  const [pendingDaily, setPendingDaily] = useState(null)
  const [distModal, setDistModal] = useState(false)
  const [distCustomerIds, setDistCustomerIds] = useState([])
  const [billModal, setBillModal] = useState(false)
  const [billCustomerIds, setBillCustomerIds] = useState([])
  const [distTaskId, setDistTaskId] = useState(null)
  const distCancelRef = useRef(false)

  useEffect(() => {
    api.get('/api/customers?per_page=1000').then(r => {
      const rows = r.data?.rows || []
      setUpstreams(rows.filter(c => c.ctype === 'upstream'))
      setDownstreams(rows.filter(c => c.ctype === 'downstream'))
      setDistCustomerIds(rows.filter(c => c.ctype === 'downstream').map(c => c.id))
      setBillCustomerIds(rows.map(c => c.id))
    }).catch(() => {})
  }, [])

  function markDone(key) {
    setDone(x => ({ ...x, [key]: true }))
    const idx = STEP_KEYS.indexOf(key)
    if (idx >= 0 && idx < STEP_KEYS.length - 1) setTimeout(() => setCurrent(idx + 1), 2100)
  }

  async function runReceipt() {
    if (!receiptFile) { showError('请选择回执文件'); return }
    setBusy(true); setBusyMsg('正在上传回执文件…'); setBusyProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', receiptFile); fd.append('party', receiptParty)
      const data = await uploadFile('/api/orders/import-receipt', fd, p => setBusyProgress(p))
      setBusyMsg('正在处理回执数据，请稍候…'); setBusyProgress(100)
      setReceiptResult(data.data)
      markDone('receipt')
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function doUploadDaily(files, confirmFlag) {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    fd.append('biz_date', bizDate)
    if (confirmFlag) fd.append('confirm', 'true')
    setBusy(true); setBusyMsg('正在上传文件…'); setBusyProgress(0)
    try {
      const data = await uploadFile('/api/daily-data/import', fd, x => setBusyProgress(x))
      if (data.data && data.data.needs_confirm) {
        setBusy(false); setBusyProgress(null)
        const items = [
          ...(data.data.unmatched_items || []),
          ...(data.data.stopped_items || []),
        ]
        setWarn({ title: '以下工单数据异常，是否继续导入？', items, confirm: true })
        return
      }
      setBusyMsg('正在处理数据，请稍候…'); setBusyProgress(100)
      toast(data.msg || '导入完成'); markDone('daily')
      const inactiveItems = (data.data && data.data.inactive_items) || []
      setBusy(false); setBusyProgress(null)
      if (inactiveItems.length) {
        setWarn({ title: '以下在执任务未匹配到数据（未出）', items: inactiveItems.map(x => ({ ...x, kind: '未出' })), confirm: false })
      }
    } catch (e) { setBusy(false); setBusyProgress(null); showError(e.message) }
  }

  async function runDaily() {
    if (!dailyFiles.length) { showError('请选择日活文件'); return }
    setPendingDaily(dailyFiles)
    doUploadDaily(dailyFiles, false)
  }

  async function doDailyConfirm() {
    const files = pendingDaily
    setWarn(null)
    if (files) doUploadDaily(files, true)
  }

  async function exportWarnItems() {
    try {
      const res = await fetch('/api/daily-data/export-warn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({ items: warn.items }),
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

  async function runWash() {
    setBusy(true); setBusyMsg('正在导出洗名…')
    try {
      await downloadFile(`/api/daily-data/wash-export?date=${encodeURIComponent(bizDate)}`)
      toast('洗名导出完成'); markDone('wash')
    } catch (e) { showError(e.message) } finally { setBusy(false) }
  }

  async function runWashImport() {
    if (!washImportFile) { showError('请选择洗名文件'); return }
    setBusy(true); setBusyMsg('正在导入洗名…'); setBusyProgress(0)
    try {
      const fd = new FormData(); fd.append('file', washImportFile)
      const r = await uploadFile('/api/daily-data/import-wash', fd, p => setBusyProgress(p))
      toast(r.msg || '洗名导入完成'); markDone('washimport')
    } catch (e) { showError(e.message) } finally { setBusy(false); setBusyProgress(null) }
  }

  async function runDist() {
    setBusy(true); setBusyMsg('正在分发数据…'); setBusyProgress(0)
    distCancelRef.current = false
    setDistTaskId(null)
    try {
      const body = { date: bizDate }
      if (distCustomerIds.length) body.customer_ids = distCustomerIds
      let r = await api.post('/api/daily-data/distribute', body)
      if (r.data.needs_confirm) {
        const issues = r.data.issues || []
        const detail = issues.map(i => `「${i.group_name}」${i.unset_count} 个订单未设定出数模版（将按 ${i.tpl_code} 出数）`).join('、')
        if (!(await confirm(`以下小组存在未设定出数模版的订单：${detail}。\n\n是否继续分数据？`))) return
        r = await api.post('/api/daily-data/distribute', { ...body, confirm: true })
      }
      const taskId = r.data.task_id
      const total = r.data.total
      setDistTaskId(taskId)
      while (true) {
        if (distCancelRef.current) {
          await api.post(`/api/daily-data/distribute/cancel/${taskId}`).catch(() => {})
          toast('已取消分发'); break
        }
        const p = await api.get(`/api/daily-data/distribute/progress/${taskId}`)
        const { done: d, status, error } = p.data
        setBusyProgress(total > 0 ? Math.round((d / total) * 100) : 100)
        if (status === 'done') {
          setBusyMsg('分数据完成，正在下载…')
          await downloadFile(`/api/daily-data/distribute/download/${taskId}`)
          toast('分发完成'); markDone('dist'); break
        } else if (status === 'error') {
          throw new Error(error || '分发失败')
        } else if (status === 'cancelled') {
          toast('已取消分发'); break
        }
        await new Promise(res => setTimeout(res, 500))
      }
    } catch (e) { showError(e.message || '分发失败') } finally {
      setBusy(false); setBusyProgress(null); setDistTaskId(null)
    }
  }

  async function cancelDistribute() {
    distCancelRef.current = true
  }

  async function runBill() {
    setBusy(true); setBusyMsg('正在生成账单…')
    try {
      const cids = billCustomerIds.length ? `&customer_ids=${billCustomerIds.join(',')}` : ''
      await downloadFile(`/api/bills/generate-zip?date=${encodeURIComponent(bizDate)}${cids}`)
      toast('账单已生成'); markDone('bill')
    } catch (e) { showError(e.message || '生成账单失败') } finally { setBusy(false) }
  }

  const curKey = STEP_KEYS[current]

  function stepBody(key) {
    if (key === 'receipt') return (
      <div className="wf-action">
        <div className="field wf-field"><label>回执来源</label>
          <select value={receiptParty} onChange={e => setReceiptParty(e.target.value)}>
            {upstreams.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select></div>
        <div className="field wf-field"><label>回执文件</label>
          <div className="wf-file">
            <input type="file" id="wf-receipt-file" className="wf-file-input" accept=".xlsx,.xls" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
            <label htmlFor="wf-receipt-file" className="btn wf-file-btn">选择文件</label>
            <span className="wf-file-name">{receiptFile ? receiptFile.name : '未选择'}</span>
          </div>
        </div>
        <button className="btn primary wf-run" onClick={runReceipt}>执行</button>
      </div>
    )
    if (key === 'daily') return (
      <div className="wf-action">
        <div className="field wf-field"><label>日活文件</label>
          <div className="wf-file">
            <input type="file" id="wf-daily-file" className="wf-file-input" multiple accept=".zip,.xlsx,.xls,.csv" onChange={e => setDailyFiles(Array.from(e.target.files || []))} />
            <label htmlFor="wf-daily-file" className="btn wf-file-btn">选择文件</label>
            <span className="wf-file-name">{dailyFiles.length ? dailyFiles.map(f => f.name).join('、') : '未选择'}</span>
          </div>
        </div>
        <button className="btn primary wf-run" onClick={runDaily}>执行</button>
      </div>
    )
    if (key === 'wash') return (
      <div className="wf-action"><button className="btn primary wf-run" onClick={runWash}>执行（导出洗名）</button></div>
    )
    if (key === 'washimport') return (
      <div className="wf-action">
        <div className="field wf-field"><label>洗名文件</label>
          <div className="wf-file">
            <input type="file" id="wf-wash-file" className="wf-file-input" accept=".xlsx,.xls,.csv" onChange={e => setWashImportFile(e.target.files?.[0] || null)} />
            <label htmlFor="wf-wash-file" className="btn wf-file-btn">选择文件</label>
            <span className="wf-file-name">{washImportFile ? washImportFile.name : '未选择'}</span>
          </div>
        </div>
        <button className="btn primary wf-run" onClick={runWashImport}>执行</button>
      </div>
    )
    if (key === 'dist') return (
      <div className="wf-action">
        <div className="field wf-field"><label>代理</label>
          <button className="btn wf-btn-ghost" onClick={() => { if (!distCustomerIds.length) setDistCustomerIds(downstreams.map(c => c.id)); setDistModal(true) }}>选择代理（{distCustomerIds.length || 0}）</button>
        </div>
        <button className="btn primary wf-run" onClick={runDist}>执行</button>
      </div>
    )
    if (key === 'bill') return (
      <div className="wf-action">
        <div className="field wf-field"><label>客户</label>
          <button className="btn wf-btn-ghost" onClick={() => setBillModal(true)}>选择客户（{billCustomerIds.length || 0}）</button>
        </div>
        <button className="btn primary wf-run" onClick={runBill}>执行</button>
      </div>
    )
    return null
  }

  return (
    <div className="page-scroll wf-scroll">
      {confirmEl}
      {busy && <Loading text={busyMsg} progress={busyProgress} />}
      {distTaskId && <button className="wf-cancel-dist" onClick={cancelDistribute}>取消分发</button>}
      <div className="wf-page">
        <div className="wf-datebar">
          <label>数据日期</label>
          <input type="date" value={bizDate} onChange={e => setBizDate(e.target.value)} />
          <span>全流程共用此数据日期</span>
        </div>
        <div className="wf-card">
          <div className="wf-stepper">
            {STEP_KEYS.map((key, i) => {
              const st = STEPS[key]
              const isDone = done[key]
              const isCur = i === current
              return (
                <div className={`wf-step ${isCur ? 'current' : ''} ${isDone ? 'done' : ''}`} key={key} onClick={() => setCurrent(i)}>
                  <span className="wf-node">{isDone ? '✓' : i + 1}</span>
                  <span className="wf-step-label">{st.label}</span>
                </div>
              )
            })}
          </div>
          <div className="wf-card-head">
            <div className="wf-title">{STEPS[curKey].label}</div>
            <div className="wf-desc">{STEPS[curKey].desc}</div>
          </div>
          <div className="wf-card-body">{stepBody(curKey)}</div>
          <div className="wf-card-foot">
            <button className="btn wf-btn-ghost" disabled={current === 0} onClick={() => setCurrent(current - 1)}>上一步</button>
            <button className="btn wf-btn-ghost" disabled={current === STEP_KEYS.length - 1} onClick={() => setCurrent(current + 1)}>下一步</button>
          </div>
        </div>
      </div>

      {receiptResult && (
        <Modal title="回执导入结果" onClose={() => setReceiptResult(null)} wide>
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
          <div className="foot"><button className="btn primary" onClick={() => setReceiptResult(null)}>关闭</button></div>
        </Modal>
      )}

      {warn && (
        <Modal title={warn.title} onClose={() => setWarn(null)} wide>
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th style={{ width: 56 }}>序号</th><th>工单号</th><th>任务名</th><th className="num">数量</th><th>原因</th></tr></thead>
              <tbody>
                {warn.items.map((x, i) => (
                  <tr key={i}><td className="num">{i + 1}</td><td>{x.task_id || '—'}</td><td>{x.task_name || '—'}</td><td className="num">{x.qty ?? '—'}</td><td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{x.reason || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="foot">
            <button className="btn" onClick={exportWarnItems}>导出异常</button>
            {warn.confirm ? (
              <>
                <button className="btn" onClick={() => setWarn(null)}>取消</button>
                <button className="btn primary" onClick={doDailyConfirm}>继续导入</button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setWarn(null)}>关闭</button>
            )}
          </div>
        </Modal>
      )}

      {distModal && (() => {
        const allChecked = downstreams.length > 0 && downstreams.every(c => distCustomerIds.includes(c.id))
        function toggleAll() { setDistCustomerIds(allChecked ? [] : downstreams.map(c => c.id)) }
        return (
          <Modal title="分发数据 · 选择代理" onClose={() => setDistModal(false)} wide>
            <div className="note">选择代理，将该日期下的日活数据按订单的小组分组生成文件打包下载；不选则分发全部下游代理。</div>
            <div className="field" style={{ marginBottom: 14 }}><label>代理（点击名称选中 / 取消）</label>
              <div className="agent-list">
                <button type="button" className="agent-chip agent-chip-all" onClick={toggleAll}>{allChecked ? '全不选' : '全选'}</button>
                {downstreams.map(c => {
                  const on = distCustomerIds.includes(c.id)
                  return (
                    <button type="button" key={c.id} className={`agent-chip ${on ? 'on' : ''}`} onClick={() => {
                      setDistCustomerIds(ids => ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])
                    }}>{c.code} {c.name}</button>
                  )
                })}
                {downstreams.length === 0 && <div className="empty">暂无下游客户</div>}
              </div>
            </div>
            <div className="foot">
              <button className="btn" onClick={() => setDistModal(false)}>取消</button>
              <button className="btn primary" onClick={() => { setDistModal(false); runDist() }}>分发数据</button>
            </div>
          </Modal>
        )
      })()}

      {billModal && (() => {
        const allCustomers = [...upstreams, ...downstreams]
        const allChecked = allCustomers.length > 0 && allCustomers.every(c => billCustomerIds.includes(c.id))
        function toggleAll() { setBillCustomerIds(allChecked ? [] : allCustomers.map(c => c.id)) }
        return (
          <Modal title="生成账单 · 选择客户" onClose={() => setBillModal(false)} wide>
            <div className="note">选择客户（含上游/下游），生成账单并自动下载；不选则生成全部客户账单。</div>
            <div className="field" style={{ marginBottom: 14 }}><label>客户（点击名称选中 / 取消）</label>
              <div className="agent-list">
                <button type="button" className="agent-chip agent-chip-all" onClick={toggleAll}>{allChecked ? '全不选' : '全选'}</button>
                {allCustomers.map(c => {
                  const on = billCustomerIds.includes(c.id)
                  return (
                    <button type="button" key={c.id} className={`agent-chip ${on ? 'on' : ''}`} onClick={() => {
                      setBillCustomerIds(ids => ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])
                    }}>{c.code} {c.name}</button>
                  )
                })}
                {allCustomers.length === 0 && <div className="empty">暂无客户</div>}
              </div>
            </div>
            <div className="foot">
              <button className="btn" onClick={() => setBillModal(false)}>取消</button>
              <button className="btn primary" onClick={() => { setBillModal(false); runBill() }}>生成账单</button>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
