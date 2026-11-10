// 本地预览：生成示例数据和图片，启动真实的 host 接口，打包前端（含 React），
// 用无头 Edge/Chrome 截图。
//   node scripts/preview.mjs                 截三张图到 .preview/shots/
//   node scripts/preview.mjs --serve 5180    只启动服务，浏览器打开 http://127.0.0.1:5180/
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHandler } from '../src/host.js'
import { Store, emptyState } from '../src/store.js'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, '.preview')
const DATA = join(OUT, 'data')
const args = process.argv.slice(2)
const serveOnly = args.includes('--serve')
const port = Number(args[args.indexOf('--serve') + 1]) || 5180

// ---- 生成渐变示例图（最小 PNG 编码器） ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x / w, y / h)
      const i = y * (w * 3 + 1) + 1 + x * 3
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
// 两色渐变 + 几个柔和光斑，像海报底图
function artwork(c1, c2, c3, blobs) {
  return (u, v) => {
    let col = mix(c1, c2, Math.min(1, Math.max(0, (u * 0.4 + v * 0.8))))
    for (const [bx, by, br] of blobs) {
      const d = Math.hypot(u - bx, (v - by) * 1.1)
      if (d < br) col = mix(col, c3, (1 - d / br) ** 2 * 0.85)
    }
    return col
  }
}

const now = Date.now()
const H = 3600e3
const D = 24 * H
const IMAGES = [
  ['f_sample0001.png', 720, 900, artwork([255, 196, 140], [214, 92, 120], [255, 240, 200], [[0.3, 0.35, 0.4], [0.75, 0.75, 0.3]])],
  ['f_sample0002.png', 960, 640, artwork([24, 40, 82], [76, 110, 200], [160, 220, 255], [[0.7, 0.3, 0.35], [0.2, 0.8, 0.25]])],
  ['f_sample0003.png', 800, 800, artwork([196, 230, 210], [70, 150, 140], [255, 255, 235], [[0.5, 0.45, 0.45]])],
  ['f_sample0004.png', 640, 960, artwork([240, 220, 255], [130, 110, 220], [255, 200, 230], [[0.4, 0.3, 0.3], [0.6, 0.7, 0.35]])],
  ['f_sample0005.png', 960, 540, artwork([30, 30, 36], [90, 60, 110], [255, 170, 90], [[0.65, 0.55, 0.3]])],
  ['f_sample0006.png', 960, 540, artwork([250, 245, 235], [235, 200, 160], [120, 160, 220], [[0.3, 0.6, 0.28], [0.8, 0.3, 0.2]])],
]

function sampleIdeas(base) {
  const img = (n, w, h, extra) => ({ kind: 'image', file: { name: n, mime: 'image/png', size: 1, w, h }, ...extra })
  const list = [
    { kind: 'text', text: '“最好的选题，往往藏在你反复抱怨的那件小事里。”', tags: ['金句'], createdAt: now - 0.5 * H },
    img('f_sample0001.png', 720, 900, { text: '傍晚的颜色可以做封面底图', tags: ['封面', '配色'], createdAt: now - 1.2 * H }),
    { kind: 'video', url: 'https://www.bilibili.com/video/BV1example', text: '开头 3 秒的节奏可以学', tags: ['剪辑'], createdAt: now - 2 * H,
      preview: { title: '一镜到底拍城市夜景，手机也能做到', description: '用最普通的设备，拍出电影感的夜景运镜', image: `${base}/we-media-desk/files/f_sample0005.png`, site: '哔哩哔哩' } },
    { kind: 'text', text: '选题：普通人如何用 AI agent 管理每天的待办，做一期实测对比', tags: ['AI', '选题'], createdAt: now - 3 * H, done: true, doneAt: now - 1 * H },
    { kind: 'link', url: 'https://sspai.com/post/example', text: '', tags: ['效率'], createdAt: now - 26 * H,
      preview: { title: '我的数字笔记系统：从收集到输出的完整流程', description: '把零散的灵感变成可以发布的内容，需要的不只是一个好用的工具。', image: `${base}/we-media-desk/files/f_sample0006.png`, site: '少数派' } },
    img('f_sample0002.png', 960, 640, { text: '', tags: ['配色'], createdAt: now - 28 * H }),
    { kind: 'text', text: '周末去探店：这家咖啡馆的光线很适合拍 vlog，下午三点最好', tags: ['探店', 'vlog'], createdAt: now - 30 * H, done: true, doneAt: now - 20 * H },
    img('f_sample0003.png', 800, 800, { text: '极简构图参考', tags: [], createdAt: now - 2 * D }),
    { kind: 'link', url: 'https://github.com/example/agent', text: '可以拿来做 AI agent 教程的素材', tags: ['AI'], createdAt: now - 2.2 * D,
      preview: { title: 'example/agent: A tiny agent framework', description: 'Build small, reliable agents with tools and memory.', image: '', site: 'GitHub' } },
    { kind: 'text', text: '系列想法：「30 天每天记一个灵感」挑战，最后一期回顾哪些真的做成了内容', tags: ['选题'], createdAt: now - 3 * D, pinned: true },
    img('f_sample0004.png', 640, 960, { text: '竖版海报的留白', tags: ['封面'], createdAt: now - 4 * D }),
    { kind: 'text', text: '标题公式：数字 + 反常识 + 具体场景', tags: ['标题'], createdAt: now - 5 * D },
    { kind: 'link', url: 'https://www.zhihu.com/question/example', text: '', tags: [], createdAt: now - 6 * D,
      preview: { title: '自媒体新人最容易踩的坑有哪些？', description: '', image: '', site: '知乎' } },
    { kind: 'text', text: '咖啡测评：便利店冷萃横评，按价格和口感打分', tags: ['探店'], createdAt: now - 8 * D },
  ]
  return list.map((it, i) => ({ id: `idea_sample_${i}`, pinned: false, archived: false, updatedAt: it.createdAt, ...it }))
}

async function seed(base) {
  await rm(DATA, { recursive: true, force: true })
  await mkdir(join(DATA, 'files'), { recursive: true })
  for (const [name, w, h, fn] of IMAGES) await writeFile(join(DATA, 'files', name), png(w, h, fn))
  await writeFile(join(DATA, 'state.json'), JSON.stringify({ ...emptyState(), ideas: sampleIdeas(base) }, null, 2))
}

async function bundle() {
  await build({
    entryPoints: [join(ROOT, 'scripts/preview/entry.jsx')],
    outfile: join(OUT, 'app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
}

const HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>自媒体工作台 · 预览</title>
<style>html,body,#root{margin:0;height:100%}body[data-ds-dark-theme]{background:#0d0e12}</style></head>
<body><div id="root"></div><script src="/app.js"></script></body></html>`

function startServer(listenPort) {
  const api = createHandler({ ctx: {}, store: new Store(DATA) })
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    if (path.startsWith('/we-media-desk')) return api(req, res)
    if (path === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      return res.end(await readFile(join(OUT, 'app.js')))
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(HTML)
  })
  return new Promise(r => server.listen(listenPort, '127.0.0.1', () => r(server)))
}

function browserPath() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ]
  return candidates.find(p => existsSync(p))
}

function shoot(url, file, { width = 1360, height = 860 } = {}) {
  const exe = browserPath()
  if (!exe) throw new Error('找不到 Edge 或 Chrome')
  const profile = join(tmpdir(), 'wk-preview-' + Math.random().toString(36).slice(2))
  return new Promise((resolveShot, reject) => {
    const p = spawn(exe, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--force-device-scale-factor=1',
      '--virtual-time-budget=6000', `--screenshot=${file}`, url,
    ], { stdio: 'ignore' })
    p.on('error', reject)
    p.on('exit', () => { rm(profile, { recursive: true, force: true }).catch(() => {}); resolveShot() })
  })
}

await mkdir(OUT, { recursive: true })
const server = await startServer(serveOnly ? port : 0)
const base = `http://127.0.0.1:${server.address().port}`
await seed(base)
await bundle()

if (serveOnly) {
  console.log(`预览已启动：${base}/   （Ctrl+C 结束）`)
} else {
  const shots = join(OUT, 'shots')
  await mkdir(shots, { recursive: true })
  const jobs = [
    ['canvas-light.png', '?fresh=1&mode=canvas'],
    ['canvas-dark.png', '?fresh=1&mode=canvas&dark=1'],
    ['feed-light.png', '?fresh=1&mode=feed'],
    ...(args.includes('--all') ? [['feed-dark.png', '?fresh=1&mode=feed&dark=1'], ['capture.png', '?fresh=1&mode=canvas&capture=1']] : []),
  ]
  for (const [name, q] of jobs) {
    await seed(base) // 每张图都从同一份示例数据开始
    await shoot(base + '/' + q, join(shots, name))
    console.log('截图', join(shots, name))
  }
  server.close()
}
