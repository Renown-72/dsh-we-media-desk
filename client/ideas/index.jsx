// 灵感页：首屏（日期、统计、录入框）+ 画布 / 信息流两种视图，共用一套筛选；
// 记下新灵感或点“相关”时，把相关的旧灵感找出来。
import React from 'react'
import { KINDS, sortIdeas, filterIdeas, collectTags, countKinds, splitHashtags } from '../../src/ideas.js'
import { useIdeas } from './useIdeas.js'
import { mediaFilesOf } from './Composer.jsx'
import { Hero } from './Hero.jsx'
import { FeedView } from './FeedView.jsx'
import { CanvasView } from './CanvasView.jsx'
import { relatedIdeas } from './related.js'
import { ideaStats } from './stats.js'
import { autoPlace, toWorld, cardSize, rectOf, findFreeSpot, placeHero, heroRect } from './layout.js'
import { Icon } from '../icons.jsx'

const { useState, useMemo, useEffect, useRef, useCallback } = React

const MODE_KEY = 'we-media-desk:ideas-mode'
const CANVAS_KEY = 'we-media-desk:canvas-view'
const HERO_KEY = 'we-media-desk:hero-pos'
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
  const [homeTick, setHomeTick] = useState(0)
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

  // 首屏在画布上的位置：第一次打开画布时在原点附近找空位，之后固定
  const [heroPos, setHeroPos] = useState(() => {
    const p = readLocal(HERO_KEY, null)
    return validPoint(p) ? p : null
  })
  useEffect(() => {
    if (mode !== 'canvas' || heroPos || store.sync === 'loading') return
    const p = placeHero(ideasRef.current, sizesRef.current)
    setHeroPos(p)
    writeLocal(HERO_KEY, p)
  }, [mode, heroPos, store.sync])
  const hero = useMemo(() => (heroPos ? heroRect(heroPos) : null), [heroPos])

  useEffect(() => { writeLocal(MODE_KEY, mode) }, [mode])
  useEffect(() => {
    if (!view) return
    const t = setTimeout(() => writeLocal(CANVAS_KEY, view), 300)
    return () => clearTimeout(t)
  }, [view])

  // 第一次打开画布：首屏放在视野中央
  useEffect(() => {
    if (mode !== 'canvas' || view || !hero || !viewportRef.current) return
    const el = viewportRef.current
    setView({ zoom: 1, x: Math.round(el.clientWidth / 2 - (hero.x + hero.w / 2)), y: Math.round(el.clientHeight / 2 - (hero.y + hero.h / 2)) })
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

  const addText = useCallback((input, tags = [], point) => {
    // 粘贴、拖入的文字里也可能带 #标签
    const parts = splitHashtags(input)
    const idea = store.addFromInput(parts.text, { tags: [...tags, ...parts.tags], hint: point && { point } })
    flash(idea.id)
    showRelated(idea)
    return idea
  }, [store.addFromInput, flash, showRelated])

  const addFiles = useCallback(async (files, opts = {}, point) => {
    const added = await store.addFiles(files, { ...opts, hint: point && { point } })
    if (added.length) flash(added[added.length - 1].id)
    return added
  }, [store.addFiles, flash])

  const onHeroText = useCallback((text, tags) => addText(text, tags), [addText])
  const onHeroFiles = useCallback((files, opts) => addFiles(files, opts), [addFiles])

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

  // 快捷键：Esc 依次关大图、筛选、相关；/ 打开搜索
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox('')
        else if (filterOpen) setFilterOpen(false)
        else if (related) setRelated(null)
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
  }, [lightbox, related, filterOpen])

  // 点筛选面板外面时收起
  useEffect(() => {
    if (!filterOpen) return
    const close = e => { if (!e.target.closest('.wk-filter-wrap')) setFilterOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [filterOpen])

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

  const stats = useMemo(() => ideaStats(ideas), [ideas])
  const tags = useMemo(() => collectTags(ideas), [ideas])
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

  const archivedCount = useMemo(() => ideas.filter(i => i.archived).length, [ideas])
  const filterCount = (query ? 1 : 0) + (activeTag ? 1 : 0) + (showArchived ? 1 : 0)

  function toggleKind(id) {
    setKinds(prev => (prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]))
  }
  function clearFilters() {
    setQuery(''); setActiveTag(''); setKinds([]); setShowArchived(false)
  }
  function compose() {
    if (mode === 'canvas') setHomeTick(t => t + 1)
    else document.querySelector('.wk-feed-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => composerRef.current?.focus(), mode === 'canvas' ? 350 : 200)
  }

  const onRelated = useCallback(id => {
    const it = ideasRef.current.find(x => x.id === id)
    if (it) showRelated(it, { always: true })
  }, [showRelated])
  const closeRelated = useCallback(() => setRelated(null), [])
  const pickTag = useCallback(t => { setActiveTag(t); setFilterOpen(true) }, [])

  // 保持稳定，卡片才能跳过不必要的重绘
  const cardProps = useMemo(() => ({
    onPin: store.togglePin,
    onArchive: store.toggleArchive,
    onDelete: store.remove,
    onEdit: store.update,
    onOpenImage: setLightbox,
    onTag: pickTag,
    onRelated,
  }), [store.togglePin, store.toggleArchive, store.remove, store.update, onRelated, pickTag])

  const heroNode = <Hero stats={stats} composerRef={composerRef} onText={onHeroText} onFiles={onHeroFiles} />
  const emptyText = ideas.length === 0 ? '还没有灵感，从上面记下第一条吧' : '没有符合筛选条件的灵感'

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
          highlight={highlight}
          heroPos={heroPos}
          hero={heroNode}
          homeTick={homeTick}
          sizes={sizesRef.current}
          onMeasure={onMeasure}
        />
      ) : (
        <div className="wk-feed-scroll">
          <div className="wk-feed-hero">{heroNode}</div>
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

      {/* 右上：同步状态 + 筛选 */}
      <div className="wk-float wk-topright">
        <SyncPill sync={store.sync} />
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
        <button className="wk-fab" onClick={compose} title="记下灵感"><Icon name="plus" size={20} stroke={2.2} /></button>
      </div>

      {(activeTag || query || kinds.length > 0) && !filterOpen && (
        <div className="wk-float wk-filter-note">
          显示 {visible.length} / {stats.total} 条
          {activeTag && <span className="wk-hint-tag">#{activeTag}</span>}
          {query && <span className="wk-hint-tag">“{query}”</span>}
          <button className="wk-btn-text" onClick={clearFilters}>清除</button>
        </div>
      )}

      <Toasts uploads={store.uploads} onDismiss={store.dismissUpload} />

      {dropping && <div className="wk-dropzone"><Icon name="attach" size={22} />松手添加到灵感</div>}

      {lightbox && (
        <div className="wk-lightbox" onClick={() => setLightbox('')}>
          <img src={lightbox} alt="" referrerPolicy="no-referrer" />
          <button className="wk-icon-btn wk-lightbox-close" title="关闭（Esc）"><Icon name="close" size={18} /></button>
        </div>
      )}
    </div>
  )
}
