// 周表 / 月表：灵感概览——六个数据格、每日灵感预览（周：每天一列；月：月历）、一句小结。
import React from 'react'
import { isDirectMedia } from '../../src/ideas.js'
import { fileUrl } from '../storage.js'
import { Icon } from '../icons.jsx'

const MAX_PER_DAY = 5
const MAX_PER_CELL = 3
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

function MiniIdea({ idea, onOpen }) {
  const thumb = thumbOf(idea)
  const text = snippet(idea)
  const time = new Date(idea.createdAt)
  const hm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
  return (
    <button className={'wk-mini-idea is-' + (idea.kind || 'text') + (thumb ? ' has-thumb' : '') + (idea.done ? ' is-done' : '')}
      title={`${hm} · ${text || '（无文字）'}`} onClick={() => onOpen(idea.id)}>
      {thumb
        ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />
        : <span className="wk-mini-text">{text}</span>}
      <span className="wk-mini-meta">
        <Icon name={KIND_ICON[idea.kind || 'text']} size={10} />{hm}
        {idea.done && <Icon name="check" size={10} stroke={2.6} className="wk-mini-done" />}
      </span>
    </button>
  )
}

function hmOf(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 月历格子里的小方块：有图显示缩略图，否则显示类型图标
function IdeaChip({ idea, onOpen }) {
  const thumb = thumbOf(idea)
  return (
    <button className={'wk-chip is-' + (idea.kind || 'text') + (idea.done ? ' is-done' : '')}
      title={`${hmOf(idea.createdAt)} · ${snippet(idea) || '（无文字）'}${idea.done ? ' · 已完稿' : ''}`}
      onClick={() => onOpen(idea.id)}>
      {thumb
        ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />
        : <Icon name={KIND_ICON[idea.kind || 'text']} size={11} />}
    </button>
  )
}

function WeekDays({ days, onOpen }) {
  return (
    <div className="wk-week">
      {days.map(d => (
        <div key={d.key} className={'wk-weekday' + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : '')}>
          <div className="wk-weekday-head">
            <span>{d.label}</span><b>{d.date}</b>
          </div>
          <div className="wk-weekday-list">
            {d.items.slice(-MAX_PER_DAY).reverse().map(it => <MiniIdea key={it.id} idea={it} onOpen={onOpen} />)}
            {d.items.length === 0 && <span className="wk-weekday-empty">{d.future ? '' : '—'}</span>}
            {d.items.length > MAX_PER_DAY && <span className="wk-weekday-more">还有 {d.items.length - MAX_PER_DAY} 条</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthDays({ days, lead, onOpen }) {
  return (
    <div className="wk-month">
      {SHORT_DAY.map(d => <div key={d} className="wk-month-wd">{d}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={'pad' + i} className="wk-month-pad" />)}
      {days.map(d => {
        // 放不下时少放一个，给 +N 腾地方
        const shown = d.items.slice(-(d.items.length > MAX_PER_CELL ? MAX_PER_CELL - 1 : MAX_PER_CELL)).reverse()
        const more = d.items.length - shown.length
        return (
          <div key={d.key} className={'wk-month-day' + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : '') + (d.items.length ? ' has-items' : '')}>
            <div className="wk-month-head">
              <b>{d.date}</b>
              {d.items.length > 0 && <span>{d.items.length} 条</span>}
            </div>
            {d.items.length > 0 && (
              <div className="wk-month-chips">
                {shown.map(it => <IdeaChip key={it.id} idea={it} onOpen={onOpen} />)}
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

export const WeekBoard = React.memo(function WeekBoard({ stats: s, onPrev, onNext, onThisWeek, onUnit, onOpenIdea }) {
  const fast = s.fastest
  const month = s.unit === 'month'
  const U = month ? '月' : '周'
  const prevName = month ? '上个月' : '上周'
  const thisName = month ? '本月' : '本周'
  return (
    <section className="wk-board" aria-label={month ? '月表' : '周表'}>
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
        <Tile label="最常用标签" value={s.topTag ? '#' + s.topTag.tag : '—'} sub={s.topTag ? `用了 ${s.topTag.count} 次` : '写 #标签 来归类'} />
      </div>

      <div className="wk-board-sec is-days">
        <div className="wk-sec-title">每日灵感</div>
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
