// 自媒体工作台 —— host 半边入口。
// 在 DSH 里作为插件被加载：注册 /we-media-desk/* HTTP 接口，供浏览器半片读写数据。

export const name = 'dsh-we-media-desk'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

async function route(ctx, req, res) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname.replace(/^\/we-media-desk/, '') || '/'

  // 健康检查：确认插件 host 半片已加载
  if (path === '/health') {
    return json(res, 200, { ok: true, plugin: name })
  }

  return json(res, 404, { error: 'not found' })
}

export default {
  inject: ['webServer'],
  apply(ctx) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/we-media-desk',
      handler: async (req, res) => {
        try {
          await route(ctx, req, res)
        } catch (err) {
          if (res.headersSent) { res.end(); return }
          json(res, err.status || 500, { error: err.message })
        }
      },
    }), 'dsh-we-media-desk: /we-media-desk routes')
  },
}
