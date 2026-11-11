// 脚本（script）的纯逻辑：不依赖 UI 和文件系统，方便单测。
// 一个脚本：
//   {
//     id, title,            // 标题（唯一）；灵感的 script 字段就是它
//     status,               // 'plan' 构思 | 'write' 撰写 | 'shoot' 拍摄 | 'edit' 剪辑 | 'done' 完成
//     body,                 // 正文
//     createdAt, updatedAt,
//     doneAt?,              // 改成「完成」的时间
//     date?, time?,         // 排期：'2026-11-12'、'19:30'
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
  if (isDateKey(raw.date)) {
    s.date = raw.date
    if (typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) s.time = raw.time
  }
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

// ---- 排期 ----

const pad = n => String(n).padStart(2, '0')

export function isDateKey(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(y, m - 1, d)
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d
}

// 本地日期的 'YYYY-MM-DD'
export function dateKey(ts = Date.now()) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 某月的月历：周一开头，补齐前后几天，返回若干周，每周 7 天
export function monthGrid(year, month, now = Date.now()) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((lead + days) / 7)
  const today = dateKey(now)
  const out = []
  for (let w = 0; w < weeks; w++) {
    const row = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(year, month, 1 - lead + w * 7 + i)
      const key = dateKey(d.getTime())
      row.push({ key, date: d.getDate(), inMonth: d.getMonth() === month, today: key === today, past: key < today })
    }
    out.push(row)
  }
  return out
}

// 顶部的几个数：连续记录天数（到今天，今天还没记就从昨天算）、本月灵感、本月排期、本月完成
export function scheduleStats(ideas, scripts, { year, month, now = Date.now() } = {}) {
  const days = new Set(ideas.filter(it => !it.archived).map(it => dateKey(it.createdAt)))
  let streak = 0
  const d = new Date(now)
  if (!days.has(dateKey(d.getTime()))) d.setDate(d.getDate() - 1)
  while (days.has(dateKey(d.getTime()))) { streak++; d.setDate(d.getDate() - 1) }
  const prefix = `${year}-${pad(month + 1)}-`
  return {
    streak,
    monthIdeas: ideas.filter(it => !it.archived && dateKey(it.createdAt).startsWith(prefix)).length,
    monthScheduled: scripts.filter(s => s.date?.startsWith(prefix)).length,
    monthDone: scripts.filter(s => s.status === 'done' && s.doneAt && dateKey(s.doneAt).startsWith(prefix)).length,
  }
}

// 按日期分组排好的脚本：同一天按时间，没时间的排后面
export function scriptsByDate(scripts) {
  const map = {}
  for (const s of scripts) if (s.date) (map[s.date] ||= []).push(s)
  for (const k in map) map[k].sort((a, b) => (a.time || '99') .localeCompare(b.time || '99') || a.createdAt - b.createdAt)
  return map
}

// 从一条灵感起一个脚本标题：取第一行，太长截断，重名加序号
export function titleFromIdea(idea, scripts = []) {
  const raw = (idea.text || idea.preview?.title || '').split('\n').find(l => l.trim()) || ''
  let t = cleanTitle(raw.replace(/^[\s"“「【]+|[\s"”」】]+$/g, ''))
  if (t.length > 24) t = t.slice(0, 24) + '…'
  return uniqueTitle(scripts, t || '未命名脚本')
}
