// 灵感数据与操作：以 host 为准、localStorage 兜底；附件上传与链接预览。
import React from 'react'
import { createIdea, ideaFromInput, isDirectMedia } from '../../src/ideas.js'
import {
  loadIdeas, saveIdeas, hostBridge, uploadFile, deleteFile, fetchLinkPreview, imageSize,
} from '../storage.js'

const { useState, useEffect, useRef, useCallback } = React

const SAVE_DELAY = 300
let uploadSeq = 0

// placeRef.current(idea, hint) 返回新灵感在画布上的位置（不在画布时返回 undefined）
export function useIdeas({ placeRef } = {}) {
  const [ideas, setIdeas] = useState(() => loadIdeas() || [])
  // 同步状态：loading 正在连 host；host 已与 host 同步；local 只存在本浏览器
  const [sync, setSync] = useState('loading')
  const [uploads, setUploads] = useState([]) // 正在上传的文件 { id, name, progress, error }
  const hostReady = useRef(false)   // 首次从 host 读完之前不往 host 写，避免旧缓存覆盖
  const lastSynced = useRef('')     // 上次成功写入 host 的内容，用来跳过重复保存
  const pending = useRef(null)      // 等待写入 host 的最新列表
  const alive = useRef(true)
  const ideasRef = useRef(ideas)
  ideasRef.current = ideas

  function flushToHost() {
    const list = pending.current
    if (!list) return
    pending.current = null
    const snapshot = JSON.stringify(list)
    hostBridge.save(list).then(
      () => { lastSynced.current = snapshot; if (alive.current) setSync('host') },
      () => { if (alive.current) setSync('local') },
    )
  }

  // 启动时以 host 为准；host 还没有数据时，把本地已有的灵感迁移上去。
  useEffect(() => {
    alive.current = true
    const mountedAt = Date.now()
    hostBridge.load().then(remote => {
      if (!alive.current) return
      hostReady.current = true
      if (remote.length === 0) {
        setIdeas(prev => [...prev]) // 触发一次保存，把本地数据迁移到 host
      } else {
        lastSynced.current = JSON.stringify(remote)
        // 保留加载期间新记下、host 上还没有的灵感
        setIdeas(prev => {
          const ids = new Set(remote.map(it => it.id))
          const fresh = prev.filter(it => !ids.has(it.id) && (it.createdAt ?? 0) >= mountedAt)
          return fresh.length ? [...fresh, ...remote] : remote
        })
      }
      setSync('host')
    }, () => {
      if (alive.current) setSync('local')
    })
    return () => { alive.current = false; flushToHost() } // 切走页面时立刻写完未保存的改动
  }, [])

  // 变更后持久化：本地立即写，host 防抖写
  useEffect(() => {
    saveIdeas(ideas)
    if (!hostReady.current) return
    if (JSON.stringify(ideas) === lastSynced.current) return
    pending.current = ideas
    const timer = setTimeout(flushToHost, SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [ideas])

  const update = useCallback((id, patch, { touch = true } = {}) => {
    setIdeas(prev => prev.map(it => it.id === id
      ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch), ...(touch ? { updatedAt: Date.now() } : {}) }
      : it))
  }, [])

  const add = useCallback((idea, hint) => {
    if (!idea.pos && placeRef?.current) {
      const pos = placeRef.current(idea, hint)
      if (pos) idea = { ...idea, pos }
    }
    setIdeas(prev => [idea, ...prev])
    // 链接 / 平台视频：后台抓标题和封面
    if (idea.url && (idea.kind === 'link' || idea.kind === 'video') && !isDirectMedia(idea.url)) {
      fetchLinkPreview(idea.url).then(
        preview => { if (preview) update(idea.id, { preview }, { touch: false }) },
        () => {},
      )
    }
    return idea
  }, [update])

  // 文字 / 网址 / 分享文案
  const addFromInput = useCallback((input, { tags, script, at, hint } = {}) => add(ideaFromInput({ input, tags, script, ...(at ? { now: at } : {}) }), hint), [add])

  // 图片 / 视频文件：先上传再生成灵感。hint 传给 placeRef（如拖放落点）。
  const addFiles = useCallback(async (fileList, { tags, text, script, at, hint } = {}) => {
    const files = [...fileList].filter(f => /^(image|video)\//.test(f.type))
    const results = await Promise.all(files.map(async (file, i) => {
      const uid = `up_${++uploadSeq}`
      setUploads(prev => [...prev, { id: uid, name: file.name || '粘贴的图片', progress: 0, error: '' }])
      try {
        const kind = file.type.startsWith('video/') ? 'video' : 'image'
        const [meta, size] = await Promise.all([
          uploadFile(file, p => setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: p } : u))),
          kind === 'image' ? imageSize(file) : null,
        ])
        setUploads(prev => prev.filter(u => u.id !== uid))
        return add(createIdea({ kind, file: { ...meta, ...(size || {}) }, text, tags, script, ...(at ? { now: at + i } : {}) }), hint)
      } catch (err) {
        setUploads(prev => prev.map(u => u.id === uid ? { ...u, error: err.message } : u))
        return null
      }
    }))
    return results.filter(Boolean)
  }, [add])

  const dismissUpload = useCallback(uid => setUploads(prev => prev.filter(u => u.id !== uid)), [])

  const remove = useCallback(id => {
    const it = ideasRef.current.find(x => x.id === id)
    if (it?.file?.name) deleteFile(it.file.name)
    setIdeas(prev => prev.filter(x => x.id !== id))
  }, [])

  const togglePin = useCallback(id => update(id, it => ({ pinned: !it.pinned })), [update])
  const toggleArchive = useCallback(id => update(id, it => ({ archived: !it.archived })), [update])
  const move = useCallback((id, pos) => update(id, { pos }, { touch: false }), [update])
  // 完稿：记下完稿时间；取消时一并清掉
  const toggleDone = useCallback(id => update(id, it => (it.done ? { done: undefined, doneAt: undefined } : { done: true, doneAt: Date.now() })), [update])

  // 清掉一些灵感在画布上的位置，让它们重新自动摆放
  const unplace = useCallback(ids => {
    const set = new Set(ids)
    setIdeas(prev => prev.map(it => (set.has(it.id) && it.pos ? (({ pos, ...rest }) => rest)(it) : it)))
  }, [])

  // 给还没摆过位置的灵感一次性写入位置（画布自动排版的结果）
  const placeMany = useCallback(positions => {
    setIdeas(prev => prev.map(it => positions[it.id] && !it.pos ? { ...it, pos: positions[it.id] } : it))
  }, [])

  return {
    ideas, sync, uploads,
    add, addFromInput, addFiles, dismissUpload, update, remove, togglePin, toggleArchive, toggleDone, move, placeMany, unplace,
  }
}
