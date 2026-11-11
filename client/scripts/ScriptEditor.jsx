// 脚本编辑页：左边灵感素材，右边一张稿纸（标题、进度、排期、正文）。
import React from 'react'
import { SCRIPT_STATUSES, SCRIPT_TEMPLATE, bodyStats, cleanTitle, isDateKey } from '../../src/scripts.js'
import { Icon } from '../icons.jsx'
import { ago, ideaText, thumbOf, snippetFor, KIND_ICON } from './shared.js'

const { useState, useEffect, useMemo, useRef, useCallback } = React
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function dateLabel(key) {
  if (!key) return '未排期'
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(y, m - 1, d)
  const thisYear = new Date().getFullYear() === y
  return `${thisYear ? '' : y + ' 年 '}${m} 月 ${d} 日 ${WEEK[t.getDay()]}`
}

function IdeaMaterial({ idea, onInsert, onDetach }) {
  const thumb = thumbOf(idea)
  const text = ideaText(idea)
  return (
    <div className={'wk-sc-idea' + (idea.done ? ' is-done' : '')}>
      {thumb && <img className="wk-sc-idea-thumb" src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />}
      <div className="wk-sc-idea-main">
        {text && <div className="wk-sc-idea-text">{text}</div>}
        <div className="wk-sc-idea-meta">
          <Icon name={KIND_ICON[idea.kind || 'text']} size={11} />
          {(idea.tags || []).slice(0, 3).map(t => <span key={t}>#{t}</span>)}
          {idea.done && <span className="wk-sc-idea-done"><Icon name="check" size={11} stroke={2.6} />完稿</span>}
        </div>
      </div>
      <div className="wk-sc-idea-actions">
        <button className="wk-btn-text" onClick={() => onInsert(idea)} title="插到正文的光标处">插入</button>
        <button className="wk-icon-btn sm" onClick={() => onDetach(idea)} title="移出这个脚本（灵感本身不删）"><Icon name="close" size={12} /></button>
      </div>
    </div>
  )
}

function AttachPicker({ ideas, scriptTitle, onAttach, onClose }) {
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  useEffect(() => {
    const close = e => { if (!boxRef.current?.contains(e.target)) onClose() }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onClose])
  const term = q.trim().toLowerCase()
  const list = ideas
    .filter(it => !it.archived && it.script !== scriptTitle)
    .filter(it => !term || (ideaText(it) + ' ' + (it.tags || []).join(' ')).toLowerCase().includes(term))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60)
  return (
    <div className="wk-sc-attach" ref={boxRef}>
      <input className="wk-picker-input" autoFocus value={q} placeholder="搜索灵感的文字或标签"
        onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }} />
      <div className="wk-sc-attach-list">
        {list.map(it => (
          <button key={it.id} className="wk-sc-attach-opt" onClick={() => onAttach(it)}>
            <Icon name={KIND_ICON[it.kind || 'text']} size={12} />
            <span className="wk-sc-attach-text">{ideaText(it) || '（无文字）'}</span>
            {it.script && <span className="wk-sc-attach-from" title="会从这个脚本移过来">{it.script}</span>}
          </button>
        ))}
        {!list.length && <div className="wk-pop-empty">{term ? '没有找到' : '没有可以添加的灵感了'}</div>}
      </div>
    </div>
  )
}

export function ScriptEditor({ script, scripts, ideasStore, store, onBack, onGather }) {
  const { ideas } = ideasStore
  const bodyRef = useRef(null)
  const [title, setTitle] = useState(script.title)
  const [titleErr, setTitleErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setTitle(script.title); setTitleErr('') }, [script.id, script.title])

  const linked = useMemo(
    () => ideas.filter(it => it.script === script.title && !it.archived).sort((a, b) => a.createdAt - b.createdAt),
    [ideas, script.title],
  )
  const pendingDone = linked.filter(it => !it.done).length
  const stats = bodyStats(script.body)
  const stepIdx = SCRIPT_STATUSES.findIndex(s => s.id === script.status)
  const cover = linked.map(thumbOf).find(Boolean)

  function commitTitle() {
    const t = cleanTitle(title)
    if (!t || t === script.title) { setTitle(script.title); setTitleErr(''); return }
    if (scripts.some(s => s.id !== script.id && s.title === t)) { setTitleErr('已经有同名的脚本了'); return }
    setTitleErr('')
    store.update(script.id, { title: t })
    for (const it of ideas) if (it.script === script.title) ideasStore.update(it.id, { script: t })
  }

  function setStatus(st) {
    if (st === script.status) return
    store.update(script.id, { status: st })
    // 完成：这个脚本下还没完稿的灵感一起标记完稿
    if (st === 'done') {
      const now = Date.now()
      for (const it of linked) if (!it.done) ideasStore.update(it.id, { done: true, doneAt: now })
    }
  }

  function setBody(body) { store.update(script.id, { body }) }

  function del() {
    if (!window.confirm(`删除脚本「${script.title}」？${linked.length ? `\n它下面的 ${linked.length} 条灵感不会删除，只是不再属于这个脚本。` : ''}`)) return
    for (const it of ideas) if (it.script === script.title) ideasStore.update(it.id, { script: undefined })
    store.remove(script.id)
    onBack()
  }

  function copy() {
    navigator.clipboard?.writeText(`${script.title}\n\n${script.body}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  }

  // 记住光标：点左边「插入」时文本框已经失焦
  const caret = useRef(null)
  const insert = useCallback(idea => {
    const piece = snippetFor(idea)
    if (!piece) return
    const body = script.body
    const at = caret.current ?? body.length
    const before = body.slice(0, at)
    const after = body.slice(at)
    const pre = before && !before.endsWith('\n') ? '\n' : ''
    const post = after && !after.startsWith('\n') ? '\n' : ''
    store.update(script.id, { body: before + pre + piece + post + after })
    const pos = (before + pre + piece).length
    caret.current = pos
    requestAnimationFrame(() => {
      const t = bodyRef.current
      if (!t) return
      t.focus({ preventScroll: true })
      t.setSelectionRange(pos, pos)
    })
  }, [script.body, script.id, store.update])

  // 正文自动长高
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, 360) + 'px'
  }, [script.body, script.id])

  const closeAdd = useCallback(() => setAdding(false), [])

  return (
    <div className="wk-se">
      <aside className="wk-sc-panel wk-se-side">
        <button className="wk-se-back" onClick={onBack}><Icon name="chevronLeft" size={16} />排期</button>
        <header className="wk-sc-head">
          <div className="wk-sc-title">灵感素材<span>{linked.length}</span></div>
          <button className="wk-btn-text" onClick={() => onGather(script.title)} disabled={!linked.length} title="去灵感页，把这些灵感在画布上聚到一起">
            <Icon name="cluster" size={13} />在画布里看
          </button>
        </header>
        <div className="wk-sc-idea-list">
          {linked.map(it => <IdeaMaterial key={it.id} idea={it} onInsert={insert} onDetach={x => ideasStore.update(x.id, { script: undefined })} />)}
          {!linked.length && (
            <div className="wk-sc-empty-ideas">还没有灵感归到这个脚本。<br />从下面添加，或在灵感页记录时选「脚本」。</div>
          )}
        </div>
        <div className="wk-sc-add-wrap">
          {adding && <AttachPicker ideas={ideas} scriptTitle={script.title} onAttach={it => ideasStore.update(it.id, { script: script.title })} onClose={closeAdd} />}
          <button className="wk-sc-add" onClick={() => setAdding(v => !v)}><Icon name="plus" size={14} />从灵感里添加</button>
        </div>
      </aside>

      <section className="wk-sc-editor">
        <div className="wk-se-hero">
          <div className="wk-se-hero-main">
            <input className="wk-sc-title-input" value={title} maxLength={40} placeholder="脚本标题"
              onChange={e => { setTitle(e.target.value); if (titleErr) setTitleErr('') }}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur() }
                if (e.key === 'Escape') { setTitle(script.title); setTitleErr(''); e.currentTarget.blur() }
              }} />
            {titleErr && <div className="wk-error wk-sc-title-err">{titleErr}</div>}
            <div className="wk-se-figures">
              <span><Icon name="edit" size={13} />{stats.chars} 字</span>
              <span><Icon name="play" size={12} />口播{stats.duration === '—' ? ' —' : ' ' + stats.duration}</span>
              <span><Icon name="lightbulb" size={13} />{linked.length} 条灵感</span>
              <span className="wk-se-faint">更新于 {ago(script.updatedAt)}</span>
            </div>
            <div className="wk-se-actions">
              <button className="wk-btn-primary" onClick={copy}><Icon name="docs" size={14} />{copied ? '已复制' : '复制脚本'}</button>
              <label className={'wk-se-date' + (script.date ? ' is-set' : '')}>
                <Icon name="calendar" size={14} />
                <span>{dateLabel(script.date)}</span>
                <input type="date" value={script.date || ''} onChange={e => store.update(script.id, isDateKey(e.target.value) ? { date: e.target.value } : { date: undefined, time: undefined })} />
              </label>
              {script.date && (
                <label className="wk-se-time" title="发布时间（可选）">
                  <input type="time" value={script.time || ''} onChange={e => store.update(script.id, { time: e.target.value || undefined })} />
                </label>
              )}
              {script.date && <button className="wk-btn-text" onClick={() => store.update(script.id, { date: undefined, time: undefined })}>取消排期</button>}
            </div>
          </div>
          {cover && <div className="wk-se-cover"><img src={cover} alt="" referrerPolicy="no-referrer" draggable={false} /></div>}
        </div>

        <div className="wk-sc-sheet">
          <div className="wk-sc-steps" role="radiogroup" aria-label="进度">
            {SCRIPT_STATUSES.map((s, i) => (
              <button key={s.id} role="radio" aria-checked={i === stepIdx}
                className={'wk-sc-step is-' + s.id + (i === stepIdx ? ' is-current' : i < stepIdx ? ' is-passed' : '')}
                onClick={() => setStatus(s.id)}>
                <span className="wk-sc-step-dot">{i < stepIdx ? <Icon name="check" size={11} stroke={2.6} /> : i + 1}</span>{s.label}
              </button>
            ))}
            <span className="wk-sc-meta-actions">
              <button className="wk-btn-text" onClick={() => setBody(script.body ? script.body.replace(/\s*$/, '\n\n') + SCRIPT_TEMPLATE : SCRIPT_TEMPLATE)}
                title="插入「开头 · 正文 · 结尾」的结构">插入结构</button>
              <button className="wk-btn-text is-danger" onClick={del}>删除</button>
            </span>
          </div>
          {script.status !== 'done' && pendingDone > 0 && <div className="wk-sc-meta-hint wk-se-hint">改成「完成」时，{pendingDone} 条灵感会一起标记完稿</div>}
          {script.status === 'done' && script.doneAt && <div className="wk-sc-meta-ok wk-se-hint"><Icon name="check" size={12} stroke={2.4} />{ago(script.doneAt)}完成</div>}
          <textarea ref={bodyRef} className="wk-sc-body" value={script.body} spellCheck={false}
            placeholder={'从这里开始写……\n\n左边是归到这个脚本的灵感，点「插入」就能把它放到光标处。\n不知道怎么开头？点上面的「插入结构」。'}
            onChange={e => setBody(e.target.value)}
            onSelect={e => { caret.current = e.currentTarget.selectionStart }} />
        </div>
      </section>
    </div>
  )
}
