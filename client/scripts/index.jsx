// 脚本页：左边脚本列表，中间写脚本，右边是这个脚本的灵感素材。
// 灵感通过 script 字段（脚本标题）归到脚本下；改标题时一起改灵感上的名字。
import React from 'react'
import { SCRIPT_STATUSES, SCRIPT_TEMPLATE, missingScripts, filterScripts, bodyStats, cleanTitle } from '../../src/scripts.js'
import { isDirectMedia } from '../../src/ideas.js'
import { useIdeas } from '../ideas/useIdeas.js'
import { useScripts } from './useScripts.js'
import { fileUrl } from '../storage.js'
import { Icon } from '../icons.jsx'

const { useState, useEffect, useMemo, useRef, useCallback } = React

const SEL_KEY = 'we-media-desk:script-selected'
const STATUS_LABEL = Object.fromEntries(SCRIPT_STATUSES.map(s => [s.id, s.label]))
const KIND_ICON = { text: 'text', image: 'image', link: 'link', video: 'play' }

function ago(ts, now = Date.now()) {
  const m = Math.floor((now - ts) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const t = new Date(ts)
  return `${t.getMonth() + 1} 月 ${t.getDate()} 日`
}

function ideaText(it) {
  return (it.text || it.preview?.title || it.url || '').trim()
}

function thumbOf(it) {
  if (it.kind === 'image') return it.file ? fileUrl(it.file.name) : it.url
  if ((it.kind === 'link' || it.kind === 'video') && it.preview?.image && !it.file && !isDirectMedia(it.url || '')) return it.preview.image
  return ''
}

// 插进正文的样子：文字原样；链接、视频带上网址；图片注明是图片
function snippetFor(it) {
  const text = it.text || it.preview?.title || ''
  if (it.kind === 'image') return `［图片］${text || (it.file?.name ?? '')}`
  if ((it.kind === 'link' || it.kind === 'video') && it.url) return text ? `${text}（${it.url}）` : it.url
  return text
}

function StatusPill({ status }) {
  return <span className={'wk-sc-status is-' + status}>{STATUS_LABEL[status]}</span>
}

// ---- 左：脚本列表 ----
function ScriptList({ scripts, counts, selectedId, onSelect, onCreate, status, setStatus, query, setQuery, total }) {
  return (
    <aside className="wk-sc-panel wk-sc-list">
      <header className="wk-sc-head">
        <div className="wk-sc-title">脚本<span>{total}</span></div>
        <button className="wk-btn-primary sm" onClick={() => onCreate()}><Icon name="plus" size={14} stroke={2.2} />新建</button>
      </header>
      <label className="wk-search sm">
        <Icon name="search" size={14} />
        <input value={query} placeholder="搜索标题、正文" onChange={e => setQuery(e.target.value)} />
      </label>
      <div className="wk-sc-filter">
        <button className={status ? '' : 'is-on'} onClick={() => setStatus('')}>全部</button>
        {SCRIPT_STATUSES.map(s => (
          <button key={s.id} className={status === s.id ? 'is-on' : ''} onClick={() => setStatus(status === s.id ? '' : s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="wk-sc-items">
        {scripts.map(s => (
          <button key={s.id} className={'wk-sc-item' + (s.id === selectedId ? ' is-active' : '')} onClick={() => onSelect(s.id)}>
            <div className="wk-sc-item-top">
              <span className="wk-sc-item-title">{s.title}</span>
              <StatusPill status={s.status} />
            </div>
            <div className="wk-sc-item-meta">
              {counts[s.title] ? `${counts[s.title]} 条灵感` : '没有灵感'} · {bodyStats(s.body).chars} 字 · {ago(s.updatedAt)}
            </div>
          </button>
        ))}
        {!scripts.length && <div className="wk-pop-empty wk-sc-none">{total ? '没有符合条件的脚本' : '还没有脚本'}</div>}
      </div>
    </aside>
  )
}

// ---- 中：编辑 ----
function ScriptEditor({ script, taken, onRename, onBody, onStatus, onDelete, bodyRef, linkedCount }) {
  const [title, setTitle] = useState(script.title)
  const [titleErr, setTitleErr] = useState('')
  useEffect(() => { setTitle(script.title); setTitleErr('') }, [script.id, script.title])
  const stats = bodyStats(script.body)
  const stepIdx = SCRIPT_STATUSES.findIndex(s => s.id === script.status)

  function commitTitle() {
    const t = cleanTitle(title)
    if (!t || t === script.title) { setTitle(script.title); setTitleErr(''); return }
    if (taken.has(t)) { setTitleErr('已经有同名的脚本了'); return }
    setTitleErr('')
    onRename(script, t)
  }

  // 自动长高
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, 320) + 'px'
  }, [script.body, script.id, bodyRef])

  return (
    <section className="wk-sc-editor">
      <div className="wk-sc-sheet">
        <input className="wk-sc-title-input" value={title} maxLength={40} placeholder="脚本标题"
          onChange={e => { setTitle(e.target.value); if (titleErr) setTitleErr('') }}
          onBlur={commitTitle}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur() }
            if (e.key === 'Escape') { setTitle(script.title); setTitleErr(''); e.currentTarget.blur() }
          }} />
        {titleErr && <div className="wk-error wk-sc-title-err">{titleErr}</div>}

        <div className="wk-sc-steps" role="radiogroup" aria-label="进度">
          {SCRIPT_STATUSES.map((s, i) => (
            <button key={s.id} role="radio" aria-checked={i === stepIdx}
              className={'wk-sc-step is-' + s.id + (i === stepIdx ? ' is-current' : i < stepIdx ? ' is-passed' : '')}
              onClick={() => onStatus(script, s.id)}>
              <span className="wk-sc-step-dot">{i < stepIdx ? <Icon name="check" size={11} stroke={2.6} /> : i + 1}</span>{s.label}
            </button>
          ))}
        </div>
        <div className="wk-sc-meta">
          <span>{stats.chars} 字</span>
          <span>口播{stats.duration === '—' ? ' —' : stats.duration}</span>
          <span>更新于 {ago(script.updatedAt)}</span>
          {script.status !== 'done' && linkedCount > 0 && <span className="wk-sc-meta-hint">改成「完成」时，{linkedCount} 条灵感会一起标记完稿</span>}
          {script.status === 'done' && script.doneAt && <span className="wk-sc-meta-ok"><Icon name="check" size={12} stroke={2.4} />{ago(script.doneAt)}完成</span>}
          <span className="wk-sc-meta-actions">
            <button className="wk-btn-text" onClick={() => onBody(script, script.body ? script.body.replace(/\s*$/, '\n\n') + SCRIPT_TEMPLATE : SCRIPT_TEMPLATE)}
              title="插入「开头 · 正文 · 结尾」的结构">插入结构</button>
            <button className="wk-btn-text is-danger" onClick={() => onDelete(script)}>删除</button>
          </span>
        </div>

        <textarea ref={bodyRef} className="wk-sc-body" value={script.body} spellCheck={false}
          placeholder={'从这里开始写……\n\n右边是归到这个脚本的灵感，点「插入」就能把它放到光标处。\n不知道怎么开头？点上面的「插入结构」。'}
          onChange={e => onBody(script, e.target.value)} />
      </div>
    </section>
  )
}

// ---- 右：灵感素材 ----
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

function Materials({ script, linked, allIdeas, onInsert, onDetach, onAttach, onGather }) {
  const [adding, setAdding] = useState(false)
  const closeAdd = useCallback(() => setAdding(false), [])
  return (
    <aside className="wk-sc-panel wk-sc-ideas">
      <header className="wk-sc-head">
        <div className="wk-sc-title">灵感素材<span>{linked.length}</span></div>
        <button className="wk-btn-text" onClick={() => onGather(script.title)} disabled={!linked.length} title="去灵感页，把这些灵感在画布上聚到一起">
          <Icon name="cluster" size={13} />在画布里看
        </button>
      </header>
      <div className="wk-sc-idea-list">
        {linked.map(it => <IdeaMaterial key={it.id} idea={it} onInsert={onInsert} onDetach={onDetach} />)}
        {!linked.length && (
          <div className="wk-sc-empty-ideas">
            还没有灵感归到这个脚本。<br />可以从下面添加，或者在灵感页记录时选「脚本」。
          </div>
        )}
      </div>
      <div className="wk-sc-add-wrap">
        {adding && <AttachPicker ideas={allIdeas} scriptTitle={script.title} onAttach={it => onAttach(it)} onClose={closeAdd} />}
        <button className="wk-sc-add" onClick={() => setAdding(v => !v)}><Icon name="plus" size={14} />从灵感里添加</button>
      </div>
    </aside>
  )
}

function EmptyState({ onCreate }) {
  const [name, setName] = useState('')
  return (
    <div className="wk-soon">
      <div className="wk-soon-card">
        <span className="wk-soon-icon"><Icon name="docs" size={26} /></span>
        <h2>还没有脚本</h2>
        <p>给第一个脚本起个名字。之后在灵感页记录时，可以在「脚本」小框里把灵感归到它下面。</p>
        <form className="wk-sc-new" onSubmit={e => { e.preventDefault(); onCreate(name) }}>
          <input className="wk-picker-input" autoFocus value={name} maxLength={40} placeholder="比如：城市夜景 vlog" onChange={e => setName(e.target.value)} />
          <button className="wk-btn-primary" type="submit">新建</button>
        </form>
      </div>
    </div>
  )
}

export function ScriptsPanel({ onGather }) {
  const ideasStore = useIdeas()
  const store = useScripts()
  const { ideas } = ideasStore
  const { scripts } = store
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => { try { return localStorage.getItem(SEL_KEY) || '' } catch { return '' } })
  const bodyRef = useRef(null)

  // 灵感里用到、还没建的脚本，自动补上（两边都读完 host 之后）
  const ready = ideasStore.sync !== 'loading' && store.sync !== 'loading'
  useEffect(() => {
    if (ready) store.addMany(missingScripts(scripts, ideas))
  }, [ready, ideas, scripts, store.addMany])

  const visible = useMemo(() => filterScripts(scripts, { status, query }), [scripts, status, query])
  const counts = useMemo(() => {
    const m = {}
    for (const it of ideas) if (it.script && !it.archived) m[it.script] = (m[it.script] || 0) + 1
    return m
  }, [ideas])
  const selected = scripts.find(s => s.id === selectedId) || visible[0] || null
  useEffect(() => { if (selected) try { localStorage.setItem(SEL_KEY, selected.id) } catch { /* ignore */ } }, [selected?.id])
  const taken = useMemo(() => new Set(scripts.filter(s => s.id !== selected?.id).map(s => s.title)), [scripts, selected?.id])
  const linked = useMemo(
    () => (selected ? ideas.filter(it => it.script === selected.title && !it.archived).sort((a, b) => a.createdAt - b.createdAt) : []),
    [ideas, selected?.title],
  )

  const create = useCallback(name => {
    const s = store.create(name)
    setSelectedId(s.id)
    setStatus('')
    setQuery('')
  }, [store.create])

  const rename = useCallback((s, title) => {
    store.update(s.id, { title })
    for (const it of ideas) if (it.script === s.title) ideasStore.update(it.id, { script: title })
  }, [ideas, store.update, ideasStore.update])

  const setBody = useCallback((s, body) => store.update(s.id, { body }), [store.update])

  const setScriptStatus = useCallback((s, st) => {
    if (st === s.status) return
    store.update(s.id, { status: st })
    // 完成：这个脚本下还没完稿的灵感一起标记完稿
    if (st === 'done') {
      const now = Date.now()
      for (const it of ideas) if (it.script === s.title && !it.done && !it.archived) ideasStore.update(it.id, { done: true, doneAt: now })
    }
  }, [ideas, store.update, ideasStore.update])

  const del = useCallback(s => {
    const n = counts[s.title] || 0
    if (!window.confirm(`删除脚本「${s.title}」？${n ? `\n它下面的 ${n} 条灵感不会删除，只是不再属于这个脚本。` : ''}`)) return
    for (const it of ideas) if (it.script === s.title) ideasStore.update(it.id, { script: undefined })
    store.remove(s.id)
    setSelectedId('')
  }, [ideas, counts, store.remove, ideasStore.update])

  const insert = useCallback(idea => {
    if (!selected) return
    const piece = snippetFor(idea)
    if (!piece) return
    const el = bodyRef.current
    const body = selected.body
    const at = el && document.activeElement === el ? el.selectionStart : (el?.dataset.caret ? Number(el.dataset.caret) : body.length)
    const before = body.slice(0, at)
    const after = body.slice(at)
    const pre = before && !before.endsWith('\n') ? '\n' : ''
    const post = after && !after.startsWith('\n') ? '\n' : ''
    const next = before + pre + piece + post + after
    store.update(selected.id, { body: next })
    const caret = (before + pre + piece).length
    requestAnimationFrame(() => {
      const t = bodyRef.current
      if (!t) return
      t.focus({ preventScroll: true })
      t.setSelectionRange(caret, caret)
      t.dataset.caret = String(caret)
    })
  }, [selected, store.update])

  // 记住光标位置：点右边「插入」时文本框已经失焦
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const remember = () => { el.dataset.caret = String(el.selectionStart) }
    el.addEventListener('blur', remember)
    return () => el.removeEventListener('blur', remember)
  }, [selected?.id])

  const detach = useCallback(it => ideasStore.update(it.id, { script: undefined }), [ideasStore.update])
  const attach = useCallback(it => { if (selected) ideasStore.update(it.id, { script: selected.title }) }, [selected, ideasStore.update])

  if (ready && !scripts.length) return <div className="wk-scripts-empty"><EmptyState onCreate={create} /></div>

  return (
    <div className="wk-scripts">
      <ScriptList scripts={visible} counts={counts} selectedId={selected?.id} onSelect={setSelectedId} onCreate={() => create('')}
        status={status} setStatus={setStatus} query={query} setQuery={setQuery} total={scripts.length} />
      {selected ? (
        <>
          <ScriptEditor script={selected} taken={taken} onRename={rename} onBody={setBody} onStatus={setScriptStatus}
            onDelete={del} bodyRef={bodyRef} linkedCount={linked.filter(it => !it.done).length} />
          <Materials script={selected} linked={linked} allIdeas={ideas} onInsert={insert} onDetach={detach} onAttach={attach} onGather={onGather} />
        </>
      ) : (
        <section className="wk-sc-editor wk-sc-placeholder">{scripts.length ? '在左边选一个脚本' : '正在读取…'}</section>
      )}
    </div>
  )
}
