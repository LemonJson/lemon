import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { getUser, clearAuth, api } from '../api'
import AiChat from './AiChat'

const TITLE_MAP = {
  '/': '工作台', '/orders': '订单管理', '/daily': '日活管理', '/product-sales': '产品销售', '/fund': '公积金',
  '/wash-names': '洗名库',
  '/customers': '客户管理', '/parts': '配件管理', '/categories': '品类管理',
  '/channels': '渠道管理', '/operators': '运营商管理', '/groups': '小组监控', '/bills': '账单管理',
  '/source-files': '文件管理',
  '/alerts': '预警中心', '/accounts': '账户管理', '/templates': '模版管理',
  '/tidabiao-history': '提单历史',
  '/logs': '日志管理',
  '/config-center': '配置中心',
  '/products': '产品管理',
  '/workflow': '快速出货',
  '/trash': '垃圾箱',
}

const MENUS = [
  { key: '/', name: '工作台', icon: '📊', perm: 'dashboard:view' },
  { key: '/orders', name: '订单管理', icon: '📝', perm: 'order:view' },
  { key: '/groups', name: '小组监控', icon: '🎯', perm: 'group:view' },
  { key: '/daily', name: '日活管理', icon: '📈', perm: 'daily:view' },
  { key: '/product-sales', name: '产品销售', icon: '🛍️', perm: 'product:view' },
  { key: '/bills', name: '账单管理', icon: '💰', perm: 'bill:view' },
  { key: '/customers', name: '客户管理', icon: '👤', perm: 'customer:view' },
  { key: '/alerts', name: '预警中心', icon: '🔔', perm: 'alert:view' },
  { key: 'data', name: '业务数据', icon: '📋', children: [
    { key: '/tidabiao-history', name: '提单历史', perm: 'tidabiao:view' },
    { key: '/wash-names', name: '洗名库', perm: 'wash:view' },
    { key: '/fund', name: '公积金', perm: 'fund:view' },
    { key: '/source-files', name: '文件管理', perm: 'file:view' },
  ] },
  { key: 'master', name: '基础配置', icon: '🗄️', children: [
    { key: '/parts', name: '配件管理', perm: 'parts:view' },
    { key: '/categories', name: '品类管理', perm: 'category:view' },
    { key: '/channels', name: '渠道管理', perm: 'channel:view' },
    { key: '/operators', name: '运营商管理', perm: 'operator:view' },
    { key: '/templates', name: '模版管理', perm: 'template:view' },
    { key: '/products', name: '产品管理', perm: 'product:view' },
  ] },
  { key: 'system', name: '系统管理', icon: '⚙️', children: [
    { key: '/accounts', name: '账户管理', perm: 'account:view' },
    { key: '/config-center', name: '配置中心', perm: 'config:view' },
    { key: '/logs', name: '日志管理', perm: 'log:view' },
    { key: '/trash', name: '垃圾箱', adminOnly: true },
  ] },
]

export default function Layout() {
  const user = getUser() || {}
  const nav = useNavigate()
  const location = useLocation()
  const [openSub, setOpenSub] = useState({})
  const [alertCounts, setAlertCounts] = useState({ stop: 0, bill: 0 })

  useEffect(() => {
    const refresh = () => api.get('/api/dashboard/alerts-count').then(r => setAlertCounts(r.data)).catch(() => {})
    refresh()
    window.addEventListener('alert-count-refresh', refresh)
    return () => window.removeEventListener('alert-count-refresh', refresh)
  }, [])

  // 无工作台权限时，默认跳转到第一个可见菜单
  useEffect(() => {
    const perms = user.permissions || []
    const isAdmin = user.role_code === 'admin' || perms.includes('*')
    if (isAdmin || perms.includes('dashboard:view')) return
    if (location.pathname !== '/') return
    const canSee = (item) => item.adminOnly ? isAdmin : (isAdmin || !item.perm || perms.includes(item.perm))
    for (const m of MENUS) {
      if (m.key === '/') continue
      if (m.children) {
        for (const c of m.children) {
          if (canSee(c)) { nav(c.key, { replace: true }); return }
        }
      } else if (canSee(m)) {
        nav(m.key, { replace: true }); return
      }
    }
  }, [location.pathname, user])

  function logout() { clearAuth(); nav('/login') }

  function badgeOf(key) {
    if (key === '/orders') return alertCounts.stop
    if (key === '/customers') return alertCounts.bill
    return 0
  }

  function renderMenus() {
    const perms = user.permissions || []
    const isAdmin = user.role_code === 'admin' || perms.includes('*')
    const canSee = (item) => item.adminOnly ? isAdmin : (isAdmin || !item.perm || perms.includes(item.perm))
    return MENUS.filter(m => {
      if (m.adminOnly) return isAdmin
      if (m.children) return m.children.some(c => canSee(c))
      return canSee(m)
    }).map(m => {
      if (m.children) {
        const open = openSub[m.key]
        const visibleChildren = m.children.filter(c => canSee(c))
        return (
          <React.Fragment key={m.key}>
            <a onClick={() => setOpenSub({ ...openSub, [m.key]: !open })}>
              <span>{m.icon}</span>{m.name}<span className="toggle">{open ? '▼' : '▶'}</span>
            </a>
            {open && visibleChildren.map(c => (
              <NavLink key={c.key} to={c.key} className="sub">
                <span></span>{c.name}
              </NavLink>
            ))}
          </React.Fragment>
        )
      }
      return (
        <NavLink key={m.key} to={m.key} end={m.key === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
          <span>{m.icon}</span>{m.name}{badgeOf(m.key) > 0 && <span className="nav-badge">{badgeOf(m.key)}</span>}
        </NavLink>
      )
    })
  }

  return (
    <div className="layout">
      <aside className="side">
        <div className="logo"><img src="/logo.jpeg" alt="logo" />LM<span>订单管理系统</span></div>
        <nav>{renderMenus()}</nav>
        <div className="foot">
          <div className="foot-user">
            <span className="foot-name">{user.nickname || user.username}</span>
            <span className="badge">{user.role}</span>
          </div>
          <button className="btn small" onClick={logout}>退出</button>
        </div>
      </aside>
      <div className="main">
        {location.pathname !== '/' && <div className="page-title">{TITLE_MAP[location.pathname] || '工作台'}</div>}
        <div className="content"><Outlet /></div>
      </div>
      <AiChat />
      {location.pathname !== '/workflow' && <button className="wf-fab" onClick={() => nav('/workflow')}>快速出货</button>}
    </div>
  )
}
