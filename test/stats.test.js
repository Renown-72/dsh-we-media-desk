import assert from 'node:assert/strict'
import { test } from 'node:test'
import { weekStats, weekStart, hourLabel } from '../client/ideas/stats.js'
import { splitHashtags } from '../src/ideas.js'

const at = (m, d, h = 12, min = 0) => new Date(2026, m - 1, d, h, min).getTime()

test('weekStart 取周一 0 点，可前后翻周', () => {
  assert.equal(weekStart(at(11, 10, 15)), at(11, 9, 0)) // 周二 -> 周一
  assert.equal(weekStart(at(11, 15, 23)), at(11, 9, 0)) // 周日 -> 同一周的周一
  assert.equal(weekStart(at(11, 10), -1), at(11, 2, 0))
  assert.equal(weekStart(at(11, 10), 1), at(11, 16, 0))
})

test('hourLabel', () => {
  assert.equal(hourLabel(21), '晚上 9 点')
  assert.equal(hourLabel(9), '上午 9 点')
  assert.equal(hourLabel(12), '中午 12 点')
  assert.equal(hourLabel(2), '凌晨 2 点')
  assert.equal(hourLabel(null), '—')
})

test('weekStats 统计本周灵感、活跃天数、高峰时段、完稿、常用类型和标签', () => {
  const now = at(11, 12, 18) // 周四
  const ideas = [
    { id: 'a', kind: 'image', tags: ['封面'], createdAt: at(11, 9, 21, 5) },
    { id: 'b', kind: 'text', tags: ['选题', '封面'], createdAt: at(11, 9, 21, 40), done: true, doneAt: at(11, 11, 10) },
    { id: 'c', kind: 'image', tags: [], createdAt: at(11, 11, 7, 12) },
    { id: 'd', kind: 'link', tags: [], createdAt: at(11, 12, 23, 30) },
    { id: 'e', kind: 'text', tags: [], createdAt: at(11, 3, 9) },                  // 上周
    { id: 'f', kind: 'text', tags: [], createdAt: at(11, 4, 9), done: true, doneAt: at(11, 10, 9) }, // 上周记、本周完稿
    { id: 'g', kind: 'text', tags: [], createdAt: at(11, 10, 9), archived: true }, // 归档不算
  ]
  const s = weekStats(ideas, { now })
  assert.equal(s.total, 4)
  assert.equal(s.prevTotal, 2)
  assert.equal(s.activeDays, 3)
  assert.equal(s.elapsedDays, 4)
  assert.equal(s.peak, 21)
  assert.equal(s.peakLabel, '晚上 9 点')
  assert.equal(s.done, 2)
  assert.equal(s.doneOfWeek, 1)
  assert.deepEqual(s.topKind, { id: 'image', label: '图片', count: 2 })
  assert.deepEqual(s.topTag, { tag: '封面', count: 2 })
  assert.deepEqual(s.days.map(d => d.items.length), [2, 0, 1, 1, 0, 0, 0])
  assert.equal(s.days[3].today, true)
  assert.equal(s.days[4].future, true)
  assert.equal(s.days[3].future, false)
  assert.equal(s.heat[0][21], 2)
  assert.equal(s.heatMax, 2)
  assert.deepEqual(s.earliest, { day: '周三', time: '07:12' })
  assert.deepEqual(s.latest, { day: '周四', time: '23:30' })
  assert.equal(s.range, '11 月 9 日 – 11 月 15 日')
})

test('weekStats 空周和翻到上周', () => {
  const now = at(11, 12)
  const empty = weekStats([], { now })
  assert.equal(empty.total, 0)
  assert.equal(empty.peak, null)
  assert.equal(empty.topKind, null)
  assert.equal(empty.earliest, null)
  const prev = weekStats([{ id: 'x', kind: 'text', tags: [], createdAt: at(11, 3, 8) }], { now, offset: -1 })
  assert.equal(prev.total, 1)
  assert.equal(prev.isCurrent, false)
  assert.equal(prev.elapsedDays, 7)
})

test('splitHashtags 取出标签，网址里的 # 不动', () => {
  assert.deepEqual(splitHashtags('周末去 #探店 一家咖啡馆 #咖啡'), { text: '周末去 一家咖啡馆', tags: ['探店', '咖啡'] })
  assert.deepEqual(splitHashtags('#灵感 看 https://a.com/p#section'), { text: '看 https://a.com/p#section', tags: ['灵感'] })
  assert.deepEqual(splitHashtags('没有标签'), { text: '没有标签', tags: [] })
  assert.deepEqual(splitHashtags('＃标签 后面'), { text: '后面', tags: ['标签'] })
})
