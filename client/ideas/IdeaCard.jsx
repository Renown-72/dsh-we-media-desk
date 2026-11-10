// 一张灵感卡片：按类型（文字 / 图片 / 链接 / 视频）渲染；信息流和画布共用。
import React from 'react'
import { KINDS, parseTags, siteName, isDirectMedia } from '../../src/ideas.js'
import { fileUrl } from '../storage.js'
import { Icon } from '../icons.jsx'

const { useState, useRef } = React

const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.id, k.label]))
const KIND_ICON = { text: 'text', image: 'image', link: 'link', video: 'play' }

function pad(n) { return String(n).padStart(2, '0') }
function timeLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return hm
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function mediaSrc(idea) {
  return idea.file ? fileUrl(idea.file.name) : idea.url
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
  if (broken) return <div className="wk-card-media wk-media-broken">视频无法播放</div>
  return (
    <div className={'wk-card-media wk-video' + (full ? ' is-full' : '')}
      onMouseEnter={() => preview(true)} onMouseLeave={() => preview(false)}>
      <video ref={ref} src={src + '#t=0.1'} muted={!full} loop={!full} controls={full}
        playsInline preload="metadata" onClick={open} onError={() => setBroken(true)} />
      {!full && <span className="wk-play"><Icon name="play" size={14} fill stroke={0} /></span>}
    </div>
  )
}

function Cover({ src, video }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) return null
  return (
    <div className="wk-card-media wk-cover">
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} />
      {video && <span className="wk-play"><Icon name="play" size={14} fill stroke={0} /></span>}
    </div>
  )
}

function Media({ idea, onOpenImage }) {
  if (idea.kind === 'image') {
    const src = mediaSrc(idea)
    const ratio = idea.file?.w && idea.file?.h ? `${idea.file.w} / ${idea.file.h}` : undefined
    return (
      <div className="wk-card-media wk-image" style={ratio ? { aspectRatio: ratio } : undefined}>
        <img src={src} alt={idea.text || ''} loading="lazy" referrerPolicy="no-referrer" draggable={false}
          onClick={() => onOpenImage?.(src)} />
      </div>
    )
  }
  if (idea.kind === 'video' && (idea.file || isDirectMedia(idea.url))) return <VideoClip src={mediaSrc(idea)} />
  if (idea.kind === 'link' || idea.kind === 'video') return <Cover src={idea.preview?.image} video={idea.kind === 'video'} />
  return null
}

function LinkInfo({ idea }) {
  const p = idea.preview || {}
  return (
    <div className="wk-linkinfo">
      <a className="wk-link-title" href={idea.url} target="_blank" rel="noreferrer noopener" draggable={false}>
        {p.title || idea.url}
      </a>
      {p.description && <p className="wk-link-desc">{p.description}</p>}
      <a className="wk-link-site" href={idea.url} target="_blank" rel="noreferrer noopener" draggable={false}>
        <Icon name="globe" size={12} /> {p.site || siteName(idea.url)} <Icon name="external" size={11} />
      </a>
    </div>
  )
}

function Editor({ idea, onSave, onCancel }) {
  const [text, setText] = useState(idea.text)
  const [tags, setTags] = useState(idea.tags.map(t => '#' + t).join(' '))
  function save() {
    if (idea.kind === 'text' && !text.trim()) return onCancel()
    onSave({ text: text.trim().slice(0, 2000), tags: parseTags(tags) })
  }
  return (
    <div className="wk-editor">
      <textarea className="wk-field" value={text} autoFocus rows={3}
        placeholder={idea.kind === 'text' ? '' : '写点备注（可选）'}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
          if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
        }} />
      <input className="wk-field" value={tags} placeholder="#标签" onChange={e => setTags(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }} />
      <div className="wk-editor-actions">
        <button className="wk-btn-text" onClick={onCancel}>取消</button>
        <button className="wk-btn-primary" onClick={save}>保存</button>
      </div>
    </div>
  )
}

function ActionBtn({ icon, label, onClick, danger, active }) {
  return (
    <button className={'wk-act' + (danger ? ' is-danger' : '') + (active ? ' is-on' : '')} title={label} aria-label={label}
      onClick={e => { e.stopPropagation(); onClick() }}>
      <Icon name={icon} size={15} />
    </button>
  )
}

export const IdeaCard = React.memo(function IdeaCard({ idea, variant = 'feed', handleProps, onPin, onArchive, onDelete, onEdit, onOpenImage, onTag, onRelated }) {
  const [editing, setEditing] = useState(false)
  const kind = idea.kind || 'text'
  const isLinkish = (kind === 'link' || kind === 'video') && idea.url && !idea.file && !isDirectMedia(idea.url)

  function del() {
    if (idea.file && !window.confirm('删除这条灵感会同时删除上传的文件，确定吗？')) return
    onDelete(idea.id)
  }

  return (
    <article
      className={`wk-card wk-card-${variant} is-${kind}` + (idea.pinned ? ' is-pinned' : '') + (idea.archived ? ' is-archived' : '')}
      {...handleProps}
    >
      <Media idea={idea} onOpenImage={onOpenImage} />

      <div className="wk-card-body">
        {isLinkish && <LinkInfo idea={idea} />}
        {editing ? (
          <Editor idea={idea} onCancel={() => setEditing(false)}
            onSave={patch => { onEdit(idea.id, patch); setEditing(false) }} />
        ) : idea.text ? (
          <p className={kind === 'text' ? 'wk-card-text is-main' : 'wk-card-text'} onDoubleClick={() => setEditing(true)}>{idea.text}</p>
        ) : null}
        {!editing && idea.tags.length > 0 && (
          <div className="wk-card-tags">
            {idea.tags.map(t => <button key={t} className="wk-tag" onClick={e => { e.stopPropagation(); onTag?.(t) }}>#{t}</button>)}
          </div>
        )}
      </div>

      <footer className="wk-card-foot">
        <span className="wk-card-kind"><Icon name={KIND_ICON[kind]} size={12} />{KIND_LABEL[kind]}</span>
        {idea.pinned && <span className="wk-card-pinned"><Icon name="pin" size={12} />置顶</span>}
        {idea.archived && <span className="wk-card-pinned">已归档</span>}
        <span className="wk-card-time">{timeLabel(idea.createdAt)}</span>
      </footer>

      {!editing && (
        <div className="wk-card-actions">
          {onRelated && <ActionBtn icon="orbit" label="找相关灵感" onClick={() => onRelated(idea.id)} />}
          <ActionBtn icon="pin" label={idea.pinned ? '取消置顶' : '置顶'} active={idea.pinned} onClick={() => onPin(idea.id)} />
          <ActionBtn icon="edit" label="编辑" onClick={() => setEditing(true)} />
          <ActionBtn icon="archive" label={idea.archived ? '取消归档' : '归档'} active={idea.archived} onClick={() => onArchive(idea.id)} />
          <ActionBtn icon="trash" label="删除" danger onClick={del} />
        </div>
      )}
    </article>
  )
})
