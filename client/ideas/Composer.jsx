// 录入框：一句话、网址或分享文案；#标签 可直接写在文字里，也可在下面的「脚本」「标签」小框里选；可粘贴或选择图片、视频。
import React from 'react'
import { extractUrl, classifyUrl, splitHashtags, KINDS, toLocalInput, fromLocalInput } from '../../src/ideas.js'
import { Icon } from '../icons.jsx'

const { useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } = React

const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.id, k.label]))

export function mediaFilesOf(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter(f => /^(image|video)\//.test(f.type))
}

// 小下拉框：可搜索、可新建。multi 时 value 是数组
function Picker({ icon, label, prefix = '', placeholder, options, value, multi, onChange, emptyText }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  const selected = multi ? value : (value ? [value] : [])
  const term = q.trim().replace(/^[#＃]/, '')
  const list = options.filter(o => !term || o.toLowerCase().includes(term.toLowerCase()))
  const canCreate = term && !options.includes(term) && term.length <= 40

  useEffect(() => {
    if (!open) return
    const close = e => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function toggle(v) {
    if (multi) onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
    else { onChange(value === v ? '' : v); setOpen(false) }
    setQ('')
  }

  return (
    <div className="wk-picker" ref={boxRef}>
      <button type="button" className={'wk-picker-btn' + (selected.length ? ' is-set' : '') + (open ? ' is-open' : '')} onClick={() => setOpen(v => !v)}>
        <Icon name={icon} size={13} />
        <span className="wk-picker-label">{label}</span>
        <span className="wk-picker-value">{selected.length ? selected.map(v => prefix + v).join(' ') : placeholder}</span>
        {selected.length > 0 && (
          <span className="wk-picker-clear" role="button" aria-label={'清除' + label}
            onClick={e => { e.stopPropagation(); onChange(multi ? [] : '') }}><Icon name="close" size={11} /></span>
        )}
      </button>
      {open && (
        <div className="wk-picker-pop">
          <input className="wk-picker-input" autoFocus value={q} placeholder={'搜索或新建' + label}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (canCreate) toggle(term)
                else if (list[0]) toggle(list[0])
              }
            }} />
          <div className="wk-picker-list">
            {canCreate && <button type="button" className="wk-picker-opt is-new" onClick={() => toggle(term)}><Icon name="plus" size={12} />新建「{prefix}{term}」</button>}
            {list.map(o => (
              <button type="button" key={o} className={'wk-picker-opt' + (selected.includes(o) ? ' is-on' : '')} onClick={() => toggle(o)}>
                <span>{prefix}{o}</span>{selected.includes(o) && <Icon name="check" size={13} stroke={2.4} />}
              </button>
            ))}
            {!list.length && !canCreate && <div className="wk-pop-empty">{emptyText}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// 「时间」小框：默认「现在」；补记时选一个过去的时间
function whenLabel(ts) {
  if (!ts) return '现在'
  if (Math.abs(Date.now() - ts) < 60000) return '现在'
  const d = new Date(ts)
  const now = new Date()
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5)
  if (days === 0) return '今天 ' + hm
  if (days === 1) return '昨天 ' + hm
  if (days === 2) return '前天 ' + hm
  return `${d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '/'}${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function TimePicker({ value, base, onChange }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const now = Date.now()
  return (
    <div className="wk-picker" ref={boxRef}>
      <button type="button" className={'wk-picker-btn' + (value ? ' is-set' : '') + (open ? ' is-open' : '')} onClick={() => setOpen(v => !v)}
        title="灵感是什么时候想到的；来不及记的可以补记">
        <Icon name="calendar" size={13} />
        <span className="wk-picker-label">时间</span>
        <span className="wk-picker-value">{whenLabel(value)}</span>
        {value > 0 && (
          <span className="wk-picker-clear" role="button" aria-label="改回点开时的时间"
            onClick={e => { e.stopPropagation(); onChange(0) }}><Icon name="close" size={11} /></span>
        )}
      </button>
      {open && (
        <div className="wk-picker-pop wk-time-pop">
          <div className="wk-pop-title">何时迸发的灵感？</div>
          <input type="datetime-local" className="wk-picker-input" max={toLocalInput(now)}
            value={toLocalInput(value || base)}
            onChange={e => { const t = fromLocalInput(e.target.value); if (t) onChange(toLocalInput(t) === toLocalInput(base) ? 0 : t) }}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } if (e.key === 'Enter') setOpen(false) }} />
        </div>
      )}
    </div>
  )
}

export const Composer = forwardRef(function Composer({ onText, onFiles, scripts = [], tagOptions = [], script = '', onScript }, ref) {
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState([])
  const [at, setAt] = useState(0) // 0 = 点开录入框的时间
  const [openedAt] = useState(() => Date.now())
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

  const { text, tags: inlineTags } = splitHashtags(draft)
  const tags = [...new Set([...picked, ...inlineTags])]
  const { url } = extractUrl(text)
  const detected = url ? classifyUrl(url) : text ? 'text' : ''

  function submit() {
    if (!text && !inlineTags.length) return
    try {
      onText(text, tags, script, at || openedAt)
      setDraft('')
      setPicked([])
      setAt(0)
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
    onFiles(files, { tags, text, script, at: at || openedAt })
    setDraft('')
    setPicked([])
    setAt(0)
  }

  function onPick(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (files.length) { onFiles(files, { tags, text, script, at: at || openedAt }); setDraft(''); setPicked([]); setAt(0) }
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
          placeholder="记下一个灵感，或贴一个链接… 也可以写 #标签"
          onChange={e => { setDraft(e.target.value); if (error) setError('') }}
          onPaste={onPaste}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
          }}
        />
        <button className="wk-icon-btn" title="添加图片或视频" onClick={() => fileRef.current?.click()}>
          <Icon name="attach" size={17} />
        </button>
        <button className="wk-send" title="记下（Enter）" disabled={!text && !inlineTags.length} onClick={submit}>
          <Icon name="arrowUp" size={16} stroke={2.2} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPick} />
      </div>
      <div className="wk-compose-meta">
        <Picker icon="docs" label="脚本" placeholder="未选" value={script} onChange={v => onScript?.(v)}
          options={scripts} emptyText="还没有脚本，输入名字新建一个" />
        <Picker icon="hash" label="标签" prefix="#" placeholder="未选" value={picked} multi onChange={setPicked}
          options={[...new Set([...tagOptions, ...picked])]} emptyText="还没有标签，输入名字新建一个" />
        <TimePicker value={at} base={openedAt} onChange={setAt} />
        {(error || draft) && <div className="wk-compose-hint">
          {error ? <span className="wk-error">{error}</span> : draft ? (
            <>
              {detected && <span className="wk-hint-kind">存为{KIND_LABEL[detected]}</span>}
              {inlineTags.filter(t => !picked.includes(t)).map(t => <span key={t} className="wk-hint-tag">#{t}</span>)}
              <span className="wk-hint-keys">Enter 记下</span>
            </>
          ) : null}
        </div>}
      </div>
    </div>
  )
})
