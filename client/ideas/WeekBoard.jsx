// 周表：本周灵感概览——六个数据格、每日灵感预览、六个时段的分布、一句小结。
import React from 'react'
import { isDirectMedia } from '../../src/ideas.js'
import { fileUrl } from '../storage.js'
import { Icon } from '../icons.jsx'

const MAX_PER_DAY = 3
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

function compare(total, prev) {
  if (!prev) return total ? '上周没有记录' : '还没有记录'
  if (total === prev) return '和上周持平'
  return total > prev ? `比上周多 ${total - prev}` : `比上周少 ${prev - total}`
}

export const WeekBoard = React.memo(function WeekBoard({ stats: s, onPrev, onNext, onThisWeek, onOpenIdea }) {
  const fast = s.fastest
  return (
    <section className="wk-board" aria-label="周表">
      <header className="wk-board-head">
        <div>
          <div className="wk-board-title">{s.isCurrent ? '本周灵感' : '那一周的灵感'}</div>
          <div className="wk-board-range">{s.range}</div>
        </div>
        <div className="wk-board-nav">
          <button className="wk-icon-btn" onClick={onPrev} title="上一周"><Icon name="chevronLeft" size={16} /></button>
          <button className={'wk-week-btn' + (s.isCurrent ? ' is-current' : '')} onClick={onThisWeek} disabled={s.isCurrent}>本周</button>
          <button className="wk-icon-btn" onClick={onNext} title="下一周" disabled={s.isCurrent}><Icon name="chevronRight" size={16} /></button>
        </div>
      </header>

      <div className="wk-tiles">
        <Tile label="本周灵感" value={s.total} sub={compare(s.total, s.prevTotal)} accent />
        <Tile label="活跃天数" value={<>{s.activeDays}<small> / {s.elapsedDays}</small></>} sub={s.activeDays === s.elapsedDays && s.total ? '每天都有记录' : '有记录的天数'} />
        <Tile label="高峰时段" value={s.peakLabel} sub={s.peak == null ? '还没有记录' : `${s.periods[s.peak].range} · ${s.periodMax} 条`} />
        <Tile label="完稿灵感" value={s.done} sub={s.doneOfWeek ? `本周记下的已完稿 ${s.doneOfWeek} 条` : '本周标记完稿的数量'} />
        <Tile label="最快完稿" value={fast ? fast.label : '—'} sub={fast ? (fast.text ? `「${fast.text}」` : '从记下到完稿') : '从记下到完稿的最短用时'}
          onClick={fast ? () => onOpenIdea(fast.id) : undefined} title={fast ? `从记下到完稿用了 ${fast.label}：${fast.text || '（无文字）'}` : undefined} />
        <Tile label="最常用标签" value={s.topTag ? '#' + s.topTag.tag : '—'} sub={s.topTag ? `用了 ${s.topTag.count} 次` : '写 #标签 来归类'} />
      </div>

      <div className="wk-board-sec">
        <div className="wk-sec-title">每日灵感</div>
        <div className="wk-week">
          {s.days.map(d => (
            <div key={d.key} className={'wk-weekday' + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : '')}>
              <div className="wk-weekday-head">
                <span>{d.label}</span><b>{d.date}</b>
              </div>
              <div className="wk-weekday-list">
                {d.items.slice(-MAX_PER_DAY).reverse().map(it => <MiniIdea key={it.id} idea={it} onOpen={onOpenIdea} />)}
                {d.items.length === 0 && <span className="wk-weekday-empty">{d.future ? '' : '—'}</span>}
                {d.items.length > MAX_PER_DAY && <span className="wk-weekday-more">还有 {d.items.length - MAX_PER_DAY} 条</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="wk-board-sec">
        <div className="wk-sec-title">灵感时段<span>本周各时段记下的条数</span></div>
        <div className="wk-periods">
          {s.periods.map((p, i) => (
            <div key={p.id} className={'wk-period' + (i === s.peak ? ' is-peak' : '') + (p.count ? '' : ' is-zero')} title={`${p.label} ${p.range} · ${p.count} 条`}>
              <div className="wk-period-count">{p.count || ''}</div>
              <div className="wk-period-track">
                <div className="wk-period-bar" style={{ height: p.count ? `${Math.max(6, (p.count / s.periodMax) * 100)}%` : 0 }} />
              </div>
              <div className="wk-period-label">{p.label}</div>
              <div className="wk-period-range">{p.range}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="wk-board-foot">
        {s.total
          ? <>这周最早的一条记在<b>{s.earliest.day} {s.earliest.time}</b>，最晚的一条在<b>{s.latest.day} {s.latest.time}</b>。</>
          : s.isCurrent ? <>这周还没有记录，点下方的 <b>＋</b> 记下第一条。</> : <>这一周没有记录。</>}
      </footer>
    </section>
  )
})
