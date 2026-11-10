// 灵感页：录入多种形式的灵感，信息流 / 画布两种视图，共用一套筛选。
import React from 'react'
import { KINDS, sortIdeas, filterIdeas, collectTags, countKinds } from '../../src/ideas.js'
import { useIdeas } from './useIdeas.js'
import { Composer, mediaFilesOf } from './Composer.jsx'
import { FeedView } from './FeedView.jsx'
import { CanvasView } from './CanvasView.jsx'
import { autoPlace, toWorld, CARD_W, GAP } from './layout.js'

const { useState, useMemo, useEffect, useRef, useCallback } = React

const MODE_KEY = 'we-media-desk:ideas-mode'
const CANVAS_KEY = 'we-media-desk:canvas-view'

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

export function IdeasPanel() {
  const store = useIdeas()
  const { ideas } = store

  const [mode, setMode] = useState(() => (readLocal(MODE_KEY, 'feed') === 'canvas' ? 'canvas' : 'feed'))
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [kinds, setKinds] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [lightbox, setLightbox] = useState('')
  const [dropping, setDropping] = useState(false)

  const [view, setView] = useState(() => {
    const v = readLocal(CANVAS_KEY, null)
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) ? v : { x: 40, y: 40, zoom: 1 }
  })
  const viewportRef = useRef(null)

  useEffect(() => { writeLocal(MODE_KEY, mode) }, [mode])
  useEffect(() => {
    const t = setTimeout(() => writeLocal(CANVAS_KEY, view), 300)
    return () => clearTimeout(t)
  }, [view])

  // 画布：给还没有位置的灵感自动摆位，并保存下来
  const positions = useMemo(() => autoPlace(ideas), [ideas])
  useEffect(() => {
    if (mode === 'canvas' && Object.keys(positions).length) store.placeMany(positions)
  }, [mode, positions, store.placeMany])

  // 新灵感在画布上的位置：落点（拖放）或当前视野中央
  const posFor = useCallback((point) => (i = 0) => {
    if (mode !== 'canvas' || !viewportRef.current) return undefined
    const el = viewportRef.current
    const rect = el.getBoundingClientRect()
    const sx = point ? point.x - rect.left : el.clientWidth / 2 - (CARD_W * view.zoom) / 2
    const sy = point ? point.y - rect.top : el.clientHeight / 3
    const p = toWorld(view, sx, sy)
    return { x: p.x + i * (CARD_W + GAP), y: p.y }
  }, [mode, view])

  const addText = useCallback((input, tags, point) => store.addFromInput(input, { tags, pos: posFor(point)(0) }), [store.addFromInput, posFor])
  const addFiles = useCallback((files, opts = {}, point) => store.addFiles(files, { ...opts, posFor: posFor(point) }), [store.addFiles, posFor])

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

  useEffect(() => {
    if (!lightbox) return
    const onKey = e => { if (e.key === 'Escape') setLightbox('') }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

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
  const archivedCount = useMemo(() => ideas.filter(i => i.archived).length, [ideas])
  const filtering = Boolean(query || activeTag || kinds.length)

  function toggleKind(id) {
    setKinds(prev => (prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]))
  }
  function clearFilters() {
    setQuery(''); setActiveTag(''); setKinds([])
  }

  const cardProps = {
    onPin: store.togglePin,
    onArchive: store.toggleArchive,
    onDelete: store.remove,
    onEdit: store.update,
    onOpenImage: setLightbox,
    onTag: t => setActiveTag(t),
  }

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
        visible.length ? <FeedView items={visible} cardProps={cardProps} /> : <p className="wk-empty">{emptyText}</p>
      ) : (
        <CanvasView
          items={visible}
          positions={positions}
          view={view}
          setView={setView}
          viewportRef={viewportRef}
          cardProps={cardProps}
          onMove={store.move}
          emptyText={emptyText}
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
