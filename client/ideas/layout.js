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

// 估算卡片高度（实际排版以画布上量到的尺寸为准，估算只在还没量到时使用）
const CJK = /[\u3000-\u9fff\uff00-\uffef]/g
function textLines(text, width, fontPx) {
  let lines = 0
  for (const line of String(text).split('\n')) {
    const cjk = (line.match(CJK) || []).length
    const units = cjk + (line.length - cjk) * 0.55 // 西文字符约半个汉字宽
    lines += Math.max(1, Math.ceil((units * fontPx) / width))
  }
  return lines
}

export function estimateHeight(it, w = cardWidth(it)) {
  const inner = w - 30 // 左右内边距 + 边框
  const kind = it.kind || 'text'
  const p = it.preview || {}
  let h = 2 + 38 // 边框 + 底部信息栏
  let body = 0
  const add = px => { body += body ? px + 8 : px }
  if (kind === 'image') {
    const fw = it.file?.w, fh = it.file?.h
    h += fw && fh ? Math.min(Math.round(w * fh / fw), 520) : Math.round(w * 0.75)
  } else if (kind === 'video' && (it.file || /\.(mp4|webm|mov|m4v|ogv)$/i.test(it.url || ''))) {
    h += Math.round(w * 9 / 16)
  } else if (kind === 'link' || kind === 'video') {
    if (p.image) h += Math.round(w * 9 / 16)
    let link = Math.min(2, textLines(p.title || it.url || '', inner, 14)) * 20
    if (p.description) link += 5 + Math.min(2, textLines(p.description, inner, 12.5)) * 19
    link += 5 + 18
    add(link)
  }
  if (it.text) {
    const main = kind === 'text'
    add(Math.min(16, textLines(it.text, inner, main ? 15 : 13.5)) * (main ? 25.5 : 22.3))
  }
  if (it.tags?.length) add(Math.ceil(it.tags.length / 4) * 24)
  if (body) h += 12 + body
  return Math.round(h)
}

// sizes：画布上量到的实际尺寸 { [id]: {w, h} }，有就用
export function cardSize(it, sizes) {
  const m = sizes?.[it.id]
  if (m) return m
  const w = cardWidth(it)
  return { w, h: estimateHeight(it, w) }
}

export function rectOf(it, pos, sizes) {
  const { w, h } = cardSize(it, sizes)
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

// 首屏（日期、统计、输入框）在画布上占的位置
export const HERO_SIZE = { w: 600, h: 340 }

// 首屏放在原点附近的空位（已有卡片不动）
export function placeHero(ideas, sizes) {
  const placed = ideas.filter(it => it.pos).map(it => rectOf(it, it.pos, sizes))
  return findFreeSpot(HERO_SIZE, { x: 0, y: 0 }, placed, { gap: 40 })
}

export function heroRect(pos) {
  return { x: pos.x, y: pos.y, ...HERO_SIZE }
}

// 返回 { [id]: {x, y} }：已有位置的不动；没位置的按从新到旧，
// 依次放到离锚点最近的空位上（越新越靠中间）。
// 默认锚点是已有内容的中心；hero 给出时围着首屏摆，并避开首屏。
export function autoPlace(ideas, { hero, sizes } = {}) {
  const todo = ideas.filter(it => !it.pos).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  if (!todo.length) return {}
  const placed = ideas.filter(it => it.pos).map(it => rectOf(it, it.pos, sizes))
  const anchor = hero ? { x: hero.x + hero.w / 2, y: hero.y + hero.h / 2 } : centerOf(placed)
  const index = new RectIndex(hero ? [...placed, { ...hero, x: hero.x - 20, y: hero.y - 20, w: hero.w + 40, h: hero.h + 40 }] : placed)
  const out = {}
  let lastK = 0
  for (const it of todo) {
    const size = cardSize(it, sizes)
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
