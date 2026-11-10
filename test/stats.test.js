import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ideaStats, dateLine } from '../client/ideas/stats.js'
import { splitHashtags } from '../src/ideas.js'

const at = (m, d, h = 12) => new Date(2026, m - 1, d, h).getTime()

test('ideaStats 统计今天、本周、总数和连续天数', () => {
  const now = at(11, 10, 15) // 周二
  const ideas = [
    { id: 'a', createdAt: at(11, 10, 9) },
    { id: 'b', createdAt: at(11, 9, 22) },      // 周一
    { id: 'c', createdAt: at(11, 8, 10) },      // 周日（上周）
    { id: 'd', createdAt: at(11, 5, 10) },      // 断开
    { id: 'e', createdAt: at(11, 10, 10), archived: true },
  ]
  const s = ideaStats(ideas, now)
  assert.equal(s.today, 1)
  assert.equal(s.week, 2)
  assert.equal(s.total, 4)
  assert.equal(s.streak, 3)
  assert.equal(s.days.length, 14)
  assert.equal(s.days[13].today, true)
  assert.equal(s.days[13].count, 2)
  assert.equal(s.days[12].count, 1)
})

test('今天还没记时，连续天数从昨天算起', () => {
  const s = ideaStats([{ id: 'a', createdAt: at(11, 9) }, { id: 'b', createdAt: at(11, 8) }], at(11, 10, 8))
  assert.equal(s.streak, 2)
  assert.equal(ideaStats([{ id: 'a', createdAt: at(11, 7) }], at(11, 10)).streak, 0)
  assert.equal(ideaStats([], at(11, 10)).streak, 0)
})

test('dateLine', () => {
  assert.equal(dateLine(at(11, 10)), '2026 · 11 月 10 日 · 周二')
})

test('splitHashtags 取出标签，网址里的 # 不动', () => {
  assert.deepEqual(splitHashtags('周末去 #探店 一家咖啡馆 #咖啡'), { text: '周末去 一家咖啡馆', tags: ['探店', '咖啡'] })
  assert.deepEqual(splitHashtags('#灵感 看 https://a.com/p#section'), { text: '看 https://a.com/p#section', tags: ['灵感'] })
  assert.deepEqual(splitHashtags('没有标签'), { text: '没有标签', tags: [] })
  assert.deepEqual(splitHashtags('全角＃标签，后面'), { text: '全角＃标签，后面', tags: [] })
  assert.deepEqual(splitHashtags('＃标签 后面'), { text: '后面', tags: ['标签'] })
})
