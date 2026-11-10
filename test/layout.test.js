import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  autoPlace, findFreeSpot, cardSize, rectOf, fitRects, zoomAt, toWorld, clampZoom,
  rectVisible, centerOn, masonryColumns, tilt, cardWidth, GAP,
} from '../client/ideas/layout.js'

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function sample(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'i' + i,
    kind: ['text', 'image', 'link', 'video'][i % 4],
    text: 'x'.repeat((i * 37) % 120),
    url: 'https://a.example',
    file: i % 4 === 1 ? { name: 'f.png', mime: 'image/png', w: 400 + i * 10, h: 300 + (i % 5) * 80 } : undefined,
    tags: i % 3 ? ['t'] : [],
    createdAt: i,
  }))
}

test('autoPlace 摆出来的卡片互不重叠，已摆好的不动', () => {
  const fixed = { id: 'fixed', kind: 'text', text: 'hi', tags: [], pos: { x: 0, y: 0 }, createdAt: 100 }
  const ideas = [fixed, ...sample(60)]
  const out = autoPlace(ideas)
  assert.equal(out.fixed, undefined)
  assert.equal(Object.keys(out).length, 60)
  const rects = ideas.map(it => rectOf(it, it.pos || out[it.id]))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${ideas[i].id} 与 ${ideas[j].id} 重叠`)
  }
  assert.deepEqual(autoPlace([fixed]), {})
})

test('autoPlace 越新的灵感越靠近中心', () => {
  const ideas = sample(30)
  const out = autoPlace(ideas)
  const dist = it => { const r = rectOf(it, out[it.id]); return Math.hypot(r.x + r.w / 2, r.y + r.h / 2) }
  const newest = ideas[ideas.length - 1]
  const oldest = ideas[0]
  assert.ok(dist(newest) < dist(oldest))
  assert.ok(dist(newest) < 60)
})

test('findFreeSpot 避开障碍物；空白时直接放在锚点中央', () => {
  const size = { w: 200, h: 100 }
  assert.deepEqual(findFreeSpot(size, { x: 0, y: 0 }, []), { x: -100, y: -50 })
  const blocker = { x: -150, y: -80, w: 300, h: 160 }
  const p = findFreeSpot(size, { x: 0, y: 0 }, [blocker])
  assert.ok(!overlap({ ...p, ...size }, { x: blocker.x - GAP, y: blocker.y - GAP, w: blocker.w + GAP * 2, h: blocker.h + GAP * 2 }))
})

test('卡片宽度和倾斜按 id 稳定', () => {
  const a = { id: 'abc', kind: 'image', file: { name: 'f.png', mime: 'image/png' } }
  assert.equal(cardWidth(a), cardWidth({ ...a }))
  assert.equal(tilt(a), tilt({ ...a }))
  assert.ok(Math.abs(tilt(a)) <= 1.6)
  assert.equal(cardWidth({ id: 'x', kind: 'text' }), 248)
  const ratio = cardSize({ id: 'p', kind: 'image', file: { w: 100, h: 200 } })
  assert.ok(ratio.h > ratio.w)
})

test('zoomAt / toWorld / clampZoom', () => {
  const v = { x: 50, y: 20, zoom: 1 }
  const before = toWorld(v, 300, 200)
  const next = zoomAt(v, 2, 300, 200)
  assert.equal(next.zoom, 2)
  assert.deepEqual(toWorld(next, 300, 200), before)
  assert.equal(clampZoom(100), 2)
  assert.equal(clampZoom(0), 0.2)
})

test('fitRects 能装下所有矩形且居中；rectVisible / centerOn', () => {
  const rects = [{ x: 0, y: 0, w: 200, h: 100 }, { x: 3000, y: 500, w: 200, h: 100 }]
  const v = fitRects(rects, 1000, 600)
  assert.ok(v.zoom < 1)
  for (const r of rects) assert.ok(rectVisible(v, r, 1000, 600, 0))
  const one = fitRects([{ x: 0, y: 0, w: 200, h: 100 }], 1000, 600)
  assert.equal(one.zoom, 1)
  assert.deepEqual({ x: one.x, y: one.y }, { x: 400, y: 250 })

  const far = { x: 5000, y: 5000, w: 200, h: 100 }
  const view = { x: 0, y: 0, zoom: 1 }
  assert.equal(rectVisible(view, far, 1000, 600), false)
  const c = centerOn(view, far, 1000, 600)
  assert.ok(rectVisible(c, far, 1000, 600))
})

test('masonryColumns 均衡分列，且保持时间顺序', () => {
  const items = sample(12)
  const cols = masonryColumns(items, 3, 240)
  assert.equal(cols.length, 3)
  assert.equal(cols.flat().length, 12)
  // 前三条分别进三列
  assert.deepEqual(cols.map(c => c[0].id), ['i0', 'i1', 'i2'])
  // 每列内部仍按原顺序
  for (const c of cols) {
    const idx = c.map(it => items.indexOf(it))
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
  }
  assert.equal(masonryColumns(items, 1, 240)[0].length, 12)
})

import { placeHero, heroRect, HERO_SIZE } from '../client/ideas/layout.js'

test('首屏放在原点附近的空位，自动摆放的卡片避开首屏', () => {
  const empty = placeHero([])
  assert.deepEqual(empty, { x: -HERO_SIZE.w / 2, y: -HERO_SIZE.h / 2 })
  const blocker = { id: 'b', kind: 'text', text: 'x', tags: [], pos: { x: -100, y: -60 } }
  const p = placeHero([blocker])
  assert.ok(!overlap(heroRect(p), rectOf(blocker, blocker.pos)))

  const hero = heroRect(empty)
  const ideas = sample(40)
  const out = autoPlace(ideas, { hero })
  for (const it of ideas) assert.ok(!overlap(rectOf(it, out[it.id]), hero), it.id)
})
