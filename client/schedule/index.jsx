// 排期页：月历上排脚本；右边是还没归到脚本的灵感和还没排期的脚本，拖到日历上就排上了。
// 点日历上的脚本进入脚本编辑页。
import React from 'react'
import { SCRIPT_STATUSES, missingScripts, monthGrid, scheduleStats, scriptsByDate, titleFromIdea, cleanTitle, uniqueTitle } from '../../src/scripts.js'
import { useIdeas } from '../ideas/useIdeas.js'
import { useScripts } from '../scripts/useScripts.js'
import { ScriptEditor } from '../scripts/ScriptEditor.jsx'
import { ideaText, thumbOf, KIND_ICON, setDrag, readDrag, isOurDrag } from '../scripts/shared.js'
import { Icon } from '../icons.jsx'

const { useState, useEffect, useMemo, useRef, useCallback } = React

const OPEN_KEY = 'we-media-desk:script-open'
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const STATUS_LABEL = Object.fromEntries(SCRIPT_STATUSES.map(s => [s.id, s.label]))
const MAX_CHIPS = 3

function Stat({ label, value, unit }) {
  return (
    <div className="wk-cal-stat">
      <div className="wk-cal-stat-label">{label}</div>
      <div className="wk-cal-stat-value">{value}<small>{unit}</small></div>
    </div>
  )
}

function ScriptChip({ script, cover, onOpen, compact }) {
  return (
    <button className={'wk-cal-chip is-' + script.status + (compact ? ' is-compact' : '')} draggable
      onDragStart={e => setDrag(e, { type: 'script', id: script.id })}
      onClick={e => { e.stopPropagation(); onOpen(script.id) }}
      title={`${script.title} · ${STATUS_LABEL[script.status]}${script.time ? ' · ' + script.time : ''}`}>
      {cover && <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />}
      <span className="wk-cal-chip-main">
        {(script.time || !compact) && <span className="wk-cal-chip-time">{script.time || STATUS_LABEL[script.status]}</span>}
        <span className="wk-cal-chip-title">{script.title}</span>
      </span>
    </button>
  )
}

// 日期格上的 ＋：新建一个脚本放到这天；也可以从灵感开始，或放一个还没排期的脚本
function AddPopover({ dayKey, ideas, unscheduled, align, onCreate, onFromIdea, onPlace, onClose }) {
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  useEffect(() => {
    const close = e => { if (!boxRef.current?.contains(e.target)) onClose() }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onClose])
  const term = q.trim().toLowerCase()
  const ideaList = ideas.filter(it => !term || ideaText(it).toLowerCase().includes(term)).slice(0, 5)
  const scriptList = unscheduled.filter(s => !term || s.title.toLowerCase().includes(term)).slice(0, 5)
  const [, m, d] = dayKey.split('-').map(Number)
  return (
    <div className={'wk-cal-add is-' + align} ref={boxRef} onClick={e => e.stopPropagation()}>
      <div className="wk-cal-add-title">{m} 月 {d} 日要做什么？</div>
      <form onSubmit={e => { e.preventDefault(); if (cleanTitle(q)) onCreate(q) }}>
        <input className="wk-picker-input" autoFocus value={q} maxLength={40} placeholder="写个标题，回车新建脚本"
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }} />
      </form>
      {scriptList.length > 0 && (
        <div className="wk-cal-add-sec">
          <div className="wk-pop-title">放一个还没排期的脚本</div>
          {scriptList.map(s => (
            <button key={s.id} className="wk-sc-attach-opt" onClick={() => onPlace(s)}>
              <Icon name="docs" size={12} /><span className="wk-sc-attach-text">{s.title}</span>
            </button>
          ))}
        </div>
      )}
      {ideaList.length > 0 && (
        <div className="wk-cal-add-sec">
          <div className="wk-pop-title">从一条灵感开始</div>
          {ideaList.map(it => (
            <button key={it.id} className="wk-sc-attach-opt" onClick={() => onFromIdea(it)}>
              <Icon name={KIND_ICON[it.kind || 'text']} size={12} /><span className="wk-sc-attach-text">{ideaText(it) || '（无文字）'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DayCell({ day, col, row, rows, scripts, coverOf, onOpen, adding, setAdding, onDrop, addProps }) {
  const [over, setOver] = useState(false)
  const shown = scripts.slice(0, MAX_CHIPS)
  const more = scripts.length - shown.length
  return (
    <div
      className={'wk-cal-day' + (day.inMonth ? '' : ' is-out') + (day.today ? ' is-today' : '') + (day.past ? ' is-past' : '') + (over ? ' is-over' : '') + (adding ? ' is-adding' : '')}
      onDragOver={e => { if (isOurDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }}
      onDrop={e => { e.preventDefault(); setOver(false); const item = readDrag(e); if (item) onDrop(item, day.key) }}
      onDoubleClick={() => setAdding(day.key)}
    >
      <div className="wk-cal-day-head">
        <span className="wk-cal-date">{day.date}</span>
        <button className="wk-cal-plus" title="在这天新建脚本" onClick={e => { e.stopPropagation(); setAdding(adding ? '' : day.key) }}>
          <Icon name="plus" size={13} stroke={2.2} />
        </button>
      </div>
      <div className="wk-cal-chips">
        {shown.map(s => <ScriptChip key={s.id} script={s} cover={coverOf(s.title)} onOpen={onOpen} compact />)}
        {more > 0 && <span className="wk-cal-more">还有 {more} 个</span>}
      </div>
      {adding && <AddPopover dayKey={day.key} align={(col >= 5 ? 'right' : 'left') + (row >= rows - 2 ? ' up' : '')} {...addProps} />}
    </div>
  )
}

export function SchedulePanel({ onGather }) {
  const ideasStore = useIdeas()
  const store = useScripts()
  const { ideas } = ideasStore
  const { scripts } = store
  const now = Date.now()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [adding, setAdding] = useState('')
  const [openId, setOpenId] = useState(() => { try { return sessionStorage.getItem(OPEN_KEY) || '' } catch { return '' } })
  const [sideOver, setSideOver] = useState(false)
  useEffect(() => { try { sessionStorage.setItem(OPEN_KEY, openId) } catch { /* ignore */ } }, [openId])

  // 灵感里用到、还没建的脚本，自动补上（两边都读完 host 之后）
  const ready = ideasStore.sync !== 'loading' && store.sync !== 'loading'
  useEffect(() => { if (ready) store.addMany(missingScripts(scripts, ideas)) }, [ready, ideas, scripts, store.addMany])

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m, now), [cursor.y, cursor.m, Math.floor(now / 864e5)]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = useMemo(() => scriptsByDate(scripts), [scripts])
  const stats = useMemo(() => scheduleStats(ideas, scripts, { year: cursor.y, month: cursor.m }), [ideas, scripts, cursor.y, cursor.m])
  const loose = useMemo(() => ideas.filter(it => !it.archived && !it.script).sort((a, b) => b.createdAt - a.createdAt), [ideas])
  const unscheduled = useMemo(() => scripts.filter(s => !s.date).sort((a, b) => b.updatedAt - a.updatedAt), [scripts])
  const covers = useMemo(() => {
    const m = {}
    for (const it of [...ideas].sort((a, b) => a.createdAt - b.createdAt)) if (it.script && !m[it.script] && !it.archived) { const t = thumbOf(it); if (t) m[it.script] = t }
    return m
  }, [ideas])
  const coverOf = useCallback(title => covers[title] || '', [covers])

  const open = useCallback(id => { setAdding(''); setOpenId(id) }, [])
  const closeAdd = useCallback(() => setAdding(''), [])

  // 新建脚本放到某天（可从一条灵感开始）
  const createOn = useCallback((date, title, idea) => {
    const s = store.create(idea ? titleFromIdea(idea, scripts) : (cleanTitle(title) && !scripts.some(x => x.title === cleanTitle(title)) ? title : uniqueTitle(scripts, cleanTitle(title) || '未命名脚本')))
    if (date) store.update(s.id, { date })
    if (idea) ideasStore.update(idea.id, { script: s.title })
    return s
  }, [scripts, store.create, store.update, ideasStore.update])

  const onDropDay = useCallback((item, date) => {
    if (item.type === 'script') store.update(item.id, { date })
    else if (item.type === 'idea') {
      const idea = ideas.find(it => it.id === item.id)
      if (idea) createOn(date, '', idea)
    }
  }, [ideas, store.update, createOn])

  const addProps = {
    ideas: loose,
    unscheduled,
    onClose: closeAdd,
    onCreate: title => { const s = createOn(adding, title); setAdding(''); setOpenId(s.id) },
    onFromIdea: idea => { createOn(adding, '', idea); setAdding('') },
    onPlace: s => { store.update(s.id, { date: adding }); setAdding('') },
  }

  const editing = openId && scripts.find(s => s.id === openId)
  useEffect(() => {
    if (!editing) return
    const onKey = e => { if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) setOpenId('') }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing])
  if (editing) {
    return <ScriptEditor script={editing} scripts={scripts} ideasStore={ideasStore} store={store} onBack={() => setOpenId('')} onGather={onGather} />
  }

  const shift = n => setCursor(c => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const today = new Date(now)
  const isThisMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth()

  return (
    <div className="wk-cal">
      <section className="wk-sc-panel wk-cal-main">
        <header className="wk-cal-head">
          <div className="wk-cal-when">
            <b>{cursor.m + 1}</b>
            <div><span>{cursor.y}</span><i>{MONTH_EN[cursor.m]}</i></div>
          </div>
          <div className="wk-cal-stats">
            <Stat label="连续记录" value={stats.streak} unit="天" />
            <Stat label="本月灵感" value={stats.monthIdeas} unit="条" />
            <Stat label="本月排期" value={stats.monthScheduled} unit="个" />
            <Stat label="本月完成" value={stats.monthDone} unit="个" />
          </div>
          <div className="wk-cal-nav">
            <button className="wk-icon-btn" onClick={() => shift(-1)} title="上个月"><Icon name="chevronLeft" size={16} /></button>
            <button className={'wk-week-btn' + (isThisMonth ? ' is-current' : '')} onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>今天</button>
            <button className="wk-icon-btn" onClick={() => shift(1)} title="下个月"><Icon name="chevronRight" size={16} /></button>
          </div>
        </header>
        <div className="wk-cal-weekdays">{WEEKDAYS.map(w => <span key={w}>{w}</span>)}</div>
        <div className="wk-cal-grid" style={{ gridTemplateRows: `repeat(${grid.length}, minmax(0, 1fr))` }}>
          {grid.map((week, r) => week.map((day, c) => (
            <DayCell key={day.key} day={day} col={c} row={r} rows={grid.length}
              scripts={byDate[day.key] || []} coverOf={coverOf} onOpen={open}
              adding={adding === day.key} setAdding={setAdding} onDrop={onDropDay} addProps={addProps} />
          )))}
        </div>
      </section>

      <aside
        className={'wk-sc-panel wk-cal-side' + (sideOver ? ' is-over' : '')}
        onDragOver={e => { if (isOurDrag(e)) { e.preventDefault(); setSideOver(true) } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSideOver(false) }}
        onDrop={e => { e.preventDefault(); setSideOver(false); const item = readDrag(e); if (item?.type === 'script') store.update(item.id, { date: undefined, time: undefined }) }}
      >
        <header className="wk-sc-head">
          <div className="wk-sc-title">待排期<span className="wk-cal-side-hint">拖到日历上</span></div>
        </header>
        <div className="wk-cal-side-scroll">
          <div className="wk-cal-side-sec">
            <div className="wk-cal-side-title">
              <span>脚本<b>{unscheduled.length}</b></span>
              <button className="wk-btn-text" onClick={() => { const s = createOn('', ''); setOpenId(s.id) }}><Icon name="plus" size={12} />新建</button>
            </div>
            {unscheduled.map(s => <ScriptChip key={s.id} script={s} cover={coverOf(s.title)} onOpen={open} />)}
            {!unscheduled.length && <div className="wk-cal-side-empty">没有待排期的脚本。把日历上的脚本拖回这里，就会取消排期。</div>}
          </div>
          <div className="wk-cal-side-sec">
            <div className="wk-cal-side-title"><span>灵感<b>{loose.length}</b></span><span className="wk-cal-side-sub">还没归到脚本</span></div>
            {loose.map(it => {
              const thumb = thumbOf(it)
              return (
                <div key={it.id} className="wk-cal-idea" draggable onDragStart={e => setDrag(e, { type: 'idea', id: it.id })}
                  title="拖到日历上，会用它新建一个脚本">
                  {thumb && <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />}
                  <div className="wk-cal-idea-main">
                    <div className="wk-cal-idea-text">{ideaText(it) || '（无文字）'}</div>
                    <div className="wk-sc-idea-meta">
                      <Icon name={KIND_ICON[it.kind || 'text']} size={11} />
                      {(it.tags || []).slice(0, 2).map(t => <span key={t}>#{t}</span>)}
                    </div>
                  </div>
                </div>
              )
            })}
            {!loose.length && <div className="wk-cal-side-empty">所有灵感都归到脚本里了。</div>}
          </div>
        </div>
      </aside>
    </div>
  )
}
