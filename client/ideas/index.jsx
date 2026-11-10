// 灵感页：录入多种形式的灵感，信息流 / 画布两种视图，共用一套筛选；
// 记下新灵感或点“相关”时，把相关的旧灵感找出来。
import React from 'react'
import { KINDS, sortIdeas, filterIdeas, collectTags, countKinds } from '../../src/ideas.js'
import { useIdeas } from './useIdeas.js'
import { Composer, mediaFilesOf } from './Composer.jsx'
import { FeedView } from './FeedView.jsx'
import { CanvasView } from './CanvasView.jsx'
import { relatedIdeas } from './related.js'
import { autoPlace, toWorld, cardSize, rectOf, findFreeSpot } from './layout.js'

const { useState, useMemo, useEffect, useRef, useCallback } = React

const MODE_KEY = 'we-media-desk:ideas-mode'
const CANVAS_KEY = 'we-media-desk:canvas-view'
const HIGHLIGHT_MS = 2400
const DEFAULT_VIEW = { x: 0, y: 0, zoom: 0.9 }

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

export function IdeasPanel() {
  const placeRef = useRef(null)
  const store = useIdeas({ placeRef })
  const { ideas } = store
  const ideasRef = useRef(ideas)
  ideasRef.current = ideas

  const [mode, setMode] = useState(() => (readLocal(MODE_KEY, 'feed') === 'canvas' ? 'canvas' : 'feed'))
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [kinds, setKinds] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [lightbox, setLightbox] = useState('')
  const [dropping, setDropping] = useState(false)
  const [highlight, setHighlight] = useState('')   // 刚记下的灵感，短暂高亮
  const [related, setRelated] = useState(null)     // { anchorId, ids, label }

  const [view, setView] = useState(() => {
    const v = readLocal(CANVAS_KEY, null)
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) ? v : null
  })
  const viewportRef = useRef(null)
  // 视图还没初始化时，函数式更新从默认视图开始算
  const setCanvasView = useCallback(u => setView(v => (typeof u === 'function' ? u(v || DEFAULT_VIEW) : u)), [])
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => { writeLocal(MODE_KEY, mode) }, [mode])
  useEffect(() => {
    if (!view) return
    const t = setTimeout(() => writeLocal(CANVAS_KEY, view), 300)
    return () => clearTimeout(t)
  }, [view])

  // 第一次打开画布：让原点落在视野中央
  useEffect(() => {
    if (mode !== 'canvas' || view || !viewportRef.current) return
    const el = viewportRef.current
    setView({ x: el.clientWidth / 2, y: el.clientHeight / 2, zoom: 0.9 })
  }, [mode, view])

  // 画布：给还没有位置的灵感自动找空位，并保存下来
  const positions = useMemo(() => autoPlace(ideas), [ideas])
  useEffect(() => {
    if (mode === 'canvas' && Object.keys(positions).length) store.placeMany(positions)
  }, [mode, positions, store.placeMany])

  // 新灵感在画布上的位置：落点（拖放）或视野中央附近的空位
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
      ...ideasRef.current.filter(it => it.pos).map(it => rectOf(it, it.pos)),
      ...reserved.current,
    ]
    const size = cardSize(idea)
    const pos = findFreeSpot(size, anchor, obstacles)
    reserved.current.push({ ...pos, ...size, at: now })
    return pos
  }

  // 高亮刚记下的灵感（画布上它在视野外时，镜头会带过去）
  const flash = useCallback(id => {
    if (!id) return
    setHighlight(id)
  }, [])
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

  const addText = useCallback((input, tags, point) => {
    const idea = store.addFromInput(input, { tags, hint: point && { point } })
    flash(idea.id)
    showRelated(idea)
    return idea
  }, [store.addFromInput, flash, showRelated])

  const addFiles = useCallback(async (files, opts = {}, point) => {
    const added = await store.addFiles(files, { ...opts, hint: point && { point } })
    if (added.length) flash(added[added.length - 1].id)
    return added
  }, [store.addFiles, flash])

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

  // Esc：先关大图，再退出相关
  useEffect(() => {
    if (!lightbox && !related) return
    const onKey = e => {
      if (e.key !== 'Escape') return
      if (lightbox) setLightbox('')
      else setRelated(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox, related])

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
    if (text) { try { addText(text.trim(), '', point) } catch { /* ignore */ } }
  }

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
  const filtering = Boolean(query || activeTag || kinds.length)

  function toggleKind(id) {
    setKinds(prev => (prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]))
  }
  function clearFilters() {
    setQuery(''); setActiveTag(''); setKinds([])
  }

  const onRelated = useCallback(id => {
    const it = ideasRef.current.find(x => x.id === id)
    if (it) showRelated(it, { always: true })
  }, [showRelated])
  const closeRelated = useCallback(() => setRelated(null), [])

  // 保持稳定，卡片才能跳过不必要的重绘
  const cardProps = useMemo(() => ({
    onPin: store.togglePin,
    onArchive: store.toggleArchive,
    onDelete: store.remove,
    onEdit: store.update,
    onOpenImage: setLightbox,
    onTag: setActiveTag,
    onRelated,
  }), [store.togglePin, store.toggleArchive, store.remove, store.update, onRelated])

  const emptyText = ideas.length === 0 ? '还没有灵感，先记一条吧' : '没有匹配的灵感'

  return (
    <div
      className={'wk-panel wk-ideas' + (mode === 'canvas' ? ' is-canvas' : '') + (dropping ? ' is-dropping' : '')}
      onDragOver={onDragOver}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false) }}
      onDrop={onDrop}
    >
      <Composer
        onText={(text, t) => addText(text, t)}
        onFiles={(files, opts) => addFiles(files, opts)}
        uploads={store.uploads}
        onDismissUpload={store.dismissUpload}
      />
      {store.sync === 'local' && (
        <p className="wk-sync is-local">未连接到 DSH 后台，灵感暂时只保存在本浏览器，图片和视频无法上传。</p>
      )}

      {/* 视图切换 + 筛选 */}
      <div className="wk-toolbar">
        <div className="wk-seg">
          <button className={'wk-seg-btn' + (mode === 'feed' ? ' is-active' : '')} onClick={() => setMode('feed')}>信息流</button>
          <button className={'wk-seg-btn' + (mode === 'canvas' ? ' is-active' : '')} onClick={() => setMode('canvas')}>画布</button>
        </div>
        <div className="wk-kinds">
          {KINDS.map(k => (
            <button key={k.id} className={'wk-chip' + (kinds.includes(k.id) ? ' is-active' : '')} onClick={() => toggleKind(k.id)}>
              {k.label} {kindCounts[k.id] || 0}
            </button>
          ))}
        </div>
        <input
          className="wk-input wk-input-search"
          value={query}
          placeholder="搜索文字、标签、链接标题…"
          onChange={e => setQuery(e.target.value)}
        />
        {archivedCount > 0 && (
          <label className="wk-check">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            显示归档（{archivedCount}）
          </label>
        )}
      </div>

      {(tags.length > 0 || filtering) && (
        <div className="wk-tagbar">
          {tags.map(t => (
            <button key={t.tag} className={'wk-chip' + (activeTag === t.tag ? ' is-active' : '')}
              onClick={() => setActiveTag(activeTag === t.tag ? '' : t.tag)}>#{t.tag} {t.count}</button>
          ))}
          {filtering && (
            <button className="wk-chip wk-chip-clear" onClick={clearFilters}>清除筛选（{visible.length} 条）</button>
          )}
        </div>
      )}

      {mode === 'feed' ? (
        visible.length || related ? (
          <FeedView
            items={visible}
            cardProps={cardProps}
            related={related}
            relatedItems={relatedItems}
            anchor={related?.label}
            onCloseRelated={closeRelated}
            highlight={highlight}
          />
        ) : <p className="wk-empty">{emptyText}</p>
      ) : (
        <CanvasView
          items={canvasItems}
          positions={positions}
          view={view || DEFAULT_VIEW}
          setView={setCanvasView}
          viewportRef={viewportRef}
          cardProps={cardProps}
          onMove={store.move}
          emptyText={emptyText}
          related={related}
          onCloseRelated={closeRelated}
          highlight={highlight}
        />
      )}

      {lightbox && (
        <div className="wk-lightbox" onClick={() => setLightbox('')}>
          <img src={lightbox} alt="" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  )
}
