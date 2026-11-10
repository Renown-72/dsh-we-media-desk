// 自媒体工作台 —— host 半边入口。
// 在 DSH 里作为插件被加载：注册 /we-media-desk/* HTTP 接口，供浏览器半片读写数据。
//
// 接口（均只接受本机同源请求）：
//   GET  /we-media-desk/health  -> { ok, plugin }
//   GET  /we-media-desk/ideas   -> { ok, ideas }
//   PUT  /we-media-desk/ideas   <- { ideas: [...] }  整体替换，返回 { ok, count }
//   POST /we-media-desk/files   <- 文件原始内容（content-type 为文件类型）返回 { ok, file }
//   GET  /we-media-desk/files/<name>   读取附件（支持 Range）
//   DELETE /we-media-desk/files/<name> 删除附件
//   GET  /we-media-desk/preview?url=   链接预览 { ok, preview }
import { Store, DATA_DIR_NAME, defaultDataDir } from './store.js'
import { normalizeIdeas } from './ideas.js'
import { FileStore } from './files.js'
import { fetchPreview } from './preview.js'

export const name = 'dsh-we-media-desk'
export const ROUTE_PREFIX = '/we-media-desk'
const MAX_BODY = 8 * 1024 * 1024

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(buf.byteLength),
    'cache-control': 'no-store',
  })
  res.end(buf)
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

async function readJson(req, limit = MAX_BODY) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw httpError(413, '请求体过大')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw httpError(400, '请求不是有效的 JSON')
  }
}

function ctxGet(ctx, key) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(key) : undefined
  } catch {
    return undefined
  }
}

// 访问控制：优先用 DSH 自带的 connection 判定；没有时退回“仅本机 + 同源”。
function isLoopback(address) {
  if (!address) return false
  const a = address.startsWith('::ffff:') ? address.slice(7) : address
  return a === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a)
}

export function refusalOf(ctx, req) {
  const connection = ctxGet(ctx, 'connection')
  if (typeof connection?.requestRejection === 'function') return connection.requestRejection(req)
  if (!isLoopback(req.socket?.remoteAddress)) return 403
  const host = req.headers.host
  if (host !== undefined) {
    if (!URL.canParse(`http://${host}`)) return 403
    const hostname = new URL(`http://${host}`).hostname
    if (hostname !== 'localhost' && hostname !== '[::1]' && !/^127\.\d+\.\d+\.\d+$/.test(hostname)) return 403
  }
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 403
  const origin = req.headers.origin
  if (origin === undefined) return undefined
  if (!URL.canParse(origin)) return 403
  return new URL(origin).host === host ? undefined : 403
}

export function resolveDataDir(ctx) {
  const resolvePath = ctxGet(ctx, 'dshHomePath')
  if (typeof resolvePath === 'function') return resolvePath(DATA_DIR_NAME)
  return defaultDataDir()
}

// 生成 HTTP 处理函数；独立导出便于单测。
export function createHandler({ ctx, store, files = new FileStore(store.dir), preview = fetchPreview }) {
  async function route(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.slice(ROUTE_PREFIX.length) || '/'
    const method = req.method ?? 'GET'

    if (path === '/health') {
      if (method !== 'GET') throw httpError(405, 'method not allowed')
      return json(res, 200, { ok: true, plugin: name })
    }

    if (path === '/ideas') {
      if (method === 'GET') {
        const state = await store.read()
        return json(res, 200, { ok: true, ideas: normalizeIdeas(state.ideas) })
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        if (!Array.isArray(body.ideas)) throw httpError(400, 'ideas 必须是数组')
        const ideas = normalizeIdeas(body.ideas)
        await store.update(s => { s.ideas = ideas })
        return json(res, 200, { ok: true, count: ideas.length })
      }
      throw httpError(405, 'method not allowed')
    }

    if (path === '/files') {
      if (method !== 'POST') throw httpError(405, 'method not allowed')
      const file = await files.save(req, req.headers['content-type'])
      return json(res, 200, { ok: true, file })
    }

    if (path.startsWith('/files/')) {
      const fileName = decodeURIComponent(path.slice('/files/'.length))
      if (method === 'GET' || method === 'HEAD') return files.send(req, res, fileName)
      if (method === 'DELETE') {
        await files.remove(fileName)
        return json(res, 200, { ok: true })
      }
      throw httpError(405, 'method not allowed')
    }

    if (path === '/preview') {
      if (method !== 'GET') throw httpError(405, 'method not allowed')
      return json(res, 200, { ok: true, preview: await preview(url.searchParams.get('url') || '') })
    }

    throw httpError(404, 'not found')
  }

  return async (req, res) => {
    try {
      const refused = refusalOf(ctx, req)
      if (refused !== undefined) return json(res, refused, { ok: false, error: refused === 401 ? 'unauthorized' : 'forbidden' })
      await route(req, res)
    } catch (err) {
      if (res.headersSent) { res.destroy(); return }
      const status = err.status || 500
      if (status >= 500) ctx?.logger?.warn?.(`${name}: ${err.message}`)
      json(res, status, { ok: false, error: err.message })
    }
  }
}

export default {
  name,
  inject: ['webServer'],
  apply(ctx) {
    const store = new Store(resolveDataDir(ctx))
    const handler = createHandler({ ctx, store })
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler,
    }), `${name}: ${ROUTE_PREFIX} routes`)
  },
}
