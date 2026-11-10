// 灵感面板：记录、搜索、筛选、置顶、编辑、归档、删除。
import React from 'react'
import { createIdea, sortIdeas, filterIdeas, collectTags, parseTags } from '../src/ideas.js'
import { loadIdeas, saveIdeas, hostBridge } from './storage.js'

const { useState, useMemo, useEffect, useRef } = React

const SAVE_DELAY = 300

function TagChip({ tag, count, active, onClick }) {
  return (
    <button
      className={'wk-chip' + (active ? ' is-active' : '')}
      onClick={onClick}
    >#{tag}{count != null ? ` ${count}` : ''}</button>
  )
}

function IdeaCard({ idea, onPin, onArchive, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(idea.text)

  function save() {
    const text = draft.trim()
    if (text) onEdit(idea.id, text)
    else setDraft(idea.text)
    setEditing(false)
  }

  return (
    <li className={'wk-card' + (idea.pinned ? ' is-pinned' : '') + (idea.archived ? ' is-archived' : '')}>
      <div className="wk-card-head">
        {idea.pinned && <span className="wk-pin">📌</span>}
        {editing ? (
          <input
            className="wk-input wk-input-sm"
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(idea.text); setEditing(false) } }}
          />
        ) : (
          <span className="wk-card-text" onDoubleClick={() => setEditing(true)}>{idea.text}</span>
        )}
        <div className="wk-card-actions">
          {editing
            ? <button className="wk-mini" onClick={save}>保存</button>
            : <button className="wk-mini" title="编辑" onClick={() => setEditing(true)}>编辑</button>}
          <button className="wk-mini" title="置顶" onClick={() => onPin(idea.id)}>{idea.pinned ? '取消置顶' : '置顶'}</button>
          <button className="wk-mini" title="归档" onClick={() => onArchive(idea.id)}>{idea.archived ? '取消归档' : '归档'}</button>
          <button className="wk-mini wk-mini-danger" title="删除" onClick={() => onDelete(idea.id)}>删除</button>
        </div>
      </div>
      {idea.tags.length > 0 && (
        <div className="wk-card-tags">
          {idea.tags.map(t => <span key={t} className="wk-tag">#{t}</span>)}
        </div>
      )}
    </li>
  )
}

export function IdeasPanel() {
  const [ideas, setIdeas] = useState(() => loadIdeas() || [])
  const [draft, setDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState('')

  // 同步状态：loading 正在连 host；host 已与 host 同步；local 只存在本浏览器
  const [sync, setSync] = useState('loading')
  const hostReady = useRef(false)   // 首次从 host 读完之前不往 host 写，避免旧缓存覆盖
  const lastSynced = useRef('')     // 上次成功写入 host 的内容，用来跳过重复保存
  const pending = useRef(null)      // 等待写入 host 的最新列表
  const alive = useRef(true)

  function flushToHost() {
    const list = pending.current
    if (!list) return
    pending.current = null
    const snapshot = JSON.stringify(list)
    hostBridge.save(list).then(
      () => { lastSynced.current = snapshot; if (alive.current) setSync('host') },
      () => { if (alive.current) setSync('local') },
    )
  }

  // 启动时以 host 为准；host 还没有数据时，把本地已有的灵感迁移上去。
  useEffect(() => {
    alive.current = true
    const mountedAt = Date.now()
    hostBridge.load().then(remote => {
      if (!alive.current) return
      hostReady.current = true
      if (remote.length === 0) {
        setIdeas(prev => [...prev]) // 触发一次保存，把本地数据迁移到 host
      } else {
        lastSynced.current = JSON.stringify(remote)
        // 保留加载期间新记下、host 上还没有的灵感
        setIdeas(prev => {
          const ids = new Set(remote.map(it => it.id))
          const fresh = prev.filter(it => !ids.has(it.id) && (it.createdAt ?? 0) >= mountedAt)
          return fresh.length ? [...fresh, ...remote] : remote
        })
      }
      setSync('host')
    }, () => {
      if (alive.current) setSync('local')
    })
    return () => { alive.current = false; flushToHost() } // 切走页面时立刻写完未保存的改动
  }, [])

  // 变更后持久化：本地立即写，host 防抖写
  useEffect(() => {
    saveIdeas(ideas)
    if (!hostReady.current) return
    if (JSON.stringify(ideas) === lastSynced.current) return
    pending.current = ideas
    const timer = setTimeout(flushToHost, SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [ideas])

  function add() {
    const text = draft.trim()
    if (!text) return
    setIdeas(prev => [createIdea({ text, tags: tagDraft }), ...prev])
    setDraft('')
    setTagDraft('')
  }

  function pin(id) {
    setIdeas(prev => prev.map(it => it.id === id ? { ...it, pinned: !it.pinned, updatedAt: Date.now() } : it))
  }
  function archive(id) {
    setIdeas(prev => prev.map(it => it.id === id ? { ...it, archived: !it.archived, updatedAt: Date.now() } : it))
  }
  function del(id) {
    setIdeas(prev => prev.filter(it => it.id !== id))
  }
  function edit(id, text) {
    setIdeas(prev => prev.map(it => it.id === id ? { ...it, text: text.slice(0, 2000), updatedAt: Date.now() } : it))
  }

  const tags = useMemo(() => collectTags(ideas), [ideas])
  const visible = useMemo(
    () => sortIdeas(filterIdeas(ideas, { query, tag: activeTag })),
    [ideas, query, activeTag]
  )
  const archivedCount = ideas.filter(i => i.archived).length

  return (
    <div className="wk-panel">
      {/* 录入区 */}
      <div className="wk-compose">
        <input
          className="wk-input"
          value={draft}
          placeholder="记一句灵感，回车保存…"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <input
          className="wk-input wk-input-tags"
          value={tagDraft}
          placeholder="#标签（可选，空格分隔）"
          onChange={e => setTagDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="wk-btn" onClick={add}>记下</button>
      </div>
      {sync === 'local' && (
        <p className="wk-sync is-local">未连接到 DSH 后台，灵感暂时只保存在本浏览器。</p>
      )}

      {/* 搜索 / 筛选 */}
      {ideas.length > 0 && (
        <div className="wk-filters">
          <input
            className="wk-input wk-input-search"
            value={query}
            placeholder="搜索灵感或标签…"
            onChange={e => setQuery(e.target.value)}
          />
          {activeTag && (
            <button className="wk-chip is-active" onClick={() => setActiveTag('')}>#{activeTag} ✕</button>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="wk-tagbar">
          {tags.map(t => (
            <TagChip
              key={t.tag}
              tag={t.tag}
              count={t.count}
              active={activeTag === t.tag}
              onClick={() => setActiveTag(activeTag === t.tag ? '' : t.tag)}
            />
          ))}
        </div>
      )}

      {/* 列表 */}
      <ul className="wk-list">
        {visible.map(it => (
          <IdeaCard
            key={it.id}
            idea={it}
            onPin={pin}
            onArchive={archive}
            onDelete={del}
            onEdit={edit}
          />
        ))}
        {visible.length === 0 && (
          <li className="wk-empty">
            {ideas.length === 0 ? '还没有灵感，先记一条吧' : '没有匹配的灵感'}
            {archivedCount > 0 && ideas.length === visible.length ? `（归档 ${archivedCount} 条）` : ''}
          </li>
        )}
      </ul>
    </div>
  )
}
