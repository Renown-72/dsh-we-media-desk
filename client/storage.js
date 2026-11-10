// 前端存储适配层：
// - localStorage：本浏览器缓存，打开即有数据，host 不可用时兜底。
// - hostBridge：通过 /we-media-desk/ideas 读写 DSH host 上的 state.json（以它为准）。

const KEY = 'we-media-desk:ideas'
const IDEAS_API = '/we-media-desk/ideas'

function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
}

// 读取灵感数组；损坏或不存在时返回 null（由调用方决定初始值）。
export function loadIdeas() {
  if (!hasLocalStorage()) return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

// 保存灵感数组；失败不抛，返回是否成功。
export function saveIdeas(ideas) {
  if (!hasLocalStorage()) return false
  try {
    localStorage.setItem(KEY, JSON.stringify(ideas))
    return true
  } catch {
    return false
  }
}

async function request(url, init) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { accept: 'application/json', ...(init?.headers || {}) },
  })
  let body = null
  try { body = await res.json() } catch { /* 非 JSON 响应 */ }
  if (!res.ok || !body || body.ok === false) {
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  return body
}

// 保存请求串行发出，保证后发的不会被先发的覆盖。
let saveChain = Promise.resolve()

export const hostBridge = {
  async load() {
    const body = await request(IDEAS_API)
    if (!Array.isArray(body.ideas)) throw new Error('host 返回的数据格式不对')
    return body.ideas
  },
  save(ideas) {
    const run = saveChain.then(() => request(IDEAS_API, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ideas }),
    }))
    saveChain = run.catch(() => {})
    return run
  },
}
