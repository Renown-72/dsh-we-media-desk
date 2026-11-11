import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import plugin, { createHandler, resolveDataDir } from '../src/host.js'
import { Store } from '../src/store.js'

async function withServer(fn, ctx = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'wk-host-'))
  const store = new Store(dir)
  const server = createServer(createHandler({ ctx, store }))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}/we-media-desk`
  try {
    await fn(base, store)
  } finally {
    await new Promise(r => server.close(r))
    await rm(dir, { recursive: true, force: true })
  }
}

const put = (url, body, headers = {}) => fetch(url, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

test('health 与未知路径', () => withServer(async base => {
  assert.deepEqual(await (await fetch(base + '/health')).json(), { ok: true, plugin: 'dsh-we-media-desk' })
  assert.equal((await fetch(base + '/nope')).status, 404)
  assert.equal((await fetch(base + '/health', { method: 'POST' })).status, 405)
}))

test('ideas 读写往返，写入时清洗数据', () => withServer(async (base, store) => {
  assert.deepEqual(await (await fetch(base + '/ideas')).json(), { ok: true, ideas: [] })
  const res = await put(base + '/ideas', { ideas: [{ id: 'i1', text: '想法', tags: ['#a'], createdAt: 10 }, { id: '', text: 'x' }] })
  assert.deepEqual(await res.json(), { ok: true, count: 1 })
  const { ideas } = await (await fetch(base + '/ideas')).json()
  assert.equal(ideas.length, 1)
  assert.deepEqual(ideas[0].tags, ['a'])
  assert.equal((await store.read()).ideas[0].id, 'i1')
}))

test('ideas 拒绝错误请求体', () => withServer(async base => {
  assert.equal((await put(base + '/ideas', '{bad json')).status, 400)
  assert.equal((await put(base + '/ideas', { ideas: 'x' })).status, 400)
  assert.equal((await fetch(base + '/ideas', { method: 'DELETE' })).status, 405)
}))

test('访问控制：跨站请求被拒，DSH connection 判定优先', async () => {
  await withServer(async base => {
    const res = await fetch(base + '/ideas', { headers: { origin: 'http://evil.example' } })
    assert.equal(res.status, 403)
    const res2 = await fetch(base + '/ideas', { headers: { 'sec-fetch-site': 'cross-site' } })
    assert.equal(res2.status, 403)
  })
  const ctx = { get: k => (k === 'connection' ? { requestRejection: () => 401 } : undefined) }
  await withServer(async base => {
    assert.equal((await fetch(base + '/health')).status, 401)
  }, ctx)
})

test('数据目录优先用 DSH 提供的 dshHomePath', () => {
  const ctx = { get: k => (k === 'dshHomePath' ? (...s) => join('/dsh-home', ...s) : undefined) }
  assert.equal(resolveDataDir(ctx), join('/dsh-home', 'we-media-desk'))
})

test('apply 向 webServer 注册 /we-media-desk 前缀路由', () => {
  const registered = []
  const ctx = {
    get: () => undefined,
    effect: fn => fn(),
    webServer: { register: route => { registered.push(route); return () => {} } },
  }
  plugin.apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'prefix')
  assert.equal(registered[0].path, '/we-media-desk')
})

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

test('files 上传、读取（含 Range）、删除', () => withServer(async base => {
  const up = await fetch(base + '/files', { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
  const { ok, file } = await up.json()
  assert.equal(ok, true)
  assert.match(file.name, /^f_[a-z0-9]+\.png$/)
  assert.equal(file.size, PNG.length)

  const got = await fetch(`${base}/files/${file.name}`)
  assert.equal(got.status, 200)
  assert.equal(got.headers.get('content-type'), 'image/png')
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG)

  const part = await fetch(`${base}/files/${file.name}`, { headers: { range: 'bytes=2-5' } })
  assert.equal(part.status, 206)
  assert.equal(part.headers.get('content-range'), `bytes 2-5/${PNG.length}`)
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), PNG.subarray(2, 6))
  assert.equal((await fetch(`${base}/files/${file.name}`, { headers: { range: 'bytes=999-' } })).status, 416)

  assert.equal((await fetch(`${base}/files/${file.name}`, { method: 'DELETE' })).status, 200)
  assert.equal((await fetch(`${base}/files/${file.name}`)).status, 404)
}))

test('files 拒绝 SVG、空文件、非法文件名', () => withServer(async base => {
  const svg = await fetch(base + '/files', { method: 'POST', headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' })
  assert.equal(svg.status, 415)
  const empty = await fetch(base + '/files', { method: 'POST', headers: { 'content-type': 'image/png' }, body: '' })
  assert.equal(empty.status, 400)
  assert.equal((await fetch(base + '/files/..%2Fstate.json')).status, 400)
  assert.equal((await fetch(base + '/files/f_abcdefgh.exe')).status, 400)
}))

test('preview 接口把 url 交给预览函数', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wk-host-'))
  const seen = []
  const server = createServer(createHandler({
    ctx: {}, store: new Store(dir),
    preview: async u => { seen.push(u); return { title: 'T', description: '', image: '', site: 's' } },
  }))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/we-media-desk/preview?url=${encodeURIComponent('https://x.com/a?b=1')}`)
    assert.deepEqual(await res.json(), { ok: true, preview: { title: 'T', description: '', image: '', site: 's' } })
    assert.deepEqual(seen, ['https://x.com/a?b=1'])
  } finally {
    await new Promise(r => server.close(r))
    await rm(dir, { recursive: true, force: true })
  }
})

test('scripts：PUT 后 GET 读回，非法项被清洗', () => withServer(async base => {
  const r = await put(base + '/scripts', { scripts: [{ id: 'a', title: '城市夜景', status: 'write', body: '开头' }, { id: 'b', title: '' }] })
  assert.equal(r.status, 200)
  const got = await (await fetch(base + '/scripts')).json()
  assert.deepEqual(got.scripts.map(s => [s.id, s.title, s.status, s.body]), [['a', '城市夜景', 'write', '开头']])
  assert.equal((await put(base + '/scripts', { scripts: 'x' })).status, 400)
}))
