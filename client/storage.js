// 前端存储适配层：优先用 localStorage（浏览器原生、刷新不丢）。
// 预留 host 通道挂点，未来可切到 DSH host 的 state.json 读写。

const KEY = 'we-media-desk:ideas'

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

// 未来接入 DSH host 通道时，把读写实现替换成这里。
export const hostBridge = {
  enabled: false,
  async load() { return null },
  async save() { return false },
}
