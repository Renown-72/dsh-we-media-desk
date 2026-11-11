import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keywords, relatedIdeas } from '../client/ideas/related.js'

test('keywords 拆出英文单词、短中文词和两字片段，去掉停用词', () => {
  const k = keywords('用 Claude Code 写一个 AI agent 教程')
  for (const w of ['claude', 'code', 'ai', 'agent', '教程']) assert.ok(k.has(w), w)
  assert.ok(!k.has('一个'))
  assert.ok(keywords('咖啡探店').has('咖啡探店'))
  assert.ok(keywords('咖啡探店').has('探店'))
})

test('relatedIdeas 按共同关键词和标签排序，排除自己和归档', () => {
  const ideas = [
    { id: 'a', text: 'AI agent 的十个用法', tags: [], createdAt: 1 },
    { id: 'b', text: '周末去咖啡探店', tags: ['探店'], createdAt: 2 },
    { id: 'c', text: '做一期 agent 入门视频', tags: ['AI'], createdAt: 3 },
    { id: 'd', text: '今天的视频剪辑好累', tags: [], createdAt: 4 },
    { id: 'e', text: 'agent 归档的', tags: [], archived: true, createdAt: 5 },
    { id: 'self', text: 'agent 选题', tags: [], createdAt: 6 },
  ]
  const r = relatedIdeas(ideas, { id: 'self', text: '聊聊 AI agent 能做什么', tags: ['AI'] })
  assert.deepEqual(r, ['c', 'a'])
  assert.deepEqual(relatedIdeas(ideas, { text: '咖啡', tags: ['探店'] }), ['b'])
  // 只撞上泛泛的两字片段不算相关
  assert.deepEqual(relatedIdeas(ideas, { text: '视频号' }), [])
  assert.deepEqual(relatedIdeas(ideas, { text: '   ' }), [])
})

test('relatedIdeas 也会匹配链接标题', () => {
  const ideas = [{ id: 'l', kind: 'link', text: '', url: 'https://x.com', preview: { title: 'Rust 异步编程指南' }, tags: [] }]
  assert.deepEqual(relatedIdeas(ideas, { text: '想做一期 rust 教程' }), ['l'])
})
