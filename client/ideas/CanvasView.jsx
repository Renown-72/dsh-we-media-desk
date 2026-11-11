// 画布（自由白板）：拖卡片摆位置；拖空白处平移（松手有惯性）；滚轮在鼠标处缩放，Shift+滚轮平移。
// 镜头移动带缓动；新灵感落在视野外时镜头会带过去；“相关”时相关卡片聚到中心卡片周围。
import React from 'react'
import { IdeaCard } from './IdeaCard.jsx'
import { clusterLayout } from './cluster.js'
import { Icon } from '../icons.jsx'
import {
  toWorld,
  cardSize, rectOf, tilt, zoomAt, fitRects, findFreeSpot, rectVisible, centerOn,
} from './layout.js'

const { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } = React

const DRAG_THRESHOLD = 3
// 在这些元素上按下时不拖卡片、不平移画布
const INTERACTIVE = 'a, button, video, textarea, input, label, .wk-editor'

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// 镜头动画：缓动到目标视图，或按初速度滑行后慢慢停下
function useCameraMotion(view, setView) {
  const viewRef = useRef(view)
  viewRef.current = view
  const m = useRef({ raf: 0, mode: null, cur: null, target: null, vx: 0, vy: 0, last: 0 })

  const stop = useCallback(() => {
    cancelAnimationFrame(m.current.raf)
    m.current.raf = 0
    m.current.mode = null
  }, [])

  const step = useCallback(now => {
    const s = m.current
    const dt = Math.min(48, now - s.last)
    s.last = now
    let v = s.cur
    let done = false
    if (s.mode === 'ease') {
      const k = 1 - Math.exp(-dt / 90)
      const t = s.target
      v = { x: v.x + (t.x - v.x) * k, y: v.y + (t.y - v.y) * k, zoom: v.zoom + (t.zoom - v.zoom) * k }
      if (Math.abs(t.x - v.x) < 0.5 && Math.abs(t.y - v.y) < 0.5 && Math.abs(t.zoom - v.zoom) < 0.001) { v = t; done = true }
    } else if (s.mode === 'glide') {
      v = { ...v, x: v.x + s.vx * dt, y: v.y + s.vy * dt }
      const decay = Math.exp(-dt / 280)
      s.vx *= decay
      s.vy *= decay
      if (Math.hypot(s.vx, s.vy) < 0.02) done = true
    }
    s.cur = v
    setView(v)
    if (done) { s.raf = 0; s.mode = null } else s.raf = requestAnimationFrame(step)
  }, [setView])

  const run = useCallback(mode => {
    const s = m.current
    s.mode = mode
    s.cur = viewRef.current
    if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(step) }
  }, [step])

  const animateTo = useCallback(target => {
    if (prefersReducedMotion()) { stop(); setView(target); return }
    m.current.target = target
    run('ease')
  }, [run, stop, setView])

  const glide = useCallback((vx, vy) => {
    if (prefersReducedMotion() || Math.hypot(vx, vy) < 0.05) return
    m.current.vx = vx
    m.current.vy = vy
    run('glide')
  }, [run])

  useEffect(() => stop, [stop])
  return { viewRef, animateTo, glide, stop }
}

const CanvasItem = React.memo(function CanvasItem({ idea, x, y, w, z, angle, dragging, dim, isNew, cardProps, onStartDrag, observer }) {
  const handleProps = useMemo(() => ({ onPointerDown: e => onStartDrag(e, idea.id) }), [onStartDrag, idea.id])
  const ref = useRef(null)
  // 量实际尺寸，供排版避免重叠
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !observer) return
    observer.observe(el)
    return () => observer.unobserve(el)
  }, [observer])
  return (
    <div
      ref={ref}
      data-id={idea.id}
      className={'wk-canvas-item' + (dragging ? ' is-dragging' : '') + (dim ? ' is-dim' : '') + (isNew ? ' is-new' : '')}
      style={{ left: x, top: y, width: w, zIndex: dragging ? 9999 : z }}
    >
      <div className="wk-tilt" style={{ '--tilt': `${angle}deg` }}>
        <IdeaCard idea={idea} variant="canvas" handleProps={handleProps} {...cardProps} />
      </div>
    </div>
  )
})

export function CanvasView({
  items, positions, view, setView, viewportRef, cardProps, onMove,
  related, onCloseRelated, cluster, onCloseCluster, highlight, board, boardNode, homeTick, focus, sizes, onMeasure,
}) {
  // 一个 ResizeObserver 观察所有卡片，尺寸变化批量回报
  const onMeasureRef = useRef(onMeasure)
  onMeasureRef.current = onMeasure
  const [observer] = useState(() => (typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    const batch = {}
    for (const e of entries) {
      const id = e.target.dataset.id
      if (id) batch[id] = { w: e.target.offsetWidth, h: e.target.offsetHeight }
    }
    onMeasureRef.current?.(batch)
  })))
  useEffect(() => () => observer?.disconnect(), [observer])

  const { viewRef, animateTo, glide, stop } = useCameraMotion(view, setView)
  const [drag, setDrag] = useState(null)     // { id, x, y } 正在拖动的卡片
  const dragRef = useRef(null)
  const [panning, setPanning] = useState(false)
  const [front, setFront] = useState([])     // 最近拖过的卡片放在最上层
  const gesture = useRef(null)

  const basePos = useCallback(it => it.pos || positions[it.id] || { x: 0, y: 0 }, [positions])

  // 相关模式：相关卡片聚到中心卡片四周（只是临时显示位置，不保存）
  const byId = useMemo(() => new Map(items.map(it => [it.id, it])), [items])
  const relatedGather = useMemo(() => {
    if (!related) return null
    const anchor = byId.get(related.anchorId)
    if (!anchor) return null
    const aRect = rectOf(anchor, basePos(anchor), sizes)
    const center = { x: aRect.x + aRect.w / 2, y: aRect.y + aRect.h / 2 }
    const obstacles = [aRect]
    const out = {}
    for (const id of related.ids) {
      const it = byId.get(id)
      if (!it) continue
      const size = cardSize(it, sizes)
      const p = findFreeSpot(size, center, obstacles, { gap: 28, step: 40 })
      out[id] = p
      obstacles.push({ ...p, ...size })
    }
    return { anchorRect: aRect, pos: out, rects: obstacles }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [related, byId])

  // 汇聚模式：选中的脚本 / 标签各成一簇，排在当前视野中央（临时位置，不保存）
  const clusterGather = useMemo(() => {
    if (!cluster?.groups.length) return null
    const el = viewportRef.current
    const v = viewRef.current
    const center = el ? toWorld(v, el.clientWidth / 2, el.clientHeight / 2) : { x: 0, y: 0 }
    return clusterLayout(cluster.groups, byId, sizes, center)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, byId])
  const gather = relatedGather || clusterGather
  const active = related || (cluster?.groups.length ? cluster : null)

  // 相关模式里被手动拖过的卡片，留在拖到的位置
  const released = useRef(new Set())
  useEffect(() => { released.current = new Set() }, [related, cluster])

  const posOf = useCallback(it => {
    if (dragRef.current?.id === it.id) return dragRef.current
    if (gather?.pos[it.id] && !released.current.has(it.id)) return gather.pos[it.id]
    return basePos(it)
  }, [gather, basePos, drag]) // eslint-disable-line react-hooks/exhaustive-deps
  const posOfRef = useRef(posOf)
  posOfRef.current = posOf

  // 进入相关模式：镜头缓动到能装下中心卡片和所有相关卡片
  useEffect(() => {
    const el = viewportRef.current
    if (!gather || !el) return
    animateTo(fitRects(gather.rects, el.clientWidth, el.clientHeight, { padding: 110, maxZoom: 1 }))
  }, [gather, animateTo, viewportRef])

  // 新记下的灵感不在视野里时，镜头带过去
  useEffect(() => {
    const el = viewportRef.current
    const it = highlight && byId.get(highlight)
    if (!it || !el || active) return
    const rect = rectOf(it, posOfRef.current(it), sizes)
    if (!rectVisible(viewRef.current, rect, el.clientWidth, el.clientHeight)) {
      animateTo(centerOn(viewRef.current, rect, el.clientWidth, el.clientHeight))
    }
  }, [highlight]) // eslint-disable-line react-hooks/exhaustive-deps

  // 回到周表：镜头移到周表中央，缩放到正好看全
  const goHome = useCallback(() => {
    const el = viewportRef.current
    if (!el || !board) return
    animateTo(fitRects([board], el.clientWidth, el.clientHeight, { padding: 72, maxZoom: 1 }))
  }, [board, animateTo, viewportRef])
  useEffect(() => { if (homeTick) goHome() }, [homeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // 从周表点某条灵感：镜头移到那张卡片
  useEffect(() => {
    const el = viewportRef.current
    const it = focus && byId.get(focus.id)
    if (!it || !el) return
    const rect = rectOf(it, posOfRef.current(it), sizes)
    const zoom = Math.max(viewRef.current.zoom, 0.85)
    animateTo(centerOn({ ...viewRef.current, zoom }, rect, el.clientWidth, el.clientHeight))
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  // 滚轮需要非 passive 监听才能阻止页面滚动
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      stop()
      const rect = el.getBoundingClientRect()
      // 按行滚动的设备（deltaMode=1）换算成像素
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
      if (e.shiftKey) {
        // Shift+滚轮：平移（横向滚动的设备直接用 deltaX）
        const dx = (e.deltaX || e.deltaY) * unit
        setView(v => ({ ...v, x: v.x - dx, y: v.y - (e.deltaX ? e.deltaY * unit : 0) }))
        return
      }
      // 滚轮：以鼠标所在位置为中心缩放。触控板双指捏合（带 ctrlKey）的增量小，灵敏度调高
      const k = e.ctrlKey ? 0.01 : 0.0015
      const factor = Math.exp(Math.max(-0.5, Math.min(0.5, -e.deltaY * unit * k)))
      setView(v => zoomAt(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewportRef, setView, stop])

  function startPan(e) {
    if (e.button !== 0 || e.target.closest('.wk-canvas-item, .wk-float, ' + INTERACTIVE)) return
    stop()
    const v = viewRef.current
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] }
    viewportRef.current.setPointerCapture(e.pointerId)
    setPanning(true)
  }

  const startCardDrag = useCallback((e, id) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return
    e.stopPropagation()
    e.preventDefault()
    stop()
    const it = byIdRef.current.get(id)
    if (!it) return
    const p = posOfRef.current(it)
    gesture.current = { type: 'card', id, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false }
    viewportRef.current.setPointerCapture(e.pointerId)
    setFront(prev => [...prev.filter(x => x !== id), id])
  }, [stop, viewportRef])
  const byIdRef = useRef(byId)
  byIdRef.current = byId

  function onPointerMove(e) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    g.moved = true
    if (g.type === 'pan') {
      const now = performance.now()
      g.samples.push({ t: now, x: e.clientX, y: e.clientY })
      while (g.samples.length > 2 && now - g.samples[0].t > 90) g.samples.shift()
      setView(v => ({ ...v, x: g.vx + dx, y: g.vy + dy }))
    } else {
      const z = viewRef.current.zoom
      const d = { id: g.id, x: Math.round(g.px + dx / z), y: Math.round(g.py + dy / z) }
      dragRef.current = d
      setDrag(d)
    }
  }

  function endGesture(e) {
    const g = gesture.current
    gesture.current = null
    setPanning(false)
    if (!g) return
    if (g.type === 'pan') {
      if (!g.moved) {
        // 点空白处：退出相关模式
        if (e.type === 'pointerup') { if (related) onCloseRelated(); else if (active) onCloseCluster?.() }
        return
      }
      const s = g.samples
      const first = s[0]
      const last = s[s.length - 1]
      const dt = last.t - first.t
      if (dt > 0 && performance.now() - last.t < 60) glide((last.x - first.x) / dt, (last.y - first.y) / dt)
    } else if (g.moved && dragRef.current) {
      if (active) released.current.add(g.id)
      onMove(g.id, { x: dragRef.current.x, y: dragRef.current.y })
    }
    dragRef.current = null
    setDrag(null)
  }

  function zoomBy(k) {
    const el = viewportRef.current
    const v = viewRef.current
    animateTo(zoomAt(v, v.zoom * k, el.clientWidth / 2, el.clientHeight / 2))
  }

  function fit() {
    const el = viewportRef.current
    const rects = items.map(it => rectOf(it, posOf(it), sizes))
    if (board) rects.push(board)
    animateTo(fitRects(rects, el.clientWidth, el.clientHeight))
  }

  const relatedSet = useMemo(() => new Set(related ? [related.anchorId, ...related.ids] : clusterGather ? Object.keys(clusterGather.pos) : []), [related, clusterGather])
  const grid = 24 * view.zoom
  return (
    <div
      ref={viewportRef}
      className={'wk-canvas' + (panning ? ' is-panning' : '') + (active ? ' is-related' : '')}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={startPan}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <div className="wk-canvas-world" style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})` }}>
        {board && (
          <div className={'wk-board-slot' + (active ? ' is-dim' : '')} style={{ left: board.x, top: board.y, width: board.w, height: board.h }}>
            {boardNode}
          </div>
        )}
        {items.map(it => {
          const p = posOf(it)
          const inRelated = relatedSet.has(it.id)
          return (
            <CanvasItem
              key={it.id}
              idea={it}
              x={p.x}
              y={p.y}
              w={cardSize(it, sizes).w}
              z={active && inRelated ? 5000 : front.indexOf(it.id) + 1}
              angle={active && inRelated ? 0 : tilt(it)}
              dragging={drag?.id === it.id}
              dim={Boolean(active) && !inRelated}
              isNew={highlight === it.id}
              cardProps={cardProps}
              onStartDrag={startCardDrag}
              observer={observer}
            />
          )
        })}
        {!related && clusterGather?.labels.map(l => (
          <div key={l.key} className="wk-cluster-label" style={{ left: l.x, top: l.y, width: l.w }}>
            <span className="wk-cluster-name">{l.label}</span><span className="wk-cluster-count">{l.count} 条</span>
          </div>
        ))}
      </div>

      {!related && cluster && (
        <div className="wk-float wk-related-bar">
          <Icon name="cluster" size={15} />
          {cluster.groups.length
            ? <span>汇聚了 <b>{Object.keys(clusterGather?.pos || {}).length}</b> 条灵感{cluster.groups.length > 1 ? `，分成 ${cluster.groups.length} 簇` : ''}</span>
            : <span>选中的脚本和标签下还没有灵感</span>}
          <button className="wk-btn-text" onClick={onCloseCluster}>散开 <kbd>Esc</kbd></button>
        </div>
      )}

      {related && (
        <div className="wk-float wk-related-bar">
          <Icon name="orbit" size={15} />
          {related.ids.length
            ? <span>找到 <b>{related.ids.length}</b> 条和「{related.label}」相关的灵感</span>
            : <span>没有找到和「{related.label}」相关的灵感</span>}
          <button className="wk-btn-text" onClick={onCloseRelated}>收起 <kbd>Esc</kbd></button>
        </div>
      )}

      <div className="wk-float wk-zoombar">
        <button className="wk-icon-btn" onClick={() => zoomBy(1 / 1.25)} title="缩小"><Icon name="minus" size={16} /></button>
        <button className="wk-zoom-val" title="恢复 100%"
          onClick={() => { const el = viewportRef.current; animateTo(zoomAt(viewRef.current, 1, el.clientWidth / 2, el.clientHeight / 2)) }}>
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="wk-icon-btn" onClick={() => zoomBy(1.25)} title="放大"><Icon name="plus" size={16} /></button>
        <span className="wk-sep" />
        <button className="wk-icon-btn" onClick={goHome} title="回到周表"><Icon name="target" size={16} /></button>
        <button className="wk-icon-btn" onClick={fit} title="显示全部"><Icon name="fit" size={16} /></button>
      </div>
    </div>
  )
}
