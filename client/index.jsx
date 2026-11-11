// 自媒体工作台 —— 浏览器半边（前端）。
// DSH 客户端模块系统懒加载本文件，宿主提供 React。
// 通过 ctx.slots 注册到 DSH 的侧栏入口与主面板。
import React from 'react'
import styles from './styles.css'
import { IdeasPanel } from './ideas/index.jsx'
import { ScriptsPanel } from './scripts/index.jsx'
import { Icon } from './icons.jsx'

const { useState } = React

const TABS = [
  { id: 'ideas', label: '灵感', icon: 'lightbulb' },
  { id: 'scripts', label: '脚本', icon: 'docs' },
  { id: 'schedule', label: '排期', icon: 'calendar', soon: '把做好的内容拖到日历上，哪天发什么清清楚楚。' },
  { id: 'review', label: '复盘', icon: 'chart', soon: '记下每条内容的数据，看看什么最受欢迎。' },
  { id: 'style', label: '风格', icon: 'palette', soon: '沉淀你的写作风格，让成稿更像你。' },
]

function ComingSoon({ tab }) {
  return (
    <div className="wk-soon">
      <div className="wk-soon-card">
        <span className="wk-soon-icon"><Icon name={tab.icon} size={26} /></span>
        <h2>{tab.label}</h2>
        <p>{tab.soon}</p>
        <span className="wk-soon-tag">正在制作</span>
      </div>
    </div>
  )
}

export function App() {
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem('we-media-desk:tab') || 'ideas'
      return t === 'contents' ? 'scripts' : t // 旧版的「内容」页改名为「脚本」
    } catch { return 'ideas' }
  })
  // 从脚本页跳到灵感页，并在画布上汇聚这个脚本的灵感
  const [gatherRequest, setGatherRequest] = useState(null)
  const gatherScript = React.useCallback(name => {
    setGatherRequest({ picks: [{ type: 'script', value: name }], n: Date.now() })
    pick('ideas')
  }, [])
  const current = TABS.find(t => t.id === tab) || TABS[0]
  function pick(id) {
    setTab(id)
    try { localStorage.setItem('we-media-desk:tab', id) } catch { /* ignore */ }
  }
  return (
    <div className="wk-root">
      <style>{styles}</style>
      <nav className="wk-float wk-nav" aria-label="自媒体工作台">
        {TABS.map(t => (
          <button
            key={t.id}
            className={'wk-nav-tab' + (current.id === t.id ? ' is-active' : '')}
            onClick={() => pick(t.id)}
          >
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </nav>
      <main className="wk-main">
        {current.id === 'ideas' ? <IdeasPanel gatherRequest={gatherRequest} />
          : current.id === 'scripts' ? <ScriptsPanel onGather={gatherScript} />
          : <ComingSoon tab={current} />}
      </main>
    </div>
  )
}

// 侧栏图标：使用 DSH 自带图标系统（dsw-icon-* sprite），与其他插件完全一致。
// DSH 的 sidebar.panellist 图标组件接收 { size }。
export function SidebarEntry({ size = 16 } = {}) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      'data-icon': 'dsw-icon-list-pen-outline-regular',
      'aria-hidden': 'true',
    },
    React.createElement('use', { href: '#dsw-icon-list-pen-outline-regular' }),
  )
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
