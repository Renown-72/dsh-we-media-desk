// 灵感页：周表（本周概览）+ 画布 / 信息流两种视图，共用一套筛选；
// 底部 ＋ 打开录入框；记下新灵感或点“相关”时，把相关的旧灵感找出来。
import React from 'react'
import { KINDS, sortIdeas, filterIdeas, collectTags, collectScripts, countKinds, splitHashtags } from '../../src/ideas.js'
import { useIdeas } from './useIdeas.js'
import { Composer, mediaFilesOf } from './Composer.jsx'
import { WeekBoard } from './WeekBoard.jsx'
import { IdeaCard } from './IdeaCard.jsx'
import { FeedView } from './FeedView.jsx'
import { CanvasView } from './CanvasView.jsx'
import { relatedIdeas } from './related.js'
import { periodStats } from './stats.js'
import { clusterGroups, pickLabel } from './cluster.js'
import { autoPlace, toWorld, cardSize, rectOf, findFreeSpot, boardRect, overlapsBoard, BOARD_SIZE } from './layout.js'
import { Icon } from '../icons.jsx'

const { useState, useMemo, useEffect, useRef, useCallback } = React

const MODE_KEY = 'we-media-desk:ideas-mode'
const CANVAS_KEY = 'we-media-desk:canvas-view'
const BOARD_KEY = 'we-media-desk:board-center'
const BOARD_H_KEY = 'we-media-desk:board-heights'
const OLD_HERO_KEY = 'we-media-desk:hero-pos' // 旧版首屏的左上角位置（600×340）
const HIGHLIGHT_MS = 2400
const DEFAULT_VIEW = { x: 0, y: 0, zoom: 0.9 }
const KIND_ICON = { text: 'text', image: 'image', link: 'link', video: 'play' }

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function isEditable(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function labelOf(it) {
  const s = (it.text || it.preview?.title || it.url || '').replace(/\s+/g, ' ').trim()
  return s.length > 16 ? s.slice(0, 16) + '…' : s
}

function validPoint(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y)
}

// ---- 浮动组件 ----

function SyncPill({ sync }) {
  const map = {
    loading: { cls: 'is-loading', text: '连接中' },
    host: { cls: 'is-ok', text: '已同步' },
    local: { cls: 'is-local', text: '仅本地保存' },
  }
  const m = map[sync] || map.loading
  return (
    <span className={'wk-sync-pill ' + m.cls}
      title={sync === 'local' ? '没连上 DSH 后台：灵感暂存在本浏览器，图片和视频无法上传' : sync === 'host' ? '灵感已保存到本机的 DSH 数据目录' : ''}>
      <span className="wk-dot" />{m.text}
    </span>
  )
}

function FilterPanel({ query, setQuery, tags, activeTag, setActiveTag, showArchived, setShowArchived, archivedCount, onClear, searchRef }) {
  return (
    <div className="wk-popover" onPointerDown={e => e.stopPropagation()}>
      <label className="wk-search">
        <Icon name="search" size={15} />
        <input ref={searchRef} value={query} placeholder="搜索文字、标签、链接标题" onChange={e => setQuery(e.target.value)} />
        {query && <button className="wk-icon-btn sm" onClick={() => setQuery('')} title="清空"><Icon name="close" size={13} /></button>}
      </label>
      <div className="wk-pop-section">
        <div className="wk-pop-title">标签</div>
        {tags.length ? (
          <div className="wk-pop-tags">
            {tags.map(t => (
              <button key={t.tag} className={'wk-chip' + (activeTag === t.tag ? ' is-active' : '')}
                onClick={() => setActiveTag(activeTag === t.tag ? '' : t.tag)}>#{t.tag}<span className="wk-chip-count">{t.count}</span></button>
            ))}
          </div>
        ) : <div className="wk-pop-empty">在灵感里写 #标签 就会出现在这里</div>}
      </div>
      <div className="wk-pop-foot">
        <label className="wk-switch">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          <span className="wk-switch-track" />显示归档{archivedCount ? `（${archivedCount}）` : ''}
        </label>
        <button className="wk-btn-text" onClick={onClear}>清除筛选</button>
      </div>
    </div>
  )
}

// 汇聚面板：选几个脚本 / 标签，画布上把它们的灵感各聚成一簇
function GatherPanel({ scripts, tags, picks, onToggle, onClear }) {
  const on = (type, value) => picks.some(p => p.type === type && p.value === value)
  return (
    <div className="wk-popover" onPointerDown={e => e.stopPropagation()}>
      <div className="wk-pop-note">选几个脚本或标签，画布上会把它们的灵感各聚成一簇；同时属于几个的，聚在它们中间。</div>
      <div className="wk-pop-section">
        <div className="wk-pop-title">脚本</div>
        {scripts.length ? (
          <div className="wk-pop-tags">
            {scripts.map(s => (
              <button key={s.script} className={'wk-chip' + (on('script', s.script) ? ' is-active' : '')} onClick={() => onToggle({ type: 'script', value: s.script })}>
                <Icon name="docs" size={12} />{s.script}<span className="wk-chip-count">{s.count}</span>
              </button>
            ))}
          </div>
        ) : <div className="wk-pop-empty">记灵感时在「脚本」小框里选一个，就会出现在这里</div>}
      </div>
      <div className="wk-pop-section">
        <div className="wk-pop-title">标签</div>
        {tags.length ? (
          <div className="wk-pop-tags">
            {tags.map(t => (
              <button key={t.tag} className={'wk-chip' + (on('tag', t.tag) ? ' is-active' : '')} onClick={() => onToggle({ type: 'tag', value: t.tag })}>
                #{t.tag}<span className="wk-chip-count">{t.count}</span>
              </button>
            ))}
          </div>
        ) : <div className="wk-pop-empty">还没有标签</div>}
      </div>
      <div className="wk-pop-foot">
        <span className="wk-pop-sum">{picks.length ? '已选 ' + picks.map(pickLabel).join('、') : '还没选'}</span>
        <button className="wk-btn-text" onClick={onClear} disabled={!picks.length}>散开</button>
      </div>
    </div>
  )
}

function Toasts({ uploads, onDismiss }) {
  if (!uploads.length) return null
  return (
    <div className="wk-float wk-toasts">
      {uploads.map(u => (
        <div key={u.id} className={'wk-toast' + (u.error ? ' is-error' : '')}>
          <Icon name={u.error ? 'cloudOff' : 'attach'} size={15} />
          <div className="wk-toast-main">
            <div className="wk-toast-name">{u.name}</div>
            {u.error
              ? <div className="wk-toast-sub">{u.error}</div>
              : <div className="wk-progress"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>}
          </div>
          {u.error && <button className="wk-icon-btn sm" onClick={() => onDismiss(u.id)} title="关闭"><Icon name="close" size={13} /></button>}
        </div>
      ))}
    </div>
  )
}

// ---- 灵感页 ----

export function IdeasPanel() {
  const placeRef = useRef(null)
  const store = useIdeas({ placeRef })
  const { ideas } = store
  const ideasRef = useRef(ideas)
  ideasRef.current = ideas

  const [mode, setMode] = useState(() => (readLocal(MODE_KEY, 'canvas') === 'feed' ? 'feed' : 'canvas'))
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [kinds, setKinds] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [lightbox, setLightbox] = useState('')
  const [dropping, setDropping] = useState(false)
  const [highlight, setHighlight] = useState('')   // 刚记下的灵感，短暂高亮
  const [related, setRelated] = useState(null)     // { anchorId, ids, label }
  const [picks, setPicks] = useState([])            // 汇聚：[{ type: 'script' | 'tag', value }]
  const [gatherOpen, setGatherOpen] = useState(false)
  const [captureScript, setCaptureScript] = useState('') // 录入框里选的脚本，连续记录时保留
  const [homeTick, setHomeTick] = useState(0)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [boardUnit, setBoardUnit] = useState(() => {
    try { return localStorage.getItem('we-media-desk:board-unit') === 'month' ? 'month' : 'week' } catch { return 'week' }
  })
  const changeUnit = useCallback(u => {
    setBoardUnit(u)
    setWeekOffset(0)
    try { localStorage.setItem('we-media-desk:board-unit', u) } catch { /* ignore */ }
  }, [])
  const [detailId, setDetailId] = useState('')      // 信息流里从周表点开的灵感
  const [focus, setFocus] = useState(null)           // 画布上要飞过去的卡片 { id, n }
  const composerRef = useRef(null)
  const searchRef = useRef(null)

  const [view, setView] = useState(() => {
    const v = readLocal(CANVAS_KEY, null)
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) ? v : null
  })
  const setCanvasView = useCallback(u => setView(v => (typeof u === 'function' ? u(v || DEFAULT_VIEW) : u)), [])
  const viewportRef = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view

  // 画布上量到的卡片实际尺寸；变化时重新排版
  const sizesRef = useRef({})
  const [sizeTick, setSizeTick] = useState(0)
  const onMeasure = useCallback(batch => {
    let changed = false
    for (const [id, m] of Object.entries(batch)) {
      const old = sizesRef.current[id]
      if (!old || old.w !== m.w || Math.abs(old.h - m.h) > 2) { sizesRef.current[id] = m; changed = true }
    }
    if (changed) setSizeTick(t => t + 1)
  }, [])

  // 周表在画布上的位置（中心点）。沿用旧版首屏的中心，没有就放在原点
  const [boardCenter] = useState(() => {
    const c = readLocal(BOARD_KEY, null)
    if (validPoint(c)) return c
    const old = readLocal(OLD_HERO_KEY, null)
    const center = validPoint(old) ? { x: old.x + 300, y: old.y + 170 } : { x: 0, y: 0 }
    writeLocal(BOARD_KEY, center)
    return center
  })
  // 周表的实际高度（周 / 月、灵感多少都会变），量到后再算周围卡片的避让
  // 周、月两种高度都记下来，占位取较高的那个——来回切换时周围的卡片不用跟着挪来挪去
  const [boardHs, setBoardHs] = useState(() => readLocal(BOARD_H_KEY, null) || {})
  const onBoardHeight = useCallback(h => {
    if (!(h > 0)) return
    setBoardHs(prev => {
      if (Math.abs((prev[boardUnit] || 0) - h) <= 1) return prev
      const next = { ...prev, [boardUnit]: Math.round(h) }
      writeLocal(BOARD_H_KEY, next)
      return next
    })
  }, [boardUnit])
  const boardH = Math.max(boardHs.week || 0, boardHs.month || 0) || 520
  const hero = useMemo(() => boardRect(boardCenter, boardH), [boardCenter, boardH])

  // 压在周表上的卡片（比如周表变大了、或者被拖上去）挪到旁边的空位
  useEffect(() => {
    if (mode !== 'canvas' || store.sync === 'loading') return
    const ids = overlapsBoard(ideas, hero, sizesRef.current)
    if (ids.length) store.unplace(ids)
  }, [mode, ideas, hero, sizeTick, store.sync, store.unplace])

  useEffect(() => { writeLocal(MODE_KEY, mode) }, [mode])
  useEffect(() => {
    if (!view) return
    const t = setTimeout(() => writeLocal(CANVAS_KEY, view), 300)
    return () => clearTimeout(t)
  }, [view])

  // 第一次打开画布：周表放在视野中央，缩放到正好看全
  useEffect(() => {
    if (mode !== 'canvas' || view || !viewportRef.current) return
    const el = viewportRef.current
    const zoom = Math.min(1, (el.clientHeight - 150) / hero.h, (el.clientWidth - 80) / BOARD_SIZE.w)
    setView({ zoom, x: Math.round(el.clientWidth / 2 - (hero.x + hero.w / 2) * zoom), y: Math.round(el.clientHeight / 2 - (hero.y + hero.h / 2) * zoom) })
  }, [mode, view, hero])

  // 画布：给还没有位置的灵感自动找空位（围着首屏）。
  // 先按估算尺寸摆出来，量到实际尺寸后重新排，再保存——这样不会重叠。
  const positions = useMemo(
    () => (hero ? autoPlace(ideas, { hero, sizes: sizesRef.current }) : {}),
    [ideas, hero, sizeTick], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => {
    if (mode !== 'canvas') return
    const ready = Object.fromEntries(Object.entries(positions).filter(([id]) => sizesRef.current[id]))
    if (Object.keys(ready).length) store.placeMany(ready)
  }, [mode, positions, store.placeMany])

  // 新灵感在画布上的位置：落点（拖放）或视野中央附近的空位，避开首屏
  const reserved = useRef([]) // 刚放下、还没进 state 的卡片，避免连续添加时叠在一起
  placeRef.current = (idea, hint) => {
    const el = viewportRef.current
    const v = viewRef.current
    if (mode !== 'canvas' || !el || !v) return undefined
    const rect = el.getBoundingClientRect()
    const anchor = hint?.point
      ? toWorld(v, hint.point.x - rect.left, hint.point.y - rect.top)
      : toWorld(v, el.clientWidth / 2, el.clientHeight / 2)
    const now = Date.now()
    reserved.current = reserved.current.filter(r => now - r.at < 3000)
    const obstacles = [
      ...ideasRef.current.filter(it => it.pos).map(it => rectOf(it, it.pos, sizesRef.current)),
      ...reserved.current,
    ]
    if (hero) obstacles.push(hero)
    const size = cardSize(idea)
    const pos = findFreeSpot(size, anchor, obstacles)
    reserved.current.push({ ...pos, ...size, at: now })
    return pos
  }

  const flash = useCallback(id => { if (id) setHighlight(id) }, [])
  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(''), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [highlight])

  const showRelated = useCallback((anchor, { always = false } = {}) => {
    const ids = relatedIdeas(ideasRef.current, anchor)
    if (!ids.length && !always) { setRelated(null); return }
    setRelated({ anchorId: anchor.id, ids, label: labelOf(anchor) })
  }, [])

  const addText = useCallback((input, tags = [], point, script) => {
    // 粘贴、拖入的文字里也可能带 #标签
    const parts = splitHashtags(input)
    const idea = store.addFromInput(parts.text, { tags: [...tags, ...parts.tags], script, hint: point && { point } })
    flash(idea.id)
    showRelated(idea)
    return idea
  }, [store.addFromInput, flash, showRelated])

  const addFiles = useCallback(async (files, opts = {}, point) => {
    const added = await store.addFiles(files, { ...opts, hint: point && { point } })
    if (added.length) flash(added[added.length - 1].id)
    return added
  }, [store.addFiles, flash])

  // ＋ 弹出的录入框：记下后自动收起
  const onCaptureText = useCallback((text, tags, script) => { const it = addText(text, tags, undefined, script); setCaptureOpen(false); return it }, [addText])
  const onCaptureFiles = useCallback((files, opts) => { setCaptureOpen(false); return addFiles(files, opts) }, [addFiles])
  useEffect(() => { if (captureOpen) setTimeout(() => composerRef.current?.focus(), 30) }, [captureOpen])

  // 从周表点开某条灵感：画布上飞过去，信息流里弹出卡片
  const openIdea = useCallback(id => {
    if (modeRef.current === 'canvas' && canvasIdsRef.current.has(id)) {
      setFocus(f => ({ id, n: (f?.n || 0) + 1 }))
      setHighlight(id)
    } else {
      setDetailId(id)
    }
  }, [])

  // 页面任意处粘贴（输入框内的粘贴交给输入框自己处理）
  useEffect(() => {
    function onPaste(e) {
      if (isEditable(document.activeElement)) return
      const files = mediaFilesOf(e.clipboardData)
      if (files.length) { e.preventDefault(); addFiles(files); return }
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text) { e.preventDefault(); try { addText(text) } catch { /* 空内容忽略 */ } }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addFiles, addText])

  // 快捷键：Esc 依次关大图、卡片、录入框、筛选、相关；/ 打开搜索；N 记灵感
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox('')
        else if (detailId) setDetailId('')
        else if (captureOpen) setCaptureOpen(false)
        else if (filterOpen) setFilterOpen(false)
        else if (gatherOpen) setGatherOpen(false)
        else if (related) setRelated(null)
        else if (picks.length) setPicks([])
        return
      }
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(document.activeElement)) {
        e.preventDefault()
        setCaptureOpen(true)
        return
      }
      if (e.key === '/' && !isEditable(document.activeElement)) {
        e.preventDefault()
        setFilterOpen(true)
        setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox, related, filterOpen, gatherOpen, picks, captureOpen, detailId])

  // 点面板外面时收起
  useEffect(() => {
    if (!filterOpen) return
    const close = e => { if (!e.target.closest('.wk-filter-wrap')) setFilterOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [filterOpen])
  useEffect(() => {
    if (!gatherOpen) return
    const close = e => { if (!e.target.closest('.wk-gather-wrap')) setGatherOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [gatherOpen])
  useEffect(() => {
    if (!captureOpen) return
    const close = e => { if (!e.target.closest('.wk-capture, .wk-fab')) setCaptureOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [captureOpen])

  // 相关的灵感被删掉时同步更新
  useEffect(() => {
    if (!related) return
    const ids = new Set(ideas.map(it => it.id))
    if (!ids.has(related.anchorId)) { setRelated(null); return }
    if (related.ids.some(id => !ids.has(id))) setRelated(r => ({ ...r, ids: r.ids.filter(id => ids.has(id)) }))
  }, [ideas, related])

  // 拖入文件 / 链接
  function onDragOver(e) {
    const types = [...(e.dataTransfer?.types || [])]
    if (!types.includes('Files') && !types.includes('text/uri-list') && !types.includes('text/plain')) return
    e.preventDefault()
    setDropping(true)
  }
  function onDrop(e) {
    e.preventDefault()
    setDropping(false)
    const point = { x: e.clientX, y: e.clientY }
    const files = mediaFilesOf(e.dataTransfer)
    if (files.length) { addFiles(files, {}, point); return }
    const text = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n').find(l => l && !l.startsWith('#'))
    if (text) { try { addText(text.trim(), [], point) } catch { /* ignore */ } }
  }

  const stats = useMemo(() => periodStats(ideas, { offset: weekOffset, unit: boardUnit }), [ideas, weekOffset, boardUnit])
  const tags = useMemo(() => collectTags(ideas), [ideas])
  const scripts = useMemo(() => collectScripts(ideas), [ideas])
  const tagNames = useMemo(() => tags.map(t => t.tag), [tags])
  const scriptNames = useMemo(() => scripts.map(s => s.script), [scripts])
  const kindCounts = useMemo(() => countKinds(ideas), [ideas])
  const visible = useMemo(
    () => sortIdeas(filterIdeas(ideas, { query, tag: activeTag, kinds, includeArchived: showArchived })),
    [ideas, query, activeTag, kinds, showArchived]
  )
  const byId = useMemo(() => new Map(ideas.map(it => [it.id, it])), [ideas])
  const relatedItems = useMemo(() => (related ? related.ids.map(id => byId.get(id)).filter(Boolean) : []), [related, byId])
  // 画布在相关模式下，相关卡片即使被筛选掉也要显示
  const canvasItems = useMemo(() => {
    if (!related) return visible
    const shown = new Set(visible.map(it => it.id))
    const extra = [related.anchorId, ...related.ids].filter(id => !shown.has(id)).map(id => byId.get(id)).filter(Boolean)
    return extra.length ? [...visible, ...extra] : visible
  }, [visible, related, byId])

  // 汇聚：只在画布上生效；和“相关”互斥
  const cluster = useMemo(() => (mode === 'canvas' && picks.length && !related ? { picks, groups: clusterGroups(canvasItems, picks) } : null), [mode, picks, related, canvasItems])
  const togglePick = useCallback(p => {
    setRelated(null)
    setPicks(prev => (prev.some(x => x.type === p.type && x.value === p.value) ? prev.filter(x => !(x.type === p.type && x.value === p.value)) : [...prev, p]))
  }, [])
  const closeCluster = useCallback(() => setPicks([]), [])
  useEffect(() => { if (mode !== 'canvas') { setPicks([]); setGatherOpen(false) } }, [mode])

  const archivedCount = useMemo(() => ideas.filter(i => i.archived).length, [ideas])
  const totalCount = ideas.length - archivedCount
  const modeRef = useRef(mode)
  modeRef.current = mode
  const canvasIdsRef = useRef(new Set())
  canvasIdsRef.current = new Set(canvasItems.map(it => it.id))
  const filterCount = (query ? 1 : 0) + (activeTag ? 1 : 0) + (showArchived ? 1 : 0)

  function toggleKind(id) {
    setKinds(prev => (prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]))
  }
  function clearFilters() {
    setQuery(''); setActiveTag(''); setKinds([]); setShowArchived(false)
  }
  function compose() {
    setCaptureOpen(v => !v)
  }

  const onRelated = useCallback(id => {
    const it = ideasRef.current.find(x => x.id === id)
    if (it) showRelated(it, { always: true })
  }, [showRelated])
  const closeRelated = useCallback(() => setRelated(null), [])
  const prevWeek = useCallback(() => setWeekOffset(o => o - 1), [])
  const nextWeek = useCallback(() => setWeekOffset(o => Math.min(0, o + 1)), [])
  const thisWeek = useCallback(() => setWeekOffset(0), [])
  const pickTag = useCallback(t => { setActiveTag(t); setFilterOpen(true) }, [])
  // 卡片上点脚本：画布里把这个脚本的灵感汇聚过来；信息流里按它搜索
  const pickScript = useCallback(name => {
    if (modeRef.current === 'canvas') { setRelated(null); setPicks([{ type: 'script', value: name }]) } else setQuery(name)
  }, [])

  // 保持稳定，卡片才能跳过不必要的重绘
  const cardProps = useMemo(() => ({
    onPin: store.togglePin,
    onArchive: store.toggleArchive,
    onDelete: store.remove,
    onEdit: store.update,
    onOpenImage: setLightbox,
    onTag: pickTag,
    onScript: pickScript,
    onRelated,
    onDone: store.toggleDone,
  }), [store.togglePin, store.toggleArchive, store.remove, store.update, store.toggleDone, onRelated, pickTag, pickScript])

  const boardNode = (
    <WeekBoard
      stats={stats}
      onPrev={prevWeek}
      onNext={nextWeek}
      onThisWeek={thisWeek}
      onUnit={changeUnit}
      onHeight={mode === 'canvas' ? onBoardHeight : undefined}
      onOpenIdea={openIdea}
    />
  )
  const emptyText = ideas.length === 0 ? '还没有灵感，点下方的 ＋ 记下第一条' : '没有符合筛选条件的灵感'
  const detail = detailId && ideas.find(it => it.id === detailId)

  return (
    <div
      className={'wk-ideas is-' + mode + (dropping ? ' is-dropping' : '')}
      onDragOver={onDragOver}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false) }}
      onDrop={onDrop}
    >
      {mode === 'canvas' ? (
        <CanvasView
          items={canvasItems}
          positions={positions}
          view={view || DEFAULT_VIEW}
          setView={setCanvasView}
          viewportRef={viewportRef}
          cardProps={cardProps}
          onMove={store.move}
          related={related}
          onCloseRelated={closeRelated}
          cluster={cluster}
          onCloseCluster={closeCluster}
          highlight={highlight}
          board={hero}
          boardNode={boardNode}
          homeTick={homeTick}
          focus={focus}
          sizes={sizesRef.current}
          onMeasure={onMeasure}
        />
      ) : (
        <div className="wk-feed-scroll">
          <div className="wk-feed-hero">{boardNode}</div>
          <div className="wk-feed-wrap">
            <FeedView
              items={visible}
              cardProps={cardProps}
              related={related}
              relatedItems={relatedItems}
              anchor={related?.label}
              onCloseRelated={closeRelated}
              highlight={highlight}
              emptyText={emptyText}
            />
          </div>
        </div>
      )}

      <datalist id="wk-script-options">{scriptNames.map(n => <option key={n} value={n} />)}</datalist>

      {/* 右上：同步状态 + 汇聚 + 筛选 */}
      <div className="wk-float wk-topright">
        <SyncPill sync={store.sync} />
        {mode === 'canvas' && (
          <div className="wk-filter-wrap wk-gather-wrap">
            <button className={'wk-pill-btn' + (gatherOpen || picks.length ? ' is-on' : '')} onClick={() => { setGatherOpen(v => !v); setFilterOpen(false) }} title="按脚本、标签汇聚">
              <Icon name="cluster" size={15} />汇聚{picks.length ? <span className="wk-badge">{picks.length}</span> : null}
            </button>
            {gatherOpen && <GatherPanel scripts={scripts} tags={tags} picks={picks} onToggle={togglePick} onClear={closeCluster} />}
          </div>
        )}
        <div className="wk-filter-wrap">
          <button className={'wk-pill-btn' + (filterOpen || filterCount ? ' is-on' : '')} onClick={() => setFilterOpen(v => !v)} title="筛选（/）">
            <Icon name="sliders" size={15} />筛选{filterCount ? <span className="wk-badge">{filterCount}</span> : null}
          </button>
          {filterOpen && (
            <FilterPanel
              query={query} setQuery={setQuery}
              tags={tags} activeTag={activeTag} setActiveTag={setActiveTag}
              showArchived={showArchived} setShowArchived={setShowArchived}
              archivedCount={archivedCount} onClear={clearFilters} searchRef={searchRef}
            />
          )}
        </div>
      </div>

      {/* 底部：视图切换 + 类型 + 记灵感 */}
      <div className="wk-float wk-dock" role="toolbar" aria-label="灵感视图">
        <div className="wk-seg">
          <button className={'wk-seg-btn' + (mode === 'canvas' ? ' is-active' : '')} onClick={() => setMode('canvas')} title="画布">
            <Icon name="canvas" size={16} />
          </button>
          <button className={'wk-seg-btn' + (mode === 'feed' ? ' is-active' : '')} onClick={() => setMode('feed')} title="信息流">
            <Icon name="feed" size={16} />
          </button>
        </div>
        <span className="wk-sep" />
        <div className="wk-kinds">
          <button className={'wk-kind' + (kinds.length === 0 ? ' is-active' : '')} onClick={() => setKinds([])}>全部</button>
          {KINDS.map(k => (
            <button key={k.id} className={'wk-kind' + (kinds.includes(k.id) ? ' is-active' : '')} onClick={() => toggleKind(k.id)}
              title={`${k.label} ${kindCounts[k.id] || 0} 条`}>
              <Icon name={KIND_ICON[k.id]} size={13} />{k.label}
            </button>
          ))}
        </div>
        <span className="wk-sep" />
        <button className={'wk-fab' + (captureOpen ? ' is-open' : '')} onClick={compose} title="记下灵感（N）"><Icon name="plus" size={20} stroke={2.2} /></button>
      </div>

      {captureOpen && (
        <div className="wk-capture" role="dialog" aria-label="记下灵感">
          <Composer ref={composerRef} onText={onCaptureText} onFiles={onCaptureFiles}
            scripts={scriptNames} tagOptions={tagNames} script={captureScript} onScript={setCaptureScript} />
        </div>
      )}

      {(activeTag || query || kinds.length > 0) && !filterOpen && (
        <div className="wk-float wk-filter-note">
          显示 {visible.length} / {totalCount} 条
          {activeTag && <span className="wk-hint-tag">#{activeTag}</span>}
          {query && <span className="wk-hint-tag">“{query}”</span>}
          <button className="wk-btn-text" onClick={clearFilters}>清除</button>
        </div>
      )}

      <Toasts uploads={store.uploads} onDismiss={store.dismissUpload} />

      {dropping && <div className="wk-dropzone"><Icon name="attach" size={22} />松手添加到灵感</div>}

      {detail && (
        <div className="wk-modal" onPointerDown={e => { if (e.target === e.currentTarget) setDetailId('') }}>
          <div className="wk-modal-card">
            <IdeaCard idea={detail} variant="feed" {...cardProps} />
          </div>
        </div>
      )}

      {lightbox && (
        <div className="wk-lightbox" onClick={() => setLightbox('')}>
          <img src={lightbox} alt="" referrerPolicy="no-referrer" />
          <button className="wk-icon-btn wk-lightbox-close" title="关闭（Esc）"><Icon name="close" size={18} /></button>
        </div>
      )}
    </div>
  )
}
