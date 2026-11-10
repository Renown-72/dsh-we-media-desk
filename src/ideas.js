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
