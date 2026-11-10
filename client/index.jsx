// 自媒体工作台 —— 浏览器半边（前端）。
// DSH 客户端模块系统会懒加载本文件，宿主提供 React。
import React from 'react'
import styles from './styles.css'

const { useState } = React

// 五个页面：灵感 · 内容 · 排期 · 复盘 · 风格
const TABS = [
  { id: 'ideas', label: '灵感' },
  { id: 'contents', label: '内容' },
  { id: 'schedule', label: '排期' },
  { id: 'review', label: '复盘' },
  { id: 'style', label: '风格' },
]

function IdeasPanel() {
  const [ideas, setIdeas] = useState([])
  const [draft, setDraft] = useState('')

  function add() {
    const text = draft.trim()
    if (!text) return
    setIdeas([{ id: String(Date.now()), text }, ...ideas])
    setDraft('')
  }

  return (
    <div className="wk-panel">
      <div className="wk-row">
        <input
          className="wk-input"
          value={draft}
          placeholder="记一句灵感，回车保存…"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="wk-btn" onClick={add}>记下</button>
      </div>
      <ul className="wk-list">
        {ideas.map(it => <li key={it.id} className="wk-card">{it.text}</li>)}
        {ideas.length === 0 && <li className="wk-empty">还没有灵感，先记一条吧</li>}
      </ul>
    </div>
  )
}

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
