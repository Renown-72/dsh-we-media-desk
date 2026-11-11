// 链接预览：抓取网页 <head> 里的标题、描述、封面图（Open Graph / Twitter Card / <title>）。
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isHttpUrl, siteName } from './ideas.js'

const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 8000
const MAX_REDIRECTS = 5
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

// ---- 只允许访问公网：粘贴的链接可能指向本机或局域网里的服务 ----

function ipv4Parts(address) {
  let a = address.toLowerCase()
  if (a.startsWith('::ffff:')) a = a.slice(7)
  // ::ffff:127.0.0.1 可能被写成 ::ffff:7f00:1
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    a = [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
  }
  return isIP(a) === 4 ? a.split('.').map(Number) : null
}

export function isPublicAddress(address) {
  const v4 = ipv4Parts(address)
  if (v4) {
    const [a, b] = v4
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||  // 运营商级 NAT
      (a === 169 && b === 254) ||            // 链路本地
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && v4[2] === 0)
      // 198.18.0.0/15 不拦：Clash 等代理的 fake-ip 模式会把所有域名解析到这里
    )
  }
  const v6 = address.toLowerCase()
  if (isIP(v6) !== 6) return false
  return !(v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff') || v6.startsWith('64:ff9b:'))
}

// 检查网址能否抓取；不能时抛出带 status 的错误。
export async function assertPublicUrl(raw, lookupImpl = lookup) {
  if (!isHttpUrl(raw)) throw Object.assign(new Error('只支持 http/https 链接'), { status: 400 })
  const url = new URL(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  // 代理的 fake-ip 模式下 DNS 看不出真实去向，所以还要按名字拦内网主机：
  // 不带点的主机名（如 nas）和常见的内网后缀
  const intranetName = !isIP(host) && (!host.includes('.') || /\.(localhost|local|internal|lan|home|localdomain|intranet|corp|home\.arpa)$/.test(host))
  if (host === 'localhost' || intranetName) {
    throw Object.assign(new Error('不能抓取本机或内网地址'), { status: 400 })
  }
  const records = isIP(host) ? [{ address: host }] : await lookupImpl(host, { all: true })
  if (!records.length || records.some(r => !isPublicAddress(r.address))) {
    throw Object.assign(new Error('不能抓取本机或内网地址'), { status: 400 })
  }
  return url
}

// 手动跟随跳转，每一跳都重新检查，防止公网地址跳到内网。
async function fetchPublic(raw, { fetchImpl, lookupImpl, signal, headers }) {
  let current = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current, lookupImpl)
    const res = await fetchImpl(url.href, { redirect: 'manual', signal, headers })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      res.body?.cancel?.().catch(() => {})
      current = new URL(location, url).href
      continue
    }
    return { res, finalUrl: url.href }
  }
  throw new Error('跳转次数过多')
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

// 抓取网页并解析；网址不合法或指向内网时抛错，其他失败只返回站点名。
export async function fetchPreview(url, { fetchImpl = fetch, lookupImpl = lookup } = {}) {
  await assertPublicUrl(url, lookupImpl)
  const fallback = { title: '', description: '', image: '', site: siteName(url) }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const { res, finalUrl } = await fetchPublic(url, {
      fetchImpl,
      lookupImpl,
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
    const meta = parseMeta(html, finalUrl)
    return { ...meta, site: meta.site || fallback.site }
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
