// 画布排版（纯函数）：估算卡片高度，给没有位置的灵感找空位。

export const CARD_W = 260
export const GAP = 24
const COLS = 4

// 粗略估算卡片高度（只用于自动摆放，不必精确）
export function estimateHeight(it) {
  let h = 44 // 头部 + 内边距
  const kind = it.kind || 'text'
  if (kind === 'image') {
    const w = it.file?.w, ih = it.file?.h
    h += w && ih ? Math.min(Math.round((CARD_W - 24) * ih / w), 480) : 200
  } else if (kind === 'video') {
    h += it.file || !it.preview ? 140 : 210
  } else if (kind === 'link') {
    h += it.preview?.image ? 210 : 90
  }
  if (it.text) h += 20 * Math.min(12, Math.ceil(it.text.length / 16)) + 8
  if (it.tags?.length) h += 28
  return h
}

// 返回 { [id]: {x, y} }：已有位置的不动，没位置的按创建时间从早到晚
// 摆在已有内容下方的 4 列瀑布里。
export function autoPlace(ideas) {
  const placed = ideas.filter(it => it.pos)
  const todo = ideas.filter(it => !it.pos).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  if (!todo.length) return {}
  let x0 = 0
  let y0 = 0
  if (placed.length) {
    x0 = Math.min(...placed.map(it => it.pos.x))
    y0 = Math.max(...placed.map(it => it.pos.y + estimateHeight(it))) + GAP * 2
  }
  const heights = new Array(COLS).fill(y0)
  const out = {}
  for (const it of todo) {
    const col = heights.indexOf(Math.min(...heights))
    out[it.id] = { x: x0 + col * (CARD_W + GAP), y: heights[col] }
    heights[col] += estimateHeight(it) + GAP
  }
  return out
}

// 计算能装下所有卡片的视图（适应窗口）
export function fitView(items, width, height, padding = 40) {
  if (!items.length || !width || !height) return { x: padding, y: padding, zoom: 1 }
  const minX = Math.min(...items.map(it => it.pos.x))
  const minY = Math.min(...items.map(it => it.pos.y))
  const maxX = Math.max(...items.map(it => it.pos.x + CARD_W))
  const maxY = Math.max(...items.map(it => it.pos.y + estimateHeight(it)))
  const zoom = clampZoom(Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY), 1))
  return {
    zoom,
    x: Math.round((width - (maxX - minX) * zoom) / 2 - minX * zoom),
    y: Math.round(padding - minY * zoom),
  }
}

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 2
export function clampZoom(z) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(z) ? z : 1))
}

// 以屏幕上某点为中心缩放
export function zoomAt(view, nextZoom, px, py) {
  const zoom = clampZoom(nextZoom)
  const k = zoom / view.zoom
  return { zoom, x: px - (px - view.x) * k, y: py - (py - view.y) * k }
}

// 屏幕坐标 -> 画布坐标
export function toWorld(view, sx, sy) {
  return { x: Math.round((sx - view.x) / view.zoom), y: Math.round((sy - view.y) / view.zoom) }
}
