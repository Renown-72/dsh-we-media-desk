// 周表数据（纯函数）：某一周的每日灵感、活跃天数、高峰时段、完稿数、最常记录的类型和标签、时段热力。

const DAY = 86400000
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const KIND_LABEL = { text: '文字', image: '图片', link: '链接', video: '视频' }

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

// “晚上 9 点”这样的时段说法
export function hourLabel(h) {
  if (h == null) return '—'
  const part = h < 5 ? '凌晨' : h < 9 ? '早上' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上'
  const n = h > 12 ? h - 12 : h
  return `${part} ${n} 点`
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

  // 时段热力：7 行（周一到周日）× 24 列（小时）
  const heat = days.map(() => new Array(24).fill(0))
  const hours = new Array(24).fill(0)
  const kinds = new Map()
  const tags = new Map()
  days.forEach((day, i) => {
    for (const it of day.items) {
      const h = new Date(it.createdAt).getHours()
      heat[i][h]++
      hours[h]++
      kinds.set(it.kind || 'text', (kinds.get(it.kind || 'text') || 0) + 1)
      for (const t of it.tags || []) tags.set(t, (tags.get(t) || 0) + 1)
    }
  })
  const peak = inWeek.length ? hours.indexOf(Math.max(...hours)) : null
  const topKind = topOf(kinds)
  const topTag = topOf(tags)

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
    peakLabel: hourLabel(peak),
    done: live.filter(it => it.done && it.doneAt >= start && it.doneAt < end).length,
    doneOfWeek: inWeek.filter(it => it.done).length,
    topKind: topKind ? { id: topKind[0], label: KIND_LABEL[topKind[0]] || topKind[0], count: topKind[1] } : null,
    topTag: topTag ? { tag: topTag[0], count: topTag[1] } : null,
    heat,
    heatMax: Math.max(0, ...heat.flat()),
    earliest: earliest && { day: dayName(earliest), time: hm(earliest.createdAt) },
    latest: latest && { day: dayName(latest), time: hm(latest.createdAt) },
  }
}
