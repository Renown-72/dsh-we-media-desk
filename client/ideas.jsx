// 灵感面板：记录、搜索、筛选、置顶、编辑、归档、删除。
import React from 'react'
import { createIdea, sortIdeas, filterIdeas, collectTags, parseTags } from '../src/ideas.js'
import { loadIdeas, saveIdeas } from './storage.js'

const { useState, useMemo, useEffect } = React

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

  // 变更后持久化（刷新不丢）
  useEffect(() => { saveIdeas(ideas) }, [ideas])

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
