import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clusterGroups, clusterLayout } from '../client/ideas/cluster.js'
import { collectScripts, createIdea, normalizeIdea, filterIdeas } from '../src/ideas.js'

const mk = (id, tags = [], script) => ({ id, kind: 'text', text: id, tags, script, createdAt: 1 })

test('clusterGroups：按脚本、标签分组，交集单独成组并排在中间', () => {
  const ideas = [mk('a', ['封面']), mk('b', ['封面'], 'vlog 第 3 期'), mk('c', [], 'vlog 第 3 期'), mk('d', ['其他']), { ...mk('e', ['封面']), archived: true }]
  const g = clusterGroups(ideas, [{ type: 'tag', value: '封面' }, { type: 'script', value: 'vlog 第 3 期' }])
  assert.deepEqual(g.map(x => x.label), ['#封面', '#封面 + vlog 第 3 期', 'vlog 第 3 期'])
  assert.deepEqual(g.map(x => x.ids), [['a'], ['b'], ['c']])
  assert.deepEqual(clusterGroups(ideas, []), [])
})

test('clusterLayout：组左右排开、互不重叠，整体居中', () => {
  const ideas = ['a', 'b', 'c', 'd', 'e'].map(id => mk(id))
  const byId = new Map(ideas.map(it => [it.id, it]))
  const sizes = Object.fromEntries(ideas.map(it => [it.id, { w: 248, h: 120 }]))
  const groups = [{ key: '0', label: 'A', ids: ['a', 'b', 'c'] }, { key: '1', label: 'B', ids: ['d', 'e'] }]
  const { pos, labels, rects } = clusterLayout(groups, byId, sizes, { x: 0, y: 0 })
  assert.equal(labels.length, 2)
  assert.ok(rects[0].x + rects[0].w < rects[1].x)
  const left = rects[0].x, right = rects[1].x + rects[1].w
  assert.ok(Math.abs(left + right) <= 2)
  const boxes = Object.entries(pos).map(([id, p]) => ({ ...p, ...sizes[id] }))
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'cards overlap')
  }
})

test('灵感的脚本字段：清洗、搜索、统计', () => {
  const it = createIdea({ kind: 'text', text: '开头三秒', script: '  vlog 第 3 期  ' })
  assert.equal(it.script, 'vlog 第 3 期')
  assert.equal(createIdea({ kind: 'text', text: 'x', script: '   ' }).script, undefined)
  assert.equal(normalizeIdea({ id: 'z', kind: 'text', text: 'x', script: 'a'.repeat(80) }).script.length, 40)
  assert.equal(filterIdeas([it], { query: 'vlog' }).length, 1)
  assert.deepEqual(collectScripts([it, mk('q', [], 'vlog 第 3 期'), mk('r', [], '探店')]), [{ script: 'vlog 第 3 期', count: 2 }, { script: '探店', count: 1 }])
})
