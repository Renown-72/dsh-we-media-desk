// 录入区：文字 / 网址 / 分享文案，粘贴或选择图片、视频文件。
import React from 'react'
import { extractUrl, classifyUrl, KINDS } from '../../src/ideas.js'

const { useState, useRef } = React

const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.id, k.label]))

export function mediaFilesOf(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter(f => /^(image|video)\//.test(f.type))
}

export function Composer({ onText, onFiles, uploads, onDismissUpload }) {
  const [draft, setDraft] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const { url } = extractUrl(draft)
  const detected = url ? classifyUrl(url) : ''

  function submit() {
    const text = draft.trim()
    if (!text) return
    try {
      onText(text, tags)
      setDraft('')
      setTags('')
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
    onFiles(files, { tags, text: draft.trim() })
    setDraft('')
  }

  function onPick(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (files.length) onFiles(files, { tags, text: draft.trim() }).then(() => setDraft(''))
  }

  return (
    <div className="wk-composer">
      <div className="wk-compose">
        <textarea
          className="wk-input wk-textarea"
          value={draft}
          rows={draft.includes('\n') ? 3 : 1}
          placeholder="记一句灵感，或粘贴链接 / 分享文案 / 图片…（Enter 保存，Shift+Enter 换行）"
          onChange={e => setDraft(e.target.value)}
          onPaste={onPaste}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
          }}
        />
        <input
          className="wk-input wk-input-tags"
          value={tags}
          placeholder="#标签（可选）"
          onChange={e => setTags(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }}
        />
        <button className="wk-btn wk-btn-ghost" title="添加图片或视频文件" onClick={() => fileRef.current?.click()}>图片/视频</button>
        <button className="wk-btn" onClick={submit}>记下</button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPick} />
      </div>
      <div className="wk-compose-hint">
        {detected
          ? <span className="wk-detected">将保存为「{KIND_LABEL[detected]}」{draft.trim() !== url ? '，其余文字作为备注' : ''}</span>
          : '也可以直接把图片、视频文件拖进来，或在页面空白处 Ctrl+V 粘贴'}
        {error && <span className="wk-error">{error}</span>}
      </div>
      {uploads.length > 0 && (
        <div className="wk-uploads">
          {uploads.map(u => (
            <div key={u.id} className={'wk-upload' + (u.error ? ' is-error' : '')}>
              <span className="wk-upload-name">{u.name}</span>
              {u.error
                ? <><span>{u.error}</span><button className="wk-mini" onClick={() => onDismissUpload(u.id)}>✕</button></>
                : <span className="wk-upload-bar"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
