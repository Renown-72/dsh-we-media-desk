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

test('sortIdeas 置顶优先、再按记录时间倒序', () => {
  const list = [
    { id: 'a', pinned: false, createdAt: 10, updatedAt: 99 },
    { id: 'b', pinned: true, createdAt: 5 },
    { id: 'c', pinned: false, createdAt: 20 },
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
    id: 'a', kind: 'text', text: '第一条', tags: ['x'], pinned: false, archived: false, createdAt: 5, updatedAt: 5,
  }])
  assert.deepEqual(normalizeIdeas('not array'), [])
})

import {
  extractUrl, classifyUrl, ideaFromInput, normalizeIdea, filterIdeas as filterAll, countKinds, groupByDay, createIdea as create,
} from '../src/ideas.js'

test('extractUrl 从分享文案里取出网址，其余作备注', () => {
  assert.deepEqual(
    extractUrl('【超好看的城市夜景】 https://b23.tv/AbC123 复制此链接，打开哔哩哔哩'),
    { url: 'https://b23.tv/AbC123', rest: '【超好看的城市夜景】 复制此链接，打开哔哩哔哩' },
  )
  assert.equal(extractUrl('看这个：https://example.com/a?b=1。').url, 'https://example.com/a?b=1')
  assert.equal(extractUrl('(https://example.com/x)').url, 'https://example.com/x')
  assert.deepEqual(extractUrl('  没有网址  '), { url: '', rest: '没有网址' })
  assert.equal(extractUrl('javascript:alert(1)').url, '')
})

test('classifyUrl 区分视频平台、图片直链、普通链接', () => {
  assert.equal(classifyUrl('https://www.bilibili.com/video/BV1xx'), 'video')
  assert.equal(classifyUrl('https://v.douyin.com/abc/'), 'video')
  assert.equal(classifyUrl('https://youtu.be/xyz'), 'video')
  assert.equal(classifyUrl('https://cdn.example.com/a.mp4'), 'video')
  assert.equal(classifyUrl('https://img.example.com/a.JPG'), 'image')
  assert.equal(classifyUrl('https://notbilibili.com/x'), 'link')
  assert.equal(classifyUrl('https://mp.weixin.qq.com/s/abc'), 'link')
})

test('ideaFromInput 自动识别类型', () => {
  const a = ideaFromInput({ input: '一个选题想法', tags: '#a' })
  assert.equal(a.kind, 'text')
  assert.equal(a.text, '一个选题想法')
  const b = ideaFromInput({ input: '参考 https://www.bilibili.com/video/BV1 这个开头' })
  assert.equal(b.kind, 'video')
  assert.equal(b.url, 'https://www.bilibili.com/video/BV1')
  assert.equal(b.text, '参考 这个开头')
  assert.throws(() => ideaFromInput({ input: '  ' }), /不能为空/)
})

test('createIdea 按类型校验必需内容', () => {
  assert.throws(() => create({ kind: 'image' }), /图片不能为空/)
  assert.throws(() => create({ kind: 'link', url: 'ftp://x' }), /链接地址不能为空/)
  const img = create({ kind: 'image', file: { name: 'f_abc12345.png', mime: 'image/png', size: 10, w: 100, h: 50 } })
  assert.deepEqual(img.file, { name: 'f_abc12345.png', mime: 'image/png', size: 10, w: 100, h: 50 })
  // 文件类型和灵感类型不一致时丢弃文件
  assert.throws(() => create({ kind: 'video', file: { name: 'f_abc12345.png', mime: 'image/png' } }), /视频不能为空/)
})

test('normalizeIdea 清洗附件、预览、位置等新字段', () => {
  const it = normalizeIdea({
    id: 'x', kind: 'link', url: 'https://a.com', text: '',
    preview: { title: ' 标题 ', image: 'javascript:1', extra: 1 },
    pos: { x: 10.4, y: -3 }, file: { name: 'f_abc12345.png', mime: 'image/png' },
  })
  assert.deepEqual(it.preview, { title: '标题', description: '', image: '', site: '' })
  assert.deepEqual(it.pos, { x: 10, y: -3 })
  assert.equal(it.file, undefined)
  assert.equal(normalizeIdea({ id: 'y', kind: 'image', file: { name: '../evil.png', mime: 'image/png' } }), null)
  assert.equal(normalizeIdea({ id: 'z', kind: 'weird', text: 'hi' }).kind, 'text')
})

test('filterIdeas 支持按类型筛选，关键词能搜到链接标题', () => {
  const list = [
    { id: '1', kind: 'text', text: '早餐', tags: [] },
    { id: '2', kind: 'link', text: '', url: 'https://a.com', preview: { title: '咖啡测评' }, tags: [] },
    { id: '3', kind: 'image', text: '', tags: [], archived: true },
  ]
  assert.deepEqual(filterAll(list, { kinds: ['link', 'image'] }).map(i => i.id), ['2'])
  assert.deepEqual(filterAll(list, { kinds: ['image'], includeArchived: true }).map(i => i.id), ['3'])
  assert.deepEqual(filterAll(list, { query: '咖啡' }).map(i => i.id), ['2'])
  assert.deepEqual(countKinds(list), { text: 1, image: 0, link: 1, video: 0 })
})

test('groupByDay 按天分组并标出今天、昨天', () => {
  const now = new Date(2026, 10, 10, 12).getTime()
  const groups = groupByDay([
    { id: 'a', createdAt: now - 1000 },
    { id: 'b', createdAt: now - 86400000 },
    { id: 'c', createdAt: new Date(2026, 10, 1, 9).getTime() },
  ], now)
  assert.deepEqual(groups.map(g => g.label), ['今天', '昨天', '2026-11-01'])
})
