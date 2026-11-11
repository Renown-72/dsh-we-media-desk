// 脚本、排期两处共用的小工具。
import { isDirectMedia } from '../../src/ideas.js'
import { fileUrl } from '../storage.js'

export const KIND_ICON = { text: 'text', image: 'image', link: 'link', video: 'play' }

export function ago(ts, now = Date.now()) {
  const m = Math.floor((now - ts) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const t = new Date(ts)
  return `${t.getMonth() + 1} 月 ${t.getDate()} 日`
}

export function ideaText(it) {
  return (it.text || it.preview?.title || it.url || '').trim()
}

export function thumbOf(it) {
  if (!it) return ''
  if (it.kind === 'image') return it.file ? fileUrl(it.file.name) : it.url
  if ((it.kind === 'link' || it.kind === 'video') && it.preview?.image && !it.file && !isDirectMedia(it.url || '')) return it.preview.image
  return ''
}

// 插进正文的样子：文字原样；链接、视频带上网址；图片注明是图片
export function snippetFor(it) {
  const text = it.text || it.preview?.title || ''
  if (it.kind === 'image') return `［图片］${text || (it.file?.name ?? '')}`
  if ((it.kind === 'link' || it.kind === 'video') && it.url) return text ? `${text}（${it.url}）` : it.url
  return text
}

// 拖放：灵感或脚本
export const DND_TYPE = 'application/x-wk-item'
export function setDrag(e, item) {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify(item))
  e.dataTransfer.effectAllowed = 'move'
}
export function readDrag(e) {
  try { return JSON.parse(e.dataTransfer.getData(DND_TYPE) || 'null') } catch { return null }
}
export function isOurDrag(e) {
  return [...(e.dataTransfer?.types || [])].includes(DND_TYPE)
}
