// 一张灵感卡片：按类型（文字 / 图片 / 链接 / 视频）渲染；信息流和画布共用。
import React from 'react'
import { KINDS, parseTags, siteName, isDirectMedia } from '../../src/ideas.js'
import { fileUrl } from '../storage.js'

const { useState, useRef } = React

const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.id, k.label]))
const KIND_ICON = { text: '✎', image: '▣', link: '🔗', video: '▶' }

function pad(n) { return String(n).padStart(2, '0') }
function timeLabel(ts, withDate) {
  const d = new Date(ts)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withDate ? `${d.getMonth() + 1}月${d.getDate()}日 ${hm}` : hm
}

function mediaSrc(idea) {
  return idea.file ? fileUrl(idea.file.name) : idea.url
}

function LinkPreview({ idea }) {
  const p = idea.preview || {}
  const isVideo = idea.kind === 'video'
  return (
    <a className={"wk-linkcard" + (isVideo ? " is-video" : "")} href={idea.url} target="_blank" rel="noreferrer noopener" draggable={false}>
      {p.image && (
        <div className="wk-linkcard-cover">
          <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false}
            onError={e => { e.currentTarget.parentNode.style.display = 'none' }} />
          {isVideo && <span className="wk-play">▶</span>}
        </div>
      )}
      <div className="wk-linkcard-body">
        <div className="wk-linkcard-title">{p.title || idea.url}</div>
        {p.description && <div className="wk-linkcard-desc">{p.description}</div>}
        <div className="wk-linkcard-site">{isVideo && !p.image ? '▶ ' : ''}{p.site || siteName(idea.url)}</div>
      </div>
    </a>
  )
}

// 视频：鼠标停留时静音循环预览，点一下切换成带声音、带控制条的播放器
function VideoClip({ src }) {
  const ref = useRef(null)
  const [full, setFull] = useState(false)
  const [broken, setBroken] = useState(false)
  function preview(on) {
    const v = ref.current
    if (!v || full) return
    if (on) v.play().catch(() => {})
    else { v.pause(); v.currentTime = 0.1 }
  }
  function open() {
    const v = ref.current
    if (!v || full) return
    setFull(true)
    v.muted = false
    v.currentTime = 0
    v.play().catch(() => {})
  }
  if (broken) return <div className="wk-media wk-media-broken">视频无法播放</div>
  return (
    <div className={'wk-media wk-video' + (full ? ' is-full' : '')}
      onMouseEnter={() => preview(true)} onMouseLeave={() => preview(false)}>
      <video
        ref={ref}
        src={src + '#t=0.1'}
        muted={!full}
        loop={!full}
        controls={full}
        playsInline
        preload="metadata"
        onClick={open}
        onError={() => setBroken(true)}
      />
      {!full && <span className="wk-play" aria-hidden="true">▶</span>}
    </div>
  )
}

function Body({ idea, onOpenImage }) {
  switch (idea.kind) {
    case 'image': {
      const src = mediaSrc(idea)
      const ratio = idea.file?.w && idea.file?.h ? `${idea.file.w} / ${idea.file.h}` : undefined
      return (
        <div className="wk-media" style={ratio ? { aspectRatio: ratio } : undefined}>
          <img src={src} alt={idea.text || ''} loading="lazy" referrerPolicy="no-referrer" draggable={false}
            onClick={() => onOpenImage?.(src)} />
        </div>
      )
    }
    case 'video':
      if (idea.file || isDirectMedia(idea.url)) {
        return <VideoClip src={mediaSrc(idea)} />
      }
      return <LinkPreview idea={idea} />
    case 'link':
      return <LinkPreview idea={idea} />
    default:
      return null
  }
}

function Editor({ idea, onSave, onCancel }) {
  const [text, setText] = useState(idea.text)
  const [tags, setTags] = useState(idea.tags.map(t => '#' + t).join(' '))
  function save() {
    if (idea.kind === 'text' && !text.trim()) return onCancel()
    onSave({ text: text.trim().slice(0, 2000), tags: parseTags(tags) })
  }
  return (
    <div className="wk-editor" onPointerDown={e => e.stopPropagation()}>
      <textarea
        className="wk-input wk-textarea"
        value={text}
        autoFocus
        rows={3}
        placeholder={idea.kind === 'text' ? '' : '备注（可选）'}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <input className="wk-input wk-input-sm" value={tags} placeholder="#标签" onChange={e => setTags(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }} />
      <div className="wk-editor-actions">
        <button className="wk-mini" onClick={onCancel}>取消</button>
        <button className="wk-mini wk-mini-primary" onClick={save}>保存（Ctrl+Enter）</button>
      </div>
    </div>
  )
}

export const IdeaCard = React.memo(function IdeaCard({ idea, variant = 'feed', handleProps, onPin, onArchive, onDelete, onEdit, onOpenImage, onTag, onRelated }) {
  const [editing, setEditing] = useState(false)
  const kind = idea.kind || 'text'

  function del() {
    if (idea.file && !window.confirm('删除这条灵感会同时删除上传的文件，确定吗？')) return
    onDelete(idea.id)
  }

  return (
    <div className={`wk-card wk-card-${variant} is-${kind}` + (idea.pinned ? ' is-pinned' : '') + (idea.archived ? ' is-archived' : '')}>
      <div className="wk-card-head" {...handleProps}>
        <span className="wk-kind" title={KIND_LABEL[kind]}>{KIND_ICON[kind]} {KIND_LABEL[kind]}</span>
        {idea.pinned && <span className="wk-pin" title="已置顶">📌</span>}
        <span className="wk-time">{timeLabel(idea.createdAt, variant === 'canvas')}</span>
        <div className="wk-card-actions" onPointerDown={e => e.stopPropagation()}>
          {onRelated && <button className="wk-mini" title="把相关的灵感找出来" onClick={() => onRelated(idea.id)}>相关</button>}
          <button className="wk-mini" onClick={() => setEditing(v => !v)}>编辑</button>
          <button className="wk-mini" onClick={() => onPin(idea.id)}>{idea.pinned ? '取消置顶' : '置顶'}</button>
          <button className="wk-mini" onClick={() => onArchive(idea.id)}>{idea.archived ? '取消归档' : '归档'}</button>
          <button className="wk-mini wk-mini-danger" onClick={del}>删除</button>
        </div>
      </div>

      <Body idea={idea} onOpenImage={onOpenImage} />

      {editing ? (
        <Editor
          idea={idea}
          onCancel={() => setEditing(false)}
          onSave={patch => { onEdit(idea.id, patch); setEditing(false) }}
        />
      ) : (
        idea.text && (
          <div className={'wk-card-text' + (kind === 'text' ? ' is-main' : '')} onDoubleClick={() => setEditing(true)}>{idea.text}</div>
        )
      )}

      {!editing && idea.tags.length > 0 && (
        <div className="wk-card-tags">
          {idea.tags.map(t => <button key={t} className="wk-tag" onClick={() => onTag?.(t)}>#{t}</button>)}
        </div>
      )}
    </div>
  )
})
