// 画布（自由白板）：拖卡片摆位置；拖空白处平移；滚轮平移，Ctrl+滚轮缩放。
import React from 'react'
import { IdeaCard } from './IdeaCard.jsx'
import { CARD_W, zoomAt, fitView } from './layout.js'

const { useState, useRef, useEffect } = React

const DRAG_THRESHOLD = 3

export function CanvasView({ items, positions, view, setView, viewportRef, cardProps, onMove, emptyText }) {
  const [drag, setDrag] = useState(null)     // { id, x, y } 正在拖动的卡片
  const [panning, setPanning] = useState(false)
  const [front, setFront] = useState([])     // 最近拖过的卡片放在最上层
  const gesture = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view

  const posOf = it => (drag?.id === it.id ? drag : it.pos || positions[it.id] || { x: 0, y: 0 })

  // 滚轮需要非 passive 监听才能阻止页面滚动
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015)
        setView(v => zoomAt(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top))
      } else {
        setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewportRef, setView])

  function startPan(e) {
    if (e.button !== 0 || e.target.closest('.wk-canvas-item, .wk-canvas-tools')) return
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
    viewportRef.current.setPointerCapture(e.pointerId)
    setPanning(true)
  }

  function startCardDrag(e, it) {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const p = posOf(it)
    gesture.current = { type: 'card', id: it.id, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false }
    viewportRef.current.setPointerCapture(e.pointerId)
    setFront(prev => [...prev.filter(id => id !== it.id), it.id])
  }

  function onPointerMove(e) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (g.type === 'pan') {
      setView(v => ({ ...v, x: g.vx + dx, y: g.vy + dy }))
    } else {
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      g.moved = true
      const z = viewRef.current.zoom
      setDrag({ id: g.id, x: Math.round(g.px + dx / z), y: Math.round(g.py + dy / z) })
    }
  }

  function endGesture() {
    const g = gesture.current
    gesture.current = null
    setPanning(false)
    if (g?.type === 'card' && g.moved && drag) onMove(g.id, { x: drag.x, y: drag.y })
    setDrag(null)
  }

  function zoomBy(k) {
    const el = viewportRef.current
    setView(v => zoomAt(v, v.zoom * k, el.clientWidth / 2, el.clientHeight / 2))
  }

  function fit() {
    const el = viewportRef.current
    setView(fitView(items.map(it => ({ ...it, pos: posOf(it) })), el.clientWidth, el.clientHeight))
  }

  const grid = 24 * view.zoom
  return (
    <div
      ref={viewportRef}
      className={'wk-canvas' + (panning ? ' is-panning' : '')}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={startPan}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <div className="wk-canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {items.map(it => {
          const p = posOf(it)
          const z = front.indexOf(it.id) + 1
          return (
            <div
              key={it.id}
              className={'wk-canvas-item' + (drag?.id === it.id ? ' is-dragging' : '')}
              style={{ left: p.x, top: p.y, width: CARD_W, zIndex: drag?.id === it.id ? 9999 : z }}
            >
              <IdeaCard
                idea={it}
                variant="canvas"
                handleProps={{ onPointerDown: e => startCardDrag(e, it), title: '拖动这里移动卡片' }}
                {...cardProps}
              />
            </div>
          )
        })}
      </div>

      {items.length === 0 && <div className="wk-canvas-empty">{emptyText}</div>}

      <div className="wk-canvas-tools" onPointerDown={e => e.stopPropagation()}>
        <button className="wk-mini" onClick={() => zoomBy(1 / 1.2)} title="缩小">−</button>
        <button className="wk-mini wk-zoom" onClick={() => setView(v => zoomAt(v, 1, viewportRef.current.clientWidth / 2, viewportRef.current.clientHeight / 2))} title="恢复 100%">
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="wk-mini" onClick={() => zoomBy(1.2)} title="放大">＋</button>
        <button className="wk-mini" onClick={fit} title="显示全部卡片">适应窗口</button>
      </div>
      <div className="wk-canvas-hint">拖卡片顶部移动 · 拖空白处或滚轮平移 · Ctrl+滚轮缩放</div>
    </div>
  )
}
