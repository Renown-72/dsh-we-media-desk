import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createScript, normalizeScripts, missingScripts, uniqueTitle, bodyStats, filterScripts } from '../src/scripts.js'

test('createScript / normalizeScripts：清洗标题、状态，id 和标题去重', () => {
  const s = createScript({ title: '  城市夜景   vlog ', now: 1000 })
  assert.equal(s.title, '城市夜景 vlog')
  assert.equal(s.status, 'plan')
  assert.throws(() => createScript({ title: '   ' }))
  const list = normalizeScripts([
    s,
    { ...s, id: 'other' },                              // 重名
    { id: s.id, title: '另一个' },                       // 重 id
    { id: 'x', title: '完成的', status: 'done', updatedAt: 5 },
    { id: 'y', title: '怪状态', status: 'nope' },
    { id: 'z', title: '' },
    null,
  ])
  assert.deepEqual(list.map(x => x.title), ['城市夜景 vlog', '完成的', '怪状态'])
  assert.equal(list[1].doneAt, 5)
  assert.equal(list[2].status, 'plan')
})

test('missingScripts：灵感里用到的脚本名补成脚本', () => {
  const have = [createScript({ title: 'A' })]
  const out = missingScripts(have, [{ script: 'A' }, { script: 'B' }, { script: 'B' }, {}])
  assert.deepEqual(out.map(s => s.title), ['B'])
})

test('uniqueTitle / bodyStats / filterScripts', () => {
  assert.equal(uniqueTitle([]), '未命名脚本')
  assert.equal(uniqueTitle([{ title: '未命名脚本' }, { title: '未命名脚本 2' }]), '未命名脚本 3')
  assert.deepEqual(bodyStats(''), { chars: 0, sec: 0, duration: '—' })
  assert.equal(bodyStats('一'.repeat(45)).duration, '约 10 秒')
  assert.equal(bodyStats('一'.repeat(450)).duration, '约 1 分 40 秒')
  assert.equal(bodyStats('一'.repeat(270)).duration, '约 1 分')
  const list = [
    { title: 'A', body: '咖啡', status: 'plan', updatedAt: 1 },
    { title: 'B', body: '', status: 'done', updatedAt: 2 },
  ]
  assert.deepEqual(filterScripts(list).map(s => s.title), ['B', 'A'])
  assert.deepEqual(filterScripts(list, { status: 'plan' }).map(s => s.title), ['A'])
  assert.deepEqual(filterScripts(list, { query: '咖啡' }).map(s => s.title), ['A'])
})
