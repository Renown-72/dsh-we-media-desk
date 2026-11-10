// 自媒体工作台 —— 浏览器半边（前端）。
// DSH 客户端模块系统会懒加载本文件，宿主提供 React。
import React from 'react'
import styles from './styles.css'
import { IdeasPanel } from './ideas.jsx'

const { useState } = React

// 五个页面：灵感 · 内容 · 排期 · 复盘 · 风格
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

export function apply() {
  // 客户端插件挂载入口占位；具体如何注册页面视图按 DSH 客户端运行时约定接入。
  return { App }
}

export default { apply, App }
