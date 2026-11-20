import React from 'react'
import { ClearableInput } from './ui'

const ENUM_COLS = {
  type: ['停单提醒', '账单预警'],
  level: ['高', '中', '低'],
  gender: ['男', '女'],
  deposit_status: ['正常缴存', '封存'],
  wash_status: ['未加名', '已加名', '已拆分'],
  ctype: ['上游', '下游'],
  role: ['超级管理员', '运营', '财务', '只读'],
  coop: ['合作中', '暂停', '已终止', '洽谈中'],
}

const DATE_KEYS = ['start_date', 'end_date', 'order_date', 'biz_date', 'stop_date']
const TEXT_COLS = ['province', 'city']
const NON_FILTER = ['region', 'url', 'updated_at', 'created_at', 'last_login_at', 'time', 'id']
const ALWAYS_DATALIST = ['platform', 'cat1', 'channel', 'group_name']

export default function FilterBar({ cols, filters, setFilters, onSearch, fieldOptions = {}, actions = true }) {
  const list = cols.filter(c => !NON_FILTER.includes(c.k))

  return (
    <>
      {list.map(c => {
        if (TEXT_COLS.includes(c.k)) {
          return <ClearableInput key={c.k} autoComplete="off" placeholder={c.l} value={filters[c.k] || ''} onChange={e => setFilters({ ...filters, [c.k]: e.target.value })} />
        }
        const enumOpts = ENUM_COLS[c.k]
        if (enumOpts) {
          return (
            <select key={c.k} value={filters[c.k] || ''} onChange={e => setFilters({ ...filters, [c.k]: e.target.value })}>
              <option value="">{c.l}</option>
              {enumOpts.map(o => {
                const val = typeof o === 'object' ? o.value : o
                const label = typeof o === 'object' ? o.label : o
                return <option key={val} value={val}>{label}</option>
              })}
            </select>
          )
        }
        const opts = fieldOptions[c.k]
        if (opts) {
          if (opts.length <= 20 && !ALWAYS_DATALIST.includes(c.k)) {
            return (
              <select key={c.k} value={filters[c.k] || ''} onChange={e => setFilters({ ...filters, [c.k]: e.target.value })}>
                <option value="">{c.l}</option>
                {opts.map(o => {
                  const val = typeof o === 'object' ? o.value : o
                  const label = typeof o === 'object' ? o.label : o
                  return <option key={val} value={val}>{label}</option>
                })}
              </select>
            )
          }
          const id = `dl-${c.k}`
          return (
            <React.Fragment key={c.k}>
              <ClearableInput list={id} autoComplete="off" placeholder={c.l} value={filters[c.k] || ''} onChange={e => setFilters({ ...filters, [c.k]: e.target.value })} />
              <datalist id={id}>
                {opts.map(o => {
                  const val = typeof o === 'object' ? o.value : o
                  const label = typeof o === 'object' ? o.label : o
                  return <option key={val} value={val}>{label}</option>
                })}
              </datalist>
            </React.Fragment>
          )
        }
        if (DATE_KEYS.includes(c.k)) {
          return <input key={c.k} type="date" autoComplete="off" value={filters[c.k] || ''} onChange={e => setFilters({ ...filters, [c.k]: e.target.value })} />
        }
        return <ClearableInput key={c.k} autoComplete="off" placeholder={c.l} value={filters[c.k] || ''} onChange={e => setFilters({ ...filters, [c.k]: e.target.value })} />
      })}
      {actions && <button className="btn primary" onClick={() => onSearch()}>查询</button>}
      {actions && <button className="btn" onClick={() => { setFilters({}); onSearch({}) }}>重置</button>}
    </>
  )
}

export function buildQuery(filters) {
  const params = new URLSearchParams()
  Object.keys(filters).forEach(k => { if (filters[k] !== '' && filters[k] !== undefined && filters[k] !== null) params.set(k, filters[k]) })
  return params.toString()
}
