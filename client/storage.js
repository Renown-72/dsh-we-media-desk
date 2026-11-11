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

// ---- 脚本 ----

const SCRIPTS_KEY = 'we-media-desk:scripts'
const SCRIPTS_API = '/we-media-desk/scripts'

export function loadScripts() {
  if (!hasLocalStorage()) return null
  try {
    const data = JSON.parse(localStorage.getItem(SCRIPTS_KEY) || 'null')
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export function saveScripts(scripts) {
  if (!hasLocalStorage()) return false
  try { localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts)); return true } catch { return false }
}

let scriptChain = Promise.resolve()
export const scriptsBridge = {
  async load() {
    const body = await request(SCRIPTS_API)
    if (!Array.isArray(body.scripts)) throw new Error('host 返回的数据格式不对')
    return body.scripts
  },
  save(scripts) {
    const run = scriptChain.then(() => request(SCRIPTS_API, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scripts }),
    }))
    scriptChain = run.catch(() => {})
    return run
  },
}

// ---- 附件与链接预览 ----

const API = '/we-media-desk'

export function fileUrl(name) {
  return `${API}/files/${encodeURIComponent(name)}`
}

// 上传图片 / 视频；用 XHR 以便拿到上传进度。返回 { name, mime, size }。
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/files`)
    xhr.withCredentials = true
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('accept', 'application/json')
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onerror = () => reject(new Error('上传失败：连不上 DSH 后台'))
    xhr.onload = () => {
      let body = null
      try { body = JSON.parse(xhr.responseText) } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok) resolve(body.file)
      else reject(new Error(body?.error || `上传失败（HTTP ${xhr.status}）`))
    }
    xhr.send(file)
  })
}

export async function deleteFile(name) {
  try {
    await request(fileUrl(name), { method: 'DELETE' })
  } catch { /* 删不掉只是留下孤立文件，不影响使用 */ }
}

export async function fetchLinkPreview(url) {
  const body = await request(`${API}/preview?url=${encodeURIComponent(url)}`)
  return body.preview
}

// 读取图片尺寸（画布排版用），失败返回 null。
export function imageSize(file) {
  return new Promise(resolve => {
    const src = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(src) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(src) }
    img.src = src
  })
}
