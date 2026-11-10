// 链接预览：抓取网页 <head> 里的标题、描述、封面图（Open Graph / Twitter Card / <title>）。
import { isHttpUrl, siteName } from './ideas.js'

const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 8000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function attrsOf(tag) {
  const out = {}
  const re = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
  let m
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '')
  return out
}

function clean(s, max) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

// 纯函数：从 HTML 中解析预览信息。
export function parseMeta(html, baseUrl) {
  const meta = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0])
    const key = (a.property || a.name || a.itemprop || '').toLowerCase()
    if (key && a.content && !(key in meta)) meta[key] = a.content
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  let image = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || meta.image || ''
  if (image) {
    try {
      image = new URL(image.startsWith('//') ? 'https:' + image : image, baseUrl).href
    } catch {
      image = ''
    }
  }
  return {
    title: clean(meta['og:title'] || meta['twitter:title'] || (titleTag ? decodeEntities(titleTag[1]) : ''), 300),
    description: clean(meta['og:description'] || meta['twitter:description'] || meta.description, 600),
    image: isHttpUrl(image) ? image : '',
    site: clean(meta['og:site_name'], 100) || siteName(baseUrl),
  }
}

function charsetOf(contentType, head) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType || '')
  if (fromHeader) return fromHeader[1]
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)
  return fromMeta ? fromMeta[1] : 'utf-8'
}

function decode(buf, charset) {
  try {
    return new TextDecoder(charset).decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

// 抓取网页并解析；失败时只返回站点名，不抛错。
export async function fetchPreview(url, { fetchImpl = fetch } = {}) {
  if (!isHttpUrl(url)) throw Object.assign(new Error('只支持 http/https 链接'), { status: 400 })
  const fallback = { title: '', description: '', image: '', site: siteName(url) }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6' },
    })
    const type = res.headers.get('content-type') || ''
    if (!res.ok || !/html|xml/i.test(type) || !res.body) {
      res.body?.cancel?.().catch(() => {})
      return fallback
    }
    // 只读到 </head> 或 1MB 为止
    const chunks = []
    let size = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
      if (size >= MAX_BYTES) break
      if (Buffer.from(value).includes('</head>')) break
    }
    reader.cancel().catch(() => {})
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
    const ascii = buf.toString('latin1')
    const html = decode(buf, charsetOf(type, ascii.slice(0, 4096)))
    const finalUrl = res.url || url
    const meta = parseMeta(html, finalUrl)
    return { ...meta, site: meta.site || fallback.site }
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
