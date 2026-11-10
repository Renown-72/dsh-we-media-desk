// 自媒体工作台 —— 浏览器半边（前端）。
// DSH 客户端模块系统懒加载本文件，宿主提供 React。
// 通过 ctx.slots 注册到 DSH 的侧栏入口与主面板。
import React from 'react'
import styles from './styles.css'
import { IdeasPanel } from './ideas.jsx'

const { useState } = React

const TABS = [
  { id: 'ideas', label: '灵感' },
  { id: 'contents', label: '内容' },
  { id: 'schedule', label: '排期' },
  { id: 'review', label: '复盘' },
  { id: 'style', label: '风格' },
]

function Placeholder({ name }) {
  return <div className="wk-panel"><p className="wk-empty">{name}页面（待开发）</p></div>
}

export function App() {
  const [tab, setTab] = useState('ideas')
  return (
    <div className="wk-root">
      <style>{styles}</style>
      <header className="wk-header">
        <h1 className="wk-title">自媒体工作台</h1>
        <nav className="wk-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={'wk-tab' + (tab === t.id ? ' is-active' : '')}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="wk-main">
        {tab === 'ideas' ? <IdeasPanel /> : <Placeholder name={TABS.find(t => t.id === tab).label} />}
      </main>
    </div>
  )
}

// 侧栏图标/入口
export function SidebarEntry() {
  return React.createElement('div', { className: 'wk-sidebar-entry' }, '📝 自媒体工作台')
}

// DSH 客户端插件约定：inject slots，apply 里注册槽位。
export const inject = ['slots']

export function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: 'we-media-desk', order: 6, label: () => '自媒体工作台' },
    SidebarEntry,
  ))
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: 'we-media-desk' },
    App,
  ))
}

export default { inject, apply }
