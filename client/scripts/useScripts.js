// 脚本数据：以 host 为准、localStorage 兜底；改动防抖写回 host。
import React from 'react'
import { createScript, uniqueTitle, cleanTitle } from '../../src/scripts.js'
import { loadScripts, saveScripts, scriptsBridge } from '../storage.js'

const { useState, useEffect, useRef, useCallback } = React
const SAVE_DELAY = 400

export function useScripts() {
  const [scripts, setScripts] = useState(() => loadScripts() || [])
  const [sync, setSync] = useState('loading')
  const hostReady = useRef(false)
  const lastSynced = useRef('')
  const pending = useRef(null)
  const alive = useRef(true)
  const scriptsRef = useRef(scripts)
  scriptsRef.current = scripts

  function flush() {
    const list = pending.current
    if (!list) return
    pending.current = null
    const snap = JSON.stringify(list)
    scriptsBridge.save(list).then(
      () => { lastSynced.current = snap; if (alive.current) setSync('host') },
      () => { if (alive.current) setSync('local') },
    )
  }

  useEffect(() => {
    alive.current = true
    scriptsBridge.load().then(remote => {
      if (!alive.current) return
      hostReady.current = true
      if (remote.length === 0) setScripts(prev => [...prev])
      else { lastSynced.current = JSON.stringify(remote); setScripts(remote) }
      setSync('host')
    }, () => { if (alive.current) setSync('local') })
    return () => { alive.current = false; flush() }
  }, [])

  useEffect(() => {
    saveScripts(scripts)
    if (!hostReady.current) return
    if (JSON.stringify(scripts) === lastSynced.current) return
    pending.current = scripts
    const t = setTimeout(flush, SAVE_DELAY)
    return () => clearTimeout(t)
  }, [scripts])

  const create = useCallback((title) => {
    const s = createScript({ title: cleanTitle(title) || uniqueTitle(scriptsRef.current) })
    setScripts(prev => (prev.some(x => x.title === s.title) ? prev : [s, ...prev]))
    return s
  }, [])

  const addMany = useCallback(list => {
    if (!list.length) return
    setScripts(prev => {
      const have = new Set(prev.map(s => s.title))
      const add = list.filter(s => !have.has(s.title))
      return add.length ? [...prev, ...add] : prev
    })
  }, [])

  const update = useCallback((id, patch) => {
    setScripts(prev => prev.map(s => {
      if (s.id !== id) return s
      const next = { ...s, ...patch, updatedAt: Date.now() }
      if (patch.status && patch.status !== s.status) {
        if (patch.status === 'done') next.doneAt = Date.now()
        else delete next.doneAt
      }
      return next
    }))
  }, [])

  const remove = useCallback(id => setScripts(prev => prev.filter(s => s.id !== id)), [])

  return { scripts, sync, create, addMany, update, remove }
}
