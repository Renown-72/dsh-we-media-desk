import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMeta, fetchPreview } from '../src/preview.js'

test('parseMeta 读取 Open Graph，补全相对封面地址并解码实体', () => {
  const html = `<html><head>
    <title>备用标题</title>
    <meta property="og:title" content="视频 &amp; 标题">
    <meta content="一段描述" name="description">
    <meta property="og:image" content="//i0.hdslb.com/cover.jpg">
    <meta property="og:site_name" content="哔哩哔哩">
  </head></html>`
  assert.deepEqual(parseMeta(html, 'https://www.bilibili.com/video/BV1'), {
    title: '视频 & 标题',
    description: '一段描述',
    image: 'https://i0.hdslb.com/cover.jpg',
    site: '哔哩哔哩',
  })
  const bare = parseMeta('<title> 只有标题 </title><meta property="og:image" content="/a.png">', 'https://www.example.com/x')
  assert.deepEqual(bare, { title: '只有标题', description: '', image: 'https://www.example.com/a.png', site: 'example.com' })
})

function fakeFetch(html, { type = 'text/html; charset=utf-8', status = 200, encode } = {}) {
  return async url => new Response(encode ? encode(html) : html, { status, headers: { 'content-type': type } })
}

test('fetchPreview 抓取并解析；失败时只返回站点名', async () => {
  const ok = await fetchPreview('https://a.example.com/p', { fetchImpl: fakeFetch('<head><title>你好</title></head>') })
  assert.equal(ok.title, '你好')
  assert.equal(ok.site, 'a.example.com')
  const notHtml = await fetchPreview('https://a.example.com/f.zip', { fetchImpl: fakeFetch('PK', { type: 'application/zip' }) })
  assert.deepEqual(notHtml, { title: '', description: '', image: '', site: 'a.example.com' })
  const boom = await fetchPreview('https://a.example.com/', { fetchImpl: async () => { throw new Error('net') } })
  assert.equal(boom.site, 'a.example.com')
  await assert.rejects(fetchPreview('file:///etc/passwd'), /http/)
})

test('fetchPreview 按页面声明的 GBK 编码解码', async () => {
  // "中文" 的 GBK 编码
  const gbk = Buffer.concat([Buffer.from('<head><meta charset="gbk"><title>'), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from('</title></head>')])
  const res = await fetchPreview('https://gbk.example.com/', { fetchImpl: async () => new Response(gbk, { headers: { 'content-type': 'text/html' } }) })
  assert.equal(res.title, '中文')
})
