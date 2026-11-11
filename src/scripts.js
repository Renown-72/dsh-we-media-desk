// 脚本（script）的纯逻辑：不依赖 UI 和文件系统，方便单测。
// 一个脚本：
//   {
//     id, title,            // 标题（唯一）；灵感的 script 字段就是它
//     status,               // 'plan' 构思 | 'write' 撰写 | 'shoot' 拍摄 | 'edit' 剪辑 | 'done' 完成
//     body,                 // 正文
//     createdAt, updatedAt,
//     doneAt?,              // 改成「完成」的时间
//   }

export const SCRIPT_STATUSES = [
  { id: 'plan', label: '构思' },
  { id: 'write', label: '撰写' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
  { id: 'done', label: '完成' },
]
const STATUS_IDS = new Set(SCRIPT_STATUSES.map(s => s.id))
export const TITLE_MAX = 40
export const BODY_MAX = 50000
export const MAX_SCRIPTS = 1000

function cleanNum(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
}

export function cleanTitle(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : ''
}

export function newScriptId(now = Date.now()) {
  return 's_' + now.toString(36) + Math.random().toString(36).slice(2, 8)
}

function build(raw, { id, now }) {
  const s = {
    id,
    title: cleanTitle(raw.title),
    status: STATUS_IDS.has(raw.status) ? raw.status : 'plan',
    body: typeof raw.body === 'string' ? raw.body.slice(0, BODY_MAX) : '',
    createdAt: cleanNum(raw.createdAt) ?? cleanNum(raw.updatedAt) ?? now,
    updatedAt: 0,
  }
  s.updatedAt = cleanNum(raw.updatedAt) ?? s.createdAt
  if (s.status === 'done') s.doneAt = cleanNum(raw.doneAt) ?? s.updatedAt
  return s
}

export function createScript({ title, now = Date.now(), ...rest } = {}) {
  const s = build({ ...rest, title, createdAt: now, updatedAt: now }, { id: newScriptId(now), now })
  if (!s.title) throw new Error('脚本需要一个标题')
  return s
}

export function normalizeScript(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 64) : ''
  if (!id) return null
  const s = build(raw, { id, now })
  return s.title ? s : null
}

// 清洗列表：丢弃非法项，id 和标题都去重（保留先出现的）。
export function normalizeScripts(list, now = Date.now()) {
  if (!Array.isArray(list)) return []
  const out = []
  const ids = new Set()
  const titles = new Set()
  for (const raw of list) {
    const s = normalizeScript(raw, now)
    if (!s || ids.has(s.id) || titles.has(s.title)) continue
    ids.add(s.id)
    titles.add(s.title)
    out.push(s)
    if (out.length >= MAX_SCRIPTS) break
  }
  return out
}

// 灵感里用到、但脚本列表里还没有的脚本名，补成新脚本（构思状态）。
export function missingScripts(scripts, ideas, now = Date.now()) {
  const have = new Set(scripts.map(s => s.title))
  const out = []
  for (const it of ideas) {
    const t = cleanTitle(it.script)
    if (!t || have.has(t)) continue
    have.add(t)
    out.push(createScript({ title: t, now }))
  }
  return out
}

// 新建时取一个不重名的标题：「未命名脚本」「未命名脚本 2」…
export function uniqueTitle(scripts, base = '未命名脚本') {
  const have = new Set(scripts.map(s => s.title))
  if (!have.has(base)) return base
  for (let i = 2; ; i++) if (!have.has(`${base} ${i}`)) return `${base} ${i}`
}

// 正文统计：字数（不算空白）和按 4.5 字 / 秒估的口播时长
export function bodyStats(body = '') {
  const chars = body.replace(/\s/g, '').length
  const sec = Math.round(chars / 4.5)
  const duration = !chars ? '—' : sec < 60 ? `约 ${Math.max(1, sec)} 秒` : `约 ${Math.floor(sec / 60)} 分 ${sec % 60 ? (sec % 60) + ' 秒' : ''}`.trim()
  return { chars, sec, duration }
}

// 按状态、关键词筛选；最近改过的在前
export function filterScripts(list, { status = '', query = '' } = {}) {
  const q = query.trim().toLowerCase()
  return list
    .filter(s => (!status || s.status === status) && (!q || (s.title + '\n' + s.body).toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export const SCRIPT_TEMPLATE = '【开头 · 前 3 秒的钩子】\n\n\n【正文】\n1. \n2. \n3. \n\n【结尾 · 引导互动】\n'
