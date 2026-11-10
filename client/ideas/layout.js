// 画布排版（纯函数）：卡片尺寸估算、找不重叠的空位、视图换算。

export const GAP = 20
export const BASE_W = 248

// 稳定的字符串哈希（FNV-1a），让同一张卡每次的宽度、倾斜都一样
export function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// 卡片宽度：图片、视频宽窄不一，看起来更像随手摆的；文字和链接固定宽度
export function cardWidth(it) {
  const kind = it.kind || 'text'
  if (kind === 'image' || (kind === 'video' && it.file)) return 216 + (hash(it.id) % 4) * 24
  return BASE_W
}

// 轻微倾斜角度（度），-1.6 ~ 1.6
export function tilt(it) {
  return ((hash(it.id + '#t') % 33) - 16) / 10
}

// 粗略估算卡片高度（只用于排版，不必精确）
export function estimateHeight(it, w = cardWidth(it)) {
  const inner = w - 28
  let h = 50 // 头部 + 内边距
  const kind = it.kind || 'text'
  if (kind === 'image') {
    const fw = it.file?.w, fh = it.file?.h
    h += fw && fh ? Math.min(Math.round(inner * fh / fw), 480) : Math.round(inner * 0.75)
  } else if (kind === 'video') {
    h += it.file || !it.preview?.image ? Math.round(inner * 9 / 16) + (it.file ? 0 : 60) : Math.round(inner * 9 / 16) + 70
  } else if (kind === 'link') {
    h += it.preview?.image ? Math.round(inner * 9 / 16) + 76 : 76
  }
  if (it.text) {
    const perLine = Math.max(8, Math.floor(inner / 14))
    const lines = it.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0)
    h += 22 * Math.min(14, lines) + 8
  }
  if (it.tags?.length) h += 30
  return h
}

export function cardSize(it) {
  const w = cardWidth(it)
  return { w, h: estimateHeight(it, w) }
}

export function rectOf(it, pos) {
  const { w, h } = cardSize(it)
  return { x: pos.x, y: pos.y, w, h }
}

function overlaps(a, b, gap) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// 网格空间索引：只和附近格子里的卡片比较，卡片多时也快
const CELL = 320
export class RectIndex {
  constructor(rects = []) {
    this.cells = new Map()
    for (const r of rects) this.add(r)
  }
  *keys(r, pad) {
    const x0 = Math.floor((r.x - pad) / CELL), x1 = Math.floor((r.x + r.w + pad) / CELL)
    const y0 = Math.floor((r.y - pad) / CELL), y1 = Math.floor((r.y + r.h + pad) / CELL)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield x + ',' + y
  }
  add(r) {
    for (const k of this.keys(r, 0)) {
      let list = this.cells.get(k)
      if (!list) this.cells.set(k, list = [])
      list.push(r)
    }
  }
  hits(r, gap) {
    for (const k of this.keys(r, gap)) {
      for (const o of this.cells.get(k) || []) if (overlaps(r, o, gap)) return true
    }
    return false
  }
}

// 以 anchor（中心点）为圆心，沿向日葵螺旋找第一个不和 obstacles 重叠的位置。
// 返回卡片左上角坐标。横向拉宽一点，适配横屏。
// obstacles 可以是矩形数组，也可以是 RectIndex。
// from：从螺旋的第几个点开始找（连续摆放时，中心附近早已占满，可以跳过）；
// onFound(k) 回报找到时的序号。
export function findFreeSpot(size, anchor, obstacles, { gap = GAP, step = 46, maxTries = 6000, from = 0, onFound } = {}) {
  const index = obstacles instanceof RectIndex ? obstacles : new RectIndex(obstacles)
  for (let k = from; k < from + maxTries; k++) {
    const r = step * Math.sqrt(k)
    const a = k * GOLDEN
    const cx = anchor.x + Math.cos(a) * r * 1.35
    const cy = anchor.y + Math.sin(a) * r
    const rect = { x: Math.round(cx - size.w / 2), y: Math.round(cy - size.h / 2), w: size.w, h: size.h }
    if (!index.hits(rect, gap)) { onFound?.(k); return { x: rect.x, y: rect.y } }
  }
  return { x: Math.round(anchor.x - size.w / 2), y: Math.round(anchor.y - size.h / 2) }
}

function centerOf(rects) {
  if (!rects.length) return { x: 0, y: 0 }
  const minX = Math.min(...rects.map(r => r.x))
  const minY = Math.min(...rects.map(r => r.y))
  const maxX = Math.max(...rects.map(r => r.x + r.w))
  const maxY = Math.max(...rects.map(r => r.y + r.h))
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

// 返回 { [id]: {x, y} }：已有位置的不动；没位置的按从新到旧，
// 依次放到离已有内容中心最近的空位上（越新越靠中间）。
export function autoPlace(ideas) {
  const todo = ideas.filter(it => !it.pos).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  if (!todo.length) return {}
  const placed = ideas.filter(it => it.pos).map(it => rectOf(it, it.pos))
  const anchor = centerOf(placed)
  const index = new RectIndex(placed)
  const out = {}
  let lastK = 0
  for (const it of todo) {
    const size = cardSize(it)
    // 往回退一些再找，小卡片仍能填进中心附近的缝隙
    const pos = findFreeSpot(size, anchor, index, { from: Math.floor(lastK * 0.7), onFound: k => { lastK = k } })
    out[it.id] = pos
    index.add({ ...pos, ...size })
  }
  return out
}

// 计算能装下这些矩形的视图（适应窗口）；不放大超过 maxZoom
export function fitRects(rects, width, height, { padding = 48, maxZoom = 1 } = {}) {
  if (!rects.length || !width || !height) return { x: width / 2 || padding, y: height / 2 || padding, zoom: 1 }
  const minX = Math.min(...rects.map(r => r.x))
  const minY = Math.min(...rects.map(r => r.y))
  const maxX = Math.max(...rects.map(r => r.x + r.w))
  const maxY = Math.max(...rects.map(r => r.y + r.h))
  const zoom = clampZoom(Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY), maxZoom))
  return {
    zoom,
    x: Math.round(width / 2 - ((minX + maxX) / 2) * zoom),
    y: Math.round(height / 2 - ((minY + maxY) / 2) * zoom),
  }
}

export function fitView(items, width, height, opts) {
  return fitRects(items.map(it => rectOf(it, it.pos)), width, height, opts)
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

// 矩形是否完整落在视野内（留 margin 像素边距）
export function rectVisible(view, rect, width, height, margin = 40) {
  const left = view.x + rect.x * view.zoom
  const top = view.y + rect.y * view.zoom
  return left >= margin && top >= margin &&
    left + rect.w * view.zoom <= width - margin && top + rect.h * view.zoom <= height - margin
}

// 把视野平移到让 rect 居中（缩放不变）
export function centerOn(view, rect, width, height) {
  return {
    zoom: view.zoom,
    x: Math.round(width / 2 - (rect.x + rect.w / 2) * view.zoom),
    y: Math.round(height / 2 - (rect.y + rect.h / 2) * view.zoom),
  }
}

// ---- 信息流瀑布：按估算高度把卡片分到最矮的一列，尽量保持从左到右、从上到下的时间顺序 ----
export function masonryColumns(items, cols, colWidth) {
  const columns = Array.from({ length: cols }, () => ({ h: 0, items: [] }))
  for (const it of items) {
    let best = 0
    for (let i = 1; i < cols; i++) if (columns[i].h < columns[best].h - 1) best = i
    columns[best].items.push(it)
    columns[best].h += estimateHeight(it, colWidth) + GAP
  }
  return columns.map(c => c.items)
}
