// 周表数据（纯函数）：某一周的每日灵感、活跃天数、高峰时段、完稿数、最快完稿、常用标签、各时段分布。

const DAY = 86400000
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 某个时刻所在那一周的周一 0 点；offset 为相对周数（-1 上周）
export function weekStart(now = Date.now(), offset = 0) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
  return d.getTime()
}

// 下一个日历日的 0 点（用 setDate，避开夏令时的 23/25 小时）
function addDays(ts, n) {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

// 一天分成六个时段；深夜跨过 0 点
export const PERIODS = [
  { id: 'morning', label: '早上', range: '5–9 点' },
  { id: 'forenoon', label: '上午', range: '9–12 点' },
  { id: 'noon', label: '中午', range: '12–14 点' },
  { id: 'afternoon', label: '下午', range: '14–18 点' },
  { id: 'evening', label: '晚上', range: '18–23 点' },
  { id: 'night', label: '深夜', range: '23–5 点' },
]
export function periodOf(h) {
  return h < 5 || h >= 23 ? 5 : h < 9 ? 0 : h < 12 ? 1 : h < 14 ? 2 : h < 18 ? 3 : 4
}

// 时长说法：“8 分钟”“2 小时 15 分”“3 天 4 小时”
export function formatDuration(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000)
  if (min < 1) return '1 分钟内'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} 小时 ${min % 60} 分` : `${h} 小时`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} 天 ${h % 24} 小时` : `${d} 天`
}

function pad(n) { return String(n).padStart(2, '0') }
function hm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

function topOf(map) {
  let best = null
  for (const [k, v] of map) if (!best || v > best[1]) best = [k, v]
  return best
}

export function weekStats(ideas, { now = Date.now(), offset = 0 } = {}) {
  const live = ideas.filter(it => !it.archived)
  const start = weekStart(now, offset)
  const end = addDays(start, 7)
  const prevStart = addDays(start, -7)
  const today = new Date(now).toDateString()

  const inWeek = live.filter(it => it.createdAt >= start && it.createdAt < end).sort((a, b) => a.createdAt - b.createdAt)

  const days = WEEKDAYS.map((label, i) => {
    const d0 = addDays(start, i)
    const d1 = addDays(start, i + 1)
    const d = new Date(d0)
    return {
      key: d0, label, month: d.getMonth() + 1, date: d.getDate(),
      today: d.toDateString() === today,
      future: d0 > now,
      items: inWeek.filter(it => it.createdAt >= d0 && it.createdAt < d1),
    }
  })

  const periods = PERIODS.map(p => ({ ...p, count: 0 }))
  const tags = new Map()
  for (const it of inWeek) {
    periods[periodOf(new Date(it.createdAt).getHours())].count++
    for (const t of it.tags || []) tags.set(t, (tags.get(t) || 0) + 1)
  }
  const periodMax = Math.max(0, ...periods.map(p => p.count))
  const peak = periodMax ? periods.findIndex(p => p.count === periodMax) : null
  const topTag = topOf(tags)

  // 本周完稿里，从记下到完稿用时最短的一条
  const doneInWeek = live.filter(it => it.done && it.doneAt >= start && it.doneAt < end)
  let fastest = null
  for (const it of doneInWeek) {
    const ms = Math.max(0, it.doneAt - it.createdAt)
    if (!fastest || ms < fastest.ms) fastest = { id: it.id, ms, label: formatDuration(ms), text: (it.text || it.preview?.title || it.url || '').replace(/\s+/g, ' ').trim() }
  }

  // 一天里最早 / 最晚记下的那条（按钟点，不按日期）
  const clock = it => { const d = new Date(it.createdAt); return d.getHours() * 60 + d.getMinutes() }
  const earliest = inWeek.length ? inWeek.reduce((a, b) => (clock(b) < clock(a) ? b : a)) : null
  const latest = inWeek.length ? inWeek.reduce((a, b) => (clock(b) > clock(a) ? b : a)) : null
  const dayName = it => WEEKDAYS[(new Date(it.createdAt).getDay() + 6) % 7]

  return {
    start, end,
    range: `${new Date(start).getMonth() + 1} 月 ${new Date(start).getDate()} 日 – ${new Date(end - 1).getMonth() + 1} 月 ${new Date(end - 1).getDate()} 日`,
    isCurrent: offset === 0,
    days,
    total: inWeek.length,
    prevTotal: live.filter(it => it.createdAt >= prevStart && it.createdAt < start).length,
    activeDays: days.filter(d => d.items.length).length,
    elapsedDays: Math.max(1, days.filter(d => !d.future).length),
    peak,
    peakLabel: peak == null ? '—' : PERIODS[peak].label,
    done: doneInWeek.length,
    doneOfWeek: inWeek.filter(it => it.done).length,
    fastest,
    topTag: topTag ? { tag: topTag[0], count: topTag[1] } : null,
    periods,
    periodMax,
    earliest: earliest && { day: dayName(earliest), time: hm(earliest.createdAt) },
    latest: latest && { day: dayName(latest), time: hm(latest.createdAt) },
  }
}
