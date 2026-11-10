// 首屏数据（纯函数）：今天、本周、总数、连续记录天数、最近两周每天的数量。

const DAY = 86400000

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function ideaStats(ideas, now = Date.now()) {
  const live = ideas.filter(it => !it.archived)
  const today0 = startOfDay(now)
  const weekday = (new Date(now).getDay() + 6) % 7 // 周一为 0
  const week0 = today0 - weekday * DAY

  const perDay = new Map()
  for (const it of ideas) {
    const k = dayKey(it.createdAt)
    perDay.set(k, (perDay.get(k) || 0) + 1)
  }

  // 连续记录：从今天往前数；今天还没记的话从昨天开始数，不算断
  let streak = 0
  let cursor = perDay.has(dayKey(today0)) ? today0 : today0 - DAY
  // 用中午时刻往前推，避开夏令时切换带来的 23/25 小时
  cursor += DAY / 2
  while (perDay.has(dayKey(cursor))) {
    streak++
    cursor -= DAY
  }

  const days = []
  for (let i = 13; i >= 0; i--) {
    const ts = today0 - i * DAY + DAY / 2
    const d = new Date(ts)
    days.push({ key: dayKey(ts), month: d.getMonth() + 1, date: d.getDate(), count: perDay.get(dayKey(ts)) || 0, today: i === 0 })
  }

  return {
    today: live.filter(it => it.createdAt >= today0).length,
    week: live.filter(it => it.createdAt >= week0).length,
    total: live.length,
    streak,
    days,
  }
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export function dateLine(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()} · ${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEKDAYS[d.getDay()]}`
}

// 按时段打招呼
export function greeting(now = Date.now()) {
  const h = new Date(now).getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}
