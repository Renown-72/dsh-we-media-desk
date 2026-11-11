// 汇聚（纯函数）：按选中的脚本 / 标签把灵感分组，再排成一簇一簇。
import { cardSize } from './layout.js'

// picks: [{ type: 'script' | 'tag', value }]
export function pickLabel(p) {
  return p.type === 'tag' ? '#' + p.value : p.value
}

function matches(it, p) {
  return p.type === 'script' ? it.script === p.value : (it.tags || []).includes(p.value)
}

// 每条灵感归到“它命中的那几个选项”组成的组里；同时属于 A 和 B 的单独成组，排在 A、B 中间
export function clusterGroups(ideas, picks) {
  if (!picks.length) return []
  const map = new Map()
  for (const it of ideas) {
    if (it.archived) continue
    const hit = []
    picks.forEach((p, i) => { if (matches(it, p)) hit.push(i) })
    if (!hit.length) continue
    const key = hit.join('+')
    if (!map.has(key)) {
      map.set(key, {
        key,
        picks: hit.map(i => picks[i]),
        label: hit.map(i => pickLabel(picks[i])).join(' + '),
        order: hit.reduce((a, b) => a + b, 0) / hit.length,
        ids: [],
      })
    }
    map.get(key).ids.push(it.id)
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.picks.length - b.picks.length)
}

// 每组排成几列（短的那列先放），组与组左右排开，整体以 center 为中心。
// 返回 { pos: {id: {x,y}}, labels: [{key,label,count,x,y,w}], rects }
export function clusterLayout(groups, byId, sizes, center, { gap = 20, groupGap = 96, head = 48 } = {}) {
  const blocks = groups.map(g => {
    const items = g.ids.map(id => byId.get(id)).filter(Boolean)
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(items.length * 0.75))))
    const colW = Math.max(240, ...items.map(it => cardSize(it, sizes).w))
    const heights = new Array(cols).fill(0)
    const rel = {}
    for (const it of items) {
      const c = heights.indexOf(Math.min(...heights))
      rel[it.id] = { x: c * (colW + gap), y: heights[c] }
      heights[c] += cardSize(it, sizes).h + gap
    }
    return { g, items, rel, w: cols * colW + (cols - 1) * gap, h: Math.max(0, Math.max(...heights) - gap) }
  })
  const totalW = blocks.reduce((s, b) => s + b.w, 0) + groupGap * Math.max(0, blocks.length - 1)
  const maxH = Math.max(0, ...blocks.map(b => b.h))
  const top = Math.round(center.y - (maxH + head) / 2)
  let x = Math.round(center.x - totalW / 2)
  const pos = {}
  const labels = []
  const rects = []
  for (const b of blocks) {
    labels.push({ key: b.g.key, label: b.g.label, count: b.items.length, x, y: top, w: b.w })
    // 上方多留 64，给画布顶部的提示条让位置
    rects.push({ x, y: top - 64, w: b.w, h: 64 + head + b.h })
    for (const it of b.items) pos[it.id] = { x: x + b.rel[it.id].x, y: top + head + b.rel[it.id].y }
    x += b.w + groupGap
  }
  return { pos, labels, rects }
}
