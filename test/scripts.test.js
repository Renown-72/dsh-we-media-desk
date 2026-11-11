import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createScript, normalizeScripts, missingScripts, uniqueTitle, bodyStats, filterScripts, isDateKey, dateKey, monthGrid, scheduleStats, scriptsByDate, titleFromIdea } from '../src/scripts.js'

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

test('排期：日期校验、月历、按日分组', () => {
  assert.equal(isDateKey('2026-11-12'), true)
  assert.equal(isDateKey('2026-02-30'), false)
  assert.equal(isDateKey('2026-1-2'), false)
  const [s] = normalizeScripts([{ id: 'a', title: 'A', date: '2026-11-12', time: '19:30' }])
  assert.equal(s.date, '2026-11-12')
  assert.equal(s.time, '19:30')
  const [t] = normalizeScripts([{ id: 'b', title: 'B', date: 'nope', time: '19:30' }])
  assert.equal(t.date, undefined)
  assert.equal(t.time, undefined)
  const now = new Date(2026, 10, 11, 12).getTime()
  const g = monthGrid(2026, 10, now) // 2026 年 11 月：1 号是周日
  assert.equal(g.length, 6)
  assert.equal(g[0][6].key, '2026-11-01')
  assert.equal(g[0][0].inMonth, false)
  assert.equal(g.flat().find(d => d.today).key, '2026-11-11')
  assert.equal(g.flat().find(d => d.key === '2026-11-10').past, true)
  const by = scriptsByDate([{ title: 'x', date: '2026-11-12', createdAt: 1 }, { title: 'y', date: '2026-11-12', time: '08:00', createdAt: 2 }, { title: 'z' }])
  assert.deepEqual(by['2026-11-12'].map(x => x.title), ['y', 'x'])
  assert.equal(dateKey(now), '2026-11-11')
})

test('scheduleStats：连续记录天数、本月数字', () => {
  const now = new Date(2026, 10, 11, 12).getTime()
  const day = d => new Date(2026, 10, d, 10).getTime()
  const ideas = [{ createdAt: day(10) }, { createdAt: day(9) }, { createdAt: day(7) }, { createdAt: new Date(2026, 9, 31).getTime() }]
  const scripts = [{ date: '2026-11-20' }, { date: '2026-12-01' }, { status: 'done', doneAt: day(3) }]
  assert.deepEqual(scheduleStats(ideas, scripts, { year: 2026, month: 10, now }), { streak: 2, monthIdeas: 3, monthScheduled: 1, monthDone: 1 })
  assert.equal(scheduleStats([...ideas, { createdAt: day(11) }], [], { year: 2026, month: 10, now }).streak, 3)
})

test('titleFromIdea：第一行、截断、去重', () => {
  assert.equal(titleFromIdea({ text: '“最好的选题，往往藏在你反复抱怨的那件小事里。”' }), '最好的选题，往往藏在你反复抱怨的那件小事里。')
  assert.equal(titleFromIdea({ text: '一'.repeat(30) }), '一'.repeat(24) + '…')
  assert.equal(titleFromIdea({ text: 'A' }, [{ title: 'A' }]), 'A 2')
  assert.equal(titleFromIdea({ kind: 'image', text: '' }), '未命名脚本')
})
