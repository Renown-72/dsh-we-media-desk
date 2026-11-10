// 灵感附件（图片 / 视频）的存取：存到数据目录下的 files/，按随机文件名管理。
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

// 只接受这些类型。不接受 SVG：它能带脚本，而文件和插件同源。
export const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/ogg': 'ogv',
}
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]))

export const LIMITS = {
  image: 30 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
}

const NAME_RE = /^f_[a-z0-9]{8,40}\.[a-z0-9]{2,5}$/

export function isFileName(name) {
  return typeof name === 'string' && NAME_RE.test(name) && name.split('.')[1] in EXT_MIME
}

export function mimeOf(name) {
  return EXT_MIME[name.split('.').pop()] || 'application/octet-stream'
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

export class FileStore {
  constructor(dir) {
    this.dir = join(dir, 'files')
  }

  pathOf(name) {
    if (!isFileName(name)) throw httpError(400, '文件名不合法')
    return join(this.dir, name)
  }

  // 把请求体流式写入磁盘，返回 { name, mime, size }。
  async save(req, mime) {
    mime = String(mime || '').split(';')[0].trim().toLowerCase()
    const ext = MIME_EXT[mime]
    if (!ext) throw httpError(415, '只支持常见图片（png/jpg/gif/webp/avif/bmp）和视频（mp4/webm/mov）')
    const limit = LIMITS[mime.split('/')[0]]
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > limit) throw httpError(413, `文件过大，上限 ${Math.round(limit / 1048576)} MB`)

    await mkdir(this.dir, { recursive: true })
    const name = `f_${Date.now().toString(36)}${randomBytes(6).toString('hex')}.${ext}`
    const file = join(this.dir, name)
    const tmp = file + '.part'
    let size = 0
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length
        if (size > limit) cb(httpError(413, `文件过大，上限 ${Math.round(limit / 1048576)} MB`))
        else cb(null, chunk)
      },
    })
    try {
      await pipeline(req, counter, createWriteStream(tmp))
      if (size === 0) throw httpError(400, '文件是空的')
      await rename(tmp, file)
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
    return { name, mime, size }
  }

  async remove(name) {
    await rm(this.pathOf(name), { force: true })
  }

  // 发送文件，支持 Range（视频拖动进度条需要）。
  async send(req, res, name) {
    const file = this.pathOf(name)
    let info
    try {
      info = await stat(file)
    } catch {
      throw httpError(404, 'not found')
    }
    const total = info.size
    const headers = {
      'content-type': mimeOf(name),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    }
    let start = 0
    let end = total - 1
    let status = 200
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1])
        if (range[2]) end = Math.min(Number(range[2]), total - 1)
      } else {
        start = Math.max(0, total - Number(range[2]))
      }
      if (start > end || start >= total) {
        res.writeHead(416, { 'content-range': `bytes */${total}` })
        res.end()
        return
      }
      status = 206
      headers['content-range'] = `bytes ${start}-${end}/${total}`
    }
    headers['content-length'] = String(end - start + 1)
    res.writeHead(status, headers)
    if (req.method === 'HEAD') { res.end(); return }
    await pipeline(createReadStream(file, { start, end }), res)
  }
}
