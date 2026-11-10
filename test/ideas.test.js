import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTags, createIdea, sortIdeas, filterIdeas, collectTags } from '../src/ideas.js'

test('parseTags 去 #、去重、限制数量', () => {
  assert.deepEqual(parseTags('#美食 #旅行'), ['美食', '旅行'])
  assert.deepEqual(parseTags('美食,  旅行，随手拍'), ['美食', '旅行', '随手拍'])
  assert.deepEqual(parseTags(['#a', 'a', '', '  ', 'b']), ['a', 'b'])
  assert.equal(parseTags(Array.from({ length: 20 }, (_, i) => 't' + i)).length, 12)
})

test('createIdea 校验空内容并生成字段', () => {
  assert.throws(() => createIdea({ text: '   ' }), /不能为空/)
  const it = createIdea({ text: '  一个想法  ', tags: '#a', now: 1000 })
  assert.equal(it.text, '一个想法')
  assert.deepEqual(it.tags, ['a'])
  assert.equal(it.pinned, false)
  assert.equal(it.archived, false)
  assert.equal(it.createdAt, 1000)
  assert.equal(it.updatedAt, 1000)
  assert.ok(it.id)
})

test('sortIdeas 置顶优先、再按更新时间倒序', () => {
  const list = [
    { id: 'a', pinned: false, updatedAt: 10 },
    { id: 'b', pinned: true, updatedAt: 5 },
    { id: 'c', pinned: false, updatedAt: 20 },
  ]
  assert.deepEqual(sortIdeas(list).map(x => x.id), ['b', 'c', 'a'])
})

test('filterIdeas 按关键词、标签过滤并默认排除归档', () => {
  const list = [
    { id: '1', text: '周末去爬山', tags: ['户外'], archived: false },
    { id: '2', text: '写一篇 AI 笔记', tags: ['科技'], archived: false },
    { id: '3', text: '爬山后的感悟', tags: ['户外'], archived: true },
  ]
  assert.deepEqual(filterIdeas(list, { query: '爬山' }).map(x => x.id), ['1'])
  assert.deepEqual(filterIdeas(list, { tag: '户外' }).map(x => x.id), ['1'])
  assert.deepEqual(filterIdeas(list, { query: '爬山', includeArchived: true }).map(x => x.id), ['1', '3'])
  assert.deepEqual(filterIdeas(list, {}).map(x => x.id), ['1', '2'])
})

test('collectTags 统计非归档标签并按数量倒序', () => {
  const list = [
    { tags: ['a', 'b'], archived: false },
    { tags: ['a'], archived: false },
    { tags: ['c'], archived: true },
  ]
  assert.deepEqual(collectTags(list), [{ tag: 'a', count: 2 }, { tag: 'b', count: 1 }])
})

test('normalizeIdeas 丢弃非法项、按 id 去重、补全字段', async () => {
  const { normalizeIdeas } = await import('../src/ideas.js')
  const out = normalizeIdeas([
    { id: 'a', text: ' 第一条 ', tags: ['#x', 'x'], pinned: 'yes', createdAt: 5 },
    { id: 'a', text: '重复 id' },
    { id: 'b', text: '   ' },
    { text: '缺 id' },
    null,
    'str',
  ], 100)
  assert.deepEqual(out, [{
    id: 'a', text: '第一条', tags: ['x'], pinned: false, archived: false, createdAt: 5, updatedAt: 5,
  }])
  assert.deepEqual(normalizeIdeas('not array'), [])
})
