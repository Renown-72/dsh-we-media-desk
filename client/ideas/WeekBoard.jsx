// 周表 / 月表：灵感概览——一排六个方块数据格、每日灵感（周：每天一摞邮票；月：月历里的小邮票）、一句小结。
// 高度随内容变化，onHeight 把实际高度报给画布，好让周围的卡片让开。
import React, { useLayoutEffect, useRef } from 'react'
import { isDirectMedia } from '../../src/ideas.js'
import { fileUrl } from '../storage.js'
import { Icon } from '../icons.jsx'
import { hash } from './layout.js'

const MAX_STACK = 8   // 一天最多叠几张邮票
const STAMP_H = 104
const STACK_STEP = 28 // 下一张压上来时，上一张露出的高度
const MAX_PER_CELL = 4
const SHORT_DAY = ['一', '二', '三', '四', '五', '六', '日']
const KIND_ICON = { text: 'text', image: 'image', link: 'link', video: 'play' }

function Tile({ label, value, sub, accent, onClick, title }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'wk-tile' + (accent ? ' is-accent' : '') + (onClick ? ' is-link' : '')} onClick={onClick} title={title}>
      <div className="wk-tile-label">{label}</div>
      <div className="wk-tile-value">{value}</div>
      <div className="wk-tile-sub">{sub}</div>
    </Tag>
  )
}

function thumbOf(it) {
  if (it.kind === 'image') return it.file ? fileUrl(it.file.name) : it.url
  if ((it.kind === 'link' || it.kind === 'video') && it.preview?.image && !it.file && !isDirectMedia(it.url || '')) return it.preview.image
  return ''
}

function snippet(it) {
  return (it.text || it.preview?.title || it.url || '').replace(/\s+/g, ' ').trim()
}

function hmOf(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 邮票的歪斜和左右错位，按 id 固定
function jitter(id, i) {
  const h = hash(id + ':' + i)
  return { rot: ((h % 600) / 100 - 3).toFixed(2) + 'deg', dx: ((h >> 9) % 7) - 3 + 'px' }
}

function Stamp({ idea, onOpen, style }) {
  const thumb = thumbOf(idea)
  const text = snippet(idea)
  const hm = hmOf(idea.createdAt)
  return (
    <button className={'wk-stamp-wrap' + (idea.done ? ' is-done' : '')} style={style}
      title={`${hm} · ${text || '（无文字）'}${idea.done ? ' · 已完稿' : ''}`} onClick={() => onOpen(idea.id)}>
      <span className={'wk-stamp is-' + (idea.kind || 'text') + (thumb ? ' has-thumb' : '')}>
        <span className="wk-stamp-face">
          {thumb
            ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />
            : <span className="wk-stamp-text">{text || '（无文字）'}</span>}
        </span>
        <span className="wk-stamp-meta"><Icon name={KIND_ICON[idea.kind || 'text']} size={9} />{hm}</span>
      </span>
      {idea.done && <span className="wk-postmark" aria-label="已完稿">完稿</span>}
    </button>
  )
}

function WeekDays({ days, onOpen }) {
  return (
    <div className="wk-week">
      {days.map(d => {
        const shown = d.items.slice(-MAX_STACK)
        const hidden = d.items.length - shown.length
        return (
          <div key={d.key} className={'wk-weekday' + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : '')}>
            <div className="wk-weekday-head">
              <span>{d.label}</span><b>{d.date}</b>
            </div>
            {hidden > 0 && <span className="wk-weekday-more">更早还有 {hidden} 条</span>}
            {shown.length
              ? (
                <div className="wk-stack" style={{ height: STAMP_H + (shown.length - 1) * STACK_STEP }}>
                  {shown.map((it, i) => {
                    const j = jitter(it.id, i)
                    return <Stamp key={it.id} idea={it} onOpen={onOpen} style={{ top: i * STACK_STEP, zIndex: i + 1, '--rot': j.rot, '--dx': j.dx }} />
                  })}
                </div>
              )
              : <span className="wk-stamp-slot">{d.future ? '' : '—'}</span>}
          </div>
        )
      })}
    </div>
  )
}

// 月历格子里的小邮票：有图显示缩略图，否则显示类型图标；多了就叠起来
function MiniStamp({ idea, onOpen, i }) {
  const thumb = thumbOf(idea)
  const j = jitter(idea.id, i)
  return (
    <button className={'wk-ministamp-wrap' + (idea.done ? ' is-done' : '')} style={{ '--rot': j.rot, zIndex: i + 1 }}
      title={`${hmOf(idea.createdAt)} · ${snippet(idea) || '（无文字）'}${idea.done ? ' · 已完稿' : ''}`}
      onClick={() => onOpen(idea.id)}>
      <span className={'wk-ministamp is-' + (idea.kind || 'text')}>
        {thumb
          ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />
          : <Icon name={KIND_ICON[idea.kind || 'text']} size={10} />}
      </span>
    </button>
  )
}

function MonthDays({ days, lead, onOpen }) {
  return (
    <div className="wk-month">
      {SHORT_DAY.map(d => <div key={d} className="wk-month-wd">{d}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={'pad' + i} className="wk-month-pad" />)}
      {days.map(d => {
        const shown = d.items.slice(-MAX_PER_CELL)
        const more = d.items.length - shown.length
        return (
          <div key={d.key} className={'wk-month-day' + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : '') + (d.items.length ? ' has-items' : '')}>
            <div className="wk-month-head">
              <b>{d.date}</b>
              {d.items.length > 0 && <span>{d.items.length} 条</span>}
            </div>
            {d.items.length > 0 && (
              <div className="wk-month-stamps">
                {shown.map((it, i) => <MiniStamp key={it.id} idea={it} onOpen={onOpen} i={i} />)}
                {more > 0 && <span className="wk-chip-more">+{more}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function compare(total, prev, unitName) {
  if (!prev) return total ? `${unitName}没有记录` : '还没有记录'
  if (total === prev) return `和${unitName}持平`
  return total > prev ? `比${unitName}多 ${total - prev}` : `比${unitName}少 ${prev - total}`
}

export const WeekBoard = React.memo(function WeekBoard({ stats: s, onPrev, onNext, onThisWeek, onUnit, onOpenIdea, onHeight }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !onHeight) return
    onHeight(el.offsetHeight)
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])
  const fast = s.fastest
  const month = s.unit === 'month'
  const U = month ? '月' : '周'
  const prevName = month ? '上个月' : '上周'
  const thisName = month ? '本月' : '本周'
  return (
    <section ref={ref} className={'wk-board is-' + s.unit} aria-label={month ? '月表' : '周表'}>
      <header className="wk-board-head">
        <div>
          <div className="wk-board-title">{s.isCurrent ? `${thisName}灵感` : month ? '那个月的灵感' : '那一周的灵感'}</div>
          <div className="wk-board-range">{s.range}</div>
        </div>
        <div className="wk-board-ctrl">
        <div className="wk-board-unit" role="tablist">
          <button className={month ? '' : 'is-active'} onClick={() => onUnit('week')} role="tab" aria-selected={!month}>周</button>
          <button className={month ? 'is-active' : ''} onClick={() => onUnit('month')} role="tab" aria-selected={month}>月</button>
        </div>
        <div className="wk-board-nav">
          <button className="wk-icon-btn" onClick={onPrev} title={'上一' + (month ? '个月' : '周')}><Icon name="chevronLeft" size={16} /></button>
          <button className={'wk-week-btn' + (s.isCurrent ? ' is-current' : '')} onClick={onThisWeek} disabled={s.isCurrent}>{thisName}</button>
          <button className="wk-icon-btn" onClick={onNext} title={'下一' + (month ? '个月' : '周')} disabled={s.isCurrent}><Icon name="chevronRight" size={16} /></button>
        </div>
        </div>
      </header>

      <div className="wk-tiles">
        <Tile label={`${thisName}灵感`} value={s.total} sub={compare(s.total, s.prevTotal, prevName)} accent />
        <Tile label="活跃天数" value={<>{s.activeDays}<small> / {s.elapsedDays}</small></>} sub={s.activeDays === s.elapsedDays && s.total ? '每天都有记录' : '有记录的天数'} />
        <Tile label="高峰时段" value={s.peakLabel} sub={s.peak == null ? '还没有记录' : `${s.periods[s.peak].range} · ${s.periodMax} 条`} />
        <Tile label="完稿灵感" value={s.done} sub={s.doneOfWeek ? `${thisName}记下的已完稿 ${s.doneOfWeek} 条` : `${thisName}标记完稿的数量`} />
        <Tile label="最快完稿" value={fast ? fast.label : '—'} sub={fast ? (fast.text ? `「${fast.text}」` : '从记下到完稿') : '从记下到完稿的最短用时'}
          onClick={fast ? () => onOpenIdea(fast.id) : undefined} title={fast ? `从记下到完稿用了 ${fast.label}：${fast.text || '（无文字）'}` : undefined} />
        <Tile label="未完稿灵感" value={s.undone} sub={s.oldestUndone ? `最久的一条放了 ${s.oldestUndone.age}` : s.total ? '全部完稿了' : '还没有记录'}
          onClick={s.oldestUndone ? () => onOpenIdea(s.oldestUndone.id) : undefined} title={s.oldestUndone ? '看看放得最久的那条' : undefined} />
      </div>

      <div className="wk-board-sec is-days">
        <div className="wk-sec-title">每日灵感<span>{month ? '点小邮票看那条灵感' : '一条灵感一张邮票，记得越多叠得越高'}</span></div>
        {month
          ? <MonthDays days={s.days} lead={s.lead} onOpen={onOpenIdea} />
          : <WeekDays days={s.days} onOpen={onOpenIdea} />}
      </div>

      <footer className="wk-board-foot">
        {s.total
          ? <>{month ? '这个月' : '这周'}最早的一条记在<b>{s.earliest.day} {s.earliest.time}</b>，最晚的一条在<b>{s.latest.day} {s.latest.time}</b>。</>
          : s.isCurrent ? <>{month ? '这个月' : '这周'}还没有记录，点下方的 <b>＋</b> 记下第一条。</> : <>这一{U === '月' ? '个月' : '周'}没有记录。</>}
      </footer>
    </section>
  )
})
