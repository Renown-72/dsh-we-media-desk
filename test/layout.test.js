import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoPlace, fitView, zoomAt, toWorld, clampZoom, CARD_W, GAP } from '../client/ideas/layout.js'

test('autoPlace 只给没有位置的灵感排位，按时间从早到晚、放在已有内容下方', () => {
  const ideas = [
    { id: 'p', kind: 'text', text: 'x', pos: { x: 100, y: 0 } },
    { id: 'late', kind: 'text', text: 'b', createdAt: 2 },
    { id: 'early', kind: 'text', text: 'a', createdAt: 1 },
  ]
  const out = autoPlace(ideas)
  assert.deepEqual(Object.keys(out).sort(), ['early', 'late'])
  assert.equal(out.early.x, 100)
  assert.equal(out.late.x, 100 + CARD_W + GAP)
  assert.ok(out.early.y > 0)
  assert.deepEqual(autoPlace([{ id: 'p', pos: { x: 0, y: 0 } }]), {})
})

test('zoomAt 以指定点为中心缩放，toWorld 能换算回同一点', () => {
  const v = { x: 50, y: 20, zoom: 1 }
  const before = toWorld(v, 300, 200)
  const next = zoomAt(v, 2, 300, 200)
  assert.equal(next.zoom, 2)
  assert.deepEqual(toWorld(next, 300, 200), before)
  assert.equal(clampZoom(100), 2)
  assert.equal(clampZoom(0), 0.2)
})

test('fitView 能装下所有卡片且不放大超过 100%', () => {
  const items = [{ id: 'a', kind: 'text', text: 'x', pos: { x: 0, y: 0 } }, { id: 'b', kind: 'text', text: 'y', pos: { x: 3000, y: 0 } }]
  const v = fitView(items, 1000, 600)
  assert.ok(v.zoom < 1 && v.zoom >= 0.2)
  assert.ok(v.x + 3000 * v.zoom + CARD_W * v.zoom <= 1000)
  assert.equal(fitView([{ id: 'a', kind: 'text', text: 'x', pos: { x: 0, y: 0 } }], 1000, 600).zoom, 1)
})
