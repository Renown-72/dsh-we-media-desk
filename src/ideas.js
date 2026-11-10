// 灵感（idea）的纯逻辑：不依赖 UI 和文件系统，方便单测。
// 一条灵感：
//   {
//     id, kind: 'text' | 'image' | 'link' | 'video',
//     text,                 // 文字内容 / 备注（非文字类可为空）
//     tags: string[], pinned, archived, createdAt, updatedAt,
//     done?, doneAt?,       // 已完稿及完稿时间
//     url?,                 // 链接 / 视频地址 / 网络图片地址
//     file?: { name, mime, size, w?, h? },   // 上传到 host 的图片或视频
//     preview?: { title, description, image, site },  // 链接预览
//     pos?: { x, y },       // 在画布上的位置
//   }

export const KINDS = [
  { id: 'text', label: '文字' },
  { id: 'image', label: '图片' },
  { id: 'link', label: '链接' },
  { id: 'video', label: '视频' },
]
const KIND_IDS = new Set(KINDS.map(k => k.id))

let seq = 0
export function newId(now = Date.now()) {
  seq = (seq + 1) % 1e6
  return `idea_${now}_${seq}`
}

// 解析标签输入："#美食 #旅行, 随手拍" -> ['美食','旅行','随手拍']
export function parseTags(raw) {
  if (!Array.isArray(raw)) raw = String(raw ?? '').split(/[\s,，]+/)
  const out = []
  const seen = new Set()
  for (const t of raw) {
    const tag = String(t).replace(/^#+/, '').trim()
    if (!tag) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag.slice(0, 24))
  }
  return out.slice(0, 12)
}

// ---- 网址识别 ----

export function isHttpUrl(s) {
  if (typeof s !== 'string' || s.length > 2048) return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// 从一段文字里取出第一个网址，剩下的作为备注。
// 适配各平台的分享文案，例如 "【标题】 https://b23.tv/abc 复制此链接…"
const URL_RE = /https?:\/\/[^\s<>"'`，。！？、；（）【】《》「」　]+/i
export function extractUrl(input) {
  const raw = String(input ?? '')
  const m = raw.match(URL_RE)
  if (!m) return { url: '', rest: raw.trim() }
  const url = m[0].replace(/[.,;:!?)\]}>]+$/, '')
  if (!isHttpUrl(url)) return { url: '', rest: raw.trim() }
  const rest = (raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
  return { url, rest }
}

const VIDEO_HOSTS = [
  'bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be', 'douyin.com', 'iesdouyin.com',
  'ixigua.com', 'kuaishou.com', 'v.qq.com', 'youku.com', 'iqiyi.com', 'vimeo.com',
  'tiktok.com', 'weishi.qq.com', 'acfun.cn',
]
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain)
}

// 网址属于哪类灵感：视频平台 / 直链视频 -> video，图片直链 -> image，其余 -> link
export function classifyUrl(url) {
  let u
  try { u = new URL(url) } catch { return 'link' }
  const host = u.hostname.toLowerCase()
  if (VIDEO_HOSTS.some(d => hostMatches(host, d))) return 'video'
  if (VIDEO_EXT.test(u.pathname)) return 'video'
  if (IMAGE_EXT.test(u.pathname)) return 'image'
  return 'link'
}

// 网址是否是能直接用 <video>/<img> 播放显示的文件
export function isDirectMedia(url) {
  try {
    const p = new URL(url).pathname
    return VIDEO_EXT.test(p) || IMAGE_EXT.test(p)
  } catch {
    return false
  }
}

export function siteName(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// 从输入里取出 #标签：只认开头或空白后的 #，网址里的 # 不受影响。
// "周末去 #探店 一家咖啡馆 #咖啡" -> { text: '周末去 一家咖啡馆', tags: ['探店','咖啡'] }
const HASHTAG_RE = /(^|\s)[#＃]([^\s#＃,，。.!！?？;；:：、()（）【】\[\]]{1,24})/g
export function splitHashtags(input) {
  const raw = String(input ?? '')
  const tags = []
  const text = raw.replace(HASHTAG_RE, (_m, pre, tag) => { tags.push(tag); return pre })
  return { text: text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(), tags: parseTags(tags) }
}

// ---- 构造与校验 ----

const FILE_NAME_RE = /^[a-z0-9_-]{1,64}\.[a-z0-9]{1,8}$/

function cleanStr(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function cleanNum(v) {
  return Number.isFinite(v) && v > 0 ? v : null
}

function cleanFile(f) {
  if (!f || typeof f !== 'object' || !FILE_NAME_RE.test(String(f.name))) return undefined
  const mime = cleanStr(f.mime, 100)
  if (!/^(image|video)\//.test(mime)) return undefined
  const out = { name: f.name, mime, size: cleanNum(f.size) ?? 0 }
  if (cleanNum(f.w) && cleanNum(f.h)) { out.w = Math.round(f.w); out.h = Math.round(f.h) }
  return out
}

function cleanPreview(p) {
  if (!p || typeof p !== 'object') return undefined
  const out = {
    title: cleanStr(p.title, 300),
    description: cleanStr(p.description, 600),
    image: isHttpUrl(p.image) ? p.image : '',
    site: cleanStr(p.site, 100),
  }
  return out.title || out.description || out.image || out.site ? out : undefined
}

function cleanPos(p) {
  if (!p || typeof p !== 'object') return undefined
  const ok = v => Number.isFinite(v) && Math.abs(v) < 1e6
  return ok(p.x) && ok(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : undefined
}

// 校验某类灵感必需的内容是否齐全，不齐返回错误信息。
function missingContent(it) {
  switch (it.kind) {
    case 'text': return it.text ? '' : '灵感内容不能为空'
    case 'link': return it.url ? '' : '链接地址不能为空'
    case 'image': return it.file || it.url ? '' : '图片不能为空'
    case 'video': return it.file || it.url ? '' : '视频不能为空'
    default: return '未知的灵感类型'
  }
}

function build(raw, { id, now }) {
  const kind = KIND_IDS.has(raw.kind) ? raw.kind : 'text'
  const it = {
    id,
    kind,
    text: cleanStr(raw.text, 2000),
    tags: parseTags(Array.isArray(raw.tags) ? raw.tags : raw.tags ?? []),
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    createdAt: cleanNum(raw.createdAt) ?? cleanNum(raw.updatedAt) ?? now,
    updatedAt: 0,
  }
  it.updatedAt = cleanNum(raw.updatedAt) ?? it.createdAt
  if (raw.done === true) {
    it.done = true
    it.doneAt = cleanNum(raw.doneAt) ?? it.updatedAt
  }
  if (kind !== 'text' && isHttpUrl(raw.url)) it.url = raw.url
  if (kind === 'image' || kind === 'video') {
    const file = cleanFile(raw.file)
    if (file && file.mime.startsWith(kind + '/')) it.file = file
  }
  if (kind === 'link' || kind === 'video') {
    const preview = cleanPreview(raw.preview)
    if (preview) it.preview = preview
  }
  const pos = cleanPos(raw.pos)
  if (pos) it.pos = pos
  return it
}

// 新建灵感：校验失败直接抛错。
export function createIdea({ now = Date.now(), ...fields } = {}) {
  const it = build({ ...fields, pinned: false, archived: false, createdAt: now, updatedAt: now }, { id: newId(now), now })
  const err = missingContent(it)
  if (err) throw new Error(err)
  return it
}

// 把一段输入（文字或分享文案）变成灵感：含网址时自动识别为链接 / 视频 / 图片。
export function ideaFromInput({ input, tags, now = Date.now(), pos } = {}) {
  const { url, rest } = extractUrl(input)
  if (url) return createIdea({ kind: classifyUrl(url), url, text: rest, tags, now, pos })
  return createIdea({ kind: 'text', text: rest, tags, now, pos })
}

// 把外部传入（前端 / 旧数据）的灵感清洗成合法结构；不合法返回 null。
export function normalizeIdea(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null
  const id = cleanStr(String(raw.id ?? ''), 64)
  if (!id) return null
  const it = build(raw, { id, now })
  return missingContent(it) ? null : it
}

// 清洗整个列表：丢弃非法项，按 id 去重（保留先出现的），限制总数。
export const MAX_IDEAS = 5000
export function normalizeIdeas(list, now = Date.now()) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const it = normalizeIdea(raw, now)
    if (!it || seen.has(it.id)) continue
    seen.add(it.id)
    out.push(it)
    if (out.length >= MAX_IDEAS) break
  }
  return out
}

// ---- 排序 / 筛选 / 统计 ----

// 排序：置顶优先，其次按创建时间倒序（信息流按记录时间排列）。
export function sortIdeas(list) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
}

function haystack(it) {
  const p = it.preview || {}
  return [it.text, it.url, p.title, p.description, p.site, ...(it.tags || [])].filter(Boolean).join(' ').toLowerCase()
}

// 过滤：关键词（文字、标签、链接标题等）+ 标签 + 类型 + 是否含归档
export function filterIdeas(list, { query = '', tag = '', kinds = [], includeArchived = false } = {}) {
  const q = String(query).trim().toLowerCase()
  const t = String(tag).trim()
  const ks = new Set(kinds)
  return list.filter(it => {
    if (!includeArchived && it.archived) return false
    if (ks.size && !ks.has(it.kind || 'text')) return false
    if (t && !(it.tags || []).includes(t)) return false
    if (q && !haystack(it).includes(q)) return false
    return true
  })
}

// 列出所有用到的标签及数量，按数量倒序。
export function collectTags(list) {
  const map = new Map()
  for (const it of list) {
    if (it.archived) continue
    for (const tag of it.tags || []) map.set(tag, (map.get(tag) || 0) + 1)
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

// 各类型数量（不含归档）
export function countKinds(list) {
  const out = Object.fromEntries(KINDS.map(k => [k.id, 0]))
  for (const it of list) if (!it.archived) out[it.kind || 'text'] = (out[it.kind || 'text'] || 0) + 1
  return out
}

// 按天分组（信息流用），list 需已排好序。
export function groupByDay(list, now = Date.now()) {
  const dayKey = ts => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = dayKey(now)
  const yesterday = dayKey(now - 86400000)
  const groups = []
  const byKey = new Map()
  for (const it of list) {
    const key = dayKey(it.createdAt)
    let g = byKey.get(key)
    if (!g) {
      const label = key === today ? '今天' : key === yesterday ? '昨天' : key
      g = { key, label, items: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.items.push(it)
  }
  return groups
}
