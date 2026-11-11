import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMeta, fetchPreview as realFetchPreview, isPublicAddress, assertPublicUrl } from '../src/preview.js'

// 测试里的域名都当作公网地址，不真的查 DNS
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]
const fetchPreview = (url, opts = {}) => realFetchPreview(url, { lookupImpl: publicLookup, ...opts })

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

test('isPublicAddress 识别本机、局域网和保留地址', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPublicAddress(a), false, a)
  }
  for (const a of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111', '198.18.0.15']) assert.equal(isPublicAddress(a), true, a)
})

test('assertPublicUrl 拒绝本机名、内网 IP、解析到内网的域名', async () => {
  await assert.rejects(assertPublicUrl('http://localhost:3000/'), /内网/)
  await assert.rejects(assertPublicUrl('http://192.168.1.1/'), /内网/)
  await assert.rejects(assertPublicUrl('http://[::1]/'), /内网/)
  for (const h of ['nas', 'router.lan', 'pi.home', 'box.localdomain', 'x.home.arpa', 'printer.local']) {
    await assert.rejects(assertPublicUrl(`http://${h}/`, publicLookup), /内网/, h)
  }
  await assert.rejects(assertPublicUrl('http://router.example/', async () => [{ address: '10.0.0.1' }]), /内网/)
  await assert.rejects(assertPublicUrl('http://mixed.example/', async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }]), /内网/)
  assert.equal((await assertPublicUrl('https://ok.example/a', publicLookup)).href, 'https://ok.example/a')
})

test('fetchPreview 跟随跳转时每一跳都检查，跳到内网就停', async () => {
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (url.startsWith('https://short.example')) return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/admin' } })
    return new Response('<title>secret</title>', { headers: { 'content-type': 'text/html' } })
  }
  const res = await fetchPreview('https://short.example/x', { fetchImpl })
  assert.equal(res.title, '')
  assert.deepEqual(calls, ['https://short.example/x'])

  // 正常跳转：标题取自最终页面，相对封面按最终地址补全
  const ok = async url => url.includes('/start')
    ? new Response(null, { status: 301, headers: { location: '/final' } })
    : new Response('<title>到了</title><meta property="og:image" content="c.png">', { headers: { 'content-type': 'text/html' } })
  const r = await fetchPreview('https://a.example/start', { fetchImpl: ok })
  assert.equal(r.title, '到了')
  assert.equal(r.image, 'https://a.example/c.png')
})
