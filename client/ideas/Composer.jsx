// 录入框：一句话、网址或分享文案；#标签 直接写在文字里；可粘贴或选择图片、视频。
import React from 'react'
import { extractUrl, classifyUrl, splitHashtags, KINDS } from '../../src/ideas.js'
import { Icon } from '../icons.jsx'

const { useState, useRef, useLayoutEffect, useImperativeHandle, forwardRef } = React

const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.id, k.label]))

export function mediaFilesOf(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter(f => /^(image|video)\//.test(f.type))
}

export const Composer = forwardRef(function Composer({ onText, onFiles }, ref) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const areaRef = useRef(null)
  const fileRef = useRef(null)

  useImperativeHandle(ref, () => ({ focus: () => areaRef.current?.focus({ preventScroll: true }) }), [])

  // 自动长高，最多 6 行
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 6 * 24 + 4) + 'px'
  }, [draft])

  const { text, tags } = splitHashtags(draft)
  const { url } = extractUrl(text)
  const detected = url ? classifyUrl(url) : text ? 'text' : ''

  function submit() {
    if (!text && !tags.length) return
    try {
      onText(text, tags)
      setDraft('')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  // 粘贴图片：已写的文字作为这张图的备注
  function onPaste(e) {
    const files = mediaFilesOf(e.clipboardData)
    if (!files.length) return
    e.preventDefault()
    e.stopPropagation()
    onFiles(files, { tags, text })
    setDraft('')
  }

  function onPick(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (files.length) { onFiles(files, { tags, text }); setDraft('') }
  }

  return (
    <div className="wk-composer">
      <div className={'wk-compose-pill' + (draft ? ' has-text' : '')}>
        <Icon name="sparkle" size={17} className="wk-compose-icon" />
        <textarea
          ref={areaRef}
          className="wk-compose-input"
          value={draft}
          rows={1}
          placeholder="记下一个灵感，或贴一个链接…"
          onChange={e => { setDraft(e.target.value); if (error) setError('') }}
          onPaste={onPaste}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
          }}
        />
        <button className="wk-icon-btn" title="添加图片或视频" onClick={() => fileRef.current?.click()}>
          <Icon name="attach" size={17} />
        </button>
        <button className="wk-send" title="记下（Enter）" disabled={!text && !tags.length} onClick={submit}>
          <Icon name="arrowUp" size={16} stroke={2.2} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPick} />
      </div>
      <div className="wk-compose-hint">
        {error ? <span className="wk-error">{error}</span> : draft ? (
          <>
            {detected && <span className="wk-hint-kind">存为{KIND_LABEL[detected]}</span>}
            {tags.map(t => <span key={t} className="wk-hint-tag">#{t}</span>)}
            <span className="wk-hint-keys">Enter 记下 · Shift+Enter 换行</span>
          </>
        ) : (
          <span>用 #标签 归类 · 图片、视频可以直接粘贴或拖进来</span>
        )}
      </div>
    </div>
  )
})
