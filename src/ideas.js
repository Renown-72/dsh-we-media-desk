// 灵感（idea）的纯逻辑：不依赖 UI 和文件系统，方便单测。
// 一条灵感：
//   { id, text, tags: string[], pinned: boolean, archived: boolean, createdAt, updatedAt }

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

export function createIdea({ text, tags, now = Date.now() } = {}) {
  const clean = String(text ?? '').trim()
  if (!clean) throw new Error('灵感内容不能为空')
  return {
    id: newId(now),
    text: clean.slice(0, 2000),
    tags: parseTags(tags),
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

// 排序：置顶优先，其次按更新时间倒序。
export function sortIdeas(list) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
  })
}

// 过滤：关键词（匹配文本或标签）+ 标签 + 是否含归档
export function filterIdeas(list, { query = '', tag = '', includeArchived = false } = {}) {
  const q = String(query).trim().toLowerCase()
  const t = String(tag).trim()
  return list.filter(it => {
    if (!includeArchived && it.archived) return false
    if (t && !(it.tags || []).includes(t)) return false
    if (q) {
      const hay = (it.text + ' ' + (it.tags || []).join(' ')).toLowerCase()
      if (!hay.includes(q)) return false
    }
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

// 把外部传入（前端 / 旧数据）的灵感清洗成合法结构；不合法返回 null。
export function normalizeIdea(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null
  const text = String(raw.text ?? '').trim().slice(0, 2000)
  const id = String(raw.id ?? '').trim().slice(0, 64)
  if (!text || !id) return null
  const num = v => (Number.isFinite(v) && v > 0 ? v : null)
  const createdAt = num(raw.createdAt) ?? num(raw.updatedAt) ?? now
  return {
    id,
    text,
    tags: parseTags(Array.isArray(raw.tags) ? raw.tags : []),
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    createdAt,
    updatedAt: num(raw.updatedAt) ?? createdAt,
  }
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
