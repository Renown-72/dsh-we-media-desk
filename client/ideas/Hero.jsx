// 首屏：日期、今天的记录情况、录入框、最近两周的记录。
import React from 'react'
import { Composer } from './Composer.jsx'
import { dateLine } from './stats.js'

function Num({ value, accent }) {
  return <span className={'wk-hero-num' + (accent ? ' is-accent' : '')}>{value}</span>
}

function DayStrip({ days }) {
  const max = Math.max(1, ...days.map(d => d.count))
  return (
    <div className="wk-days" aria-label="最近两周的记录">
      {days.map(d => {
        const level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4))
        return (
          <span
            key={d.key}
            className={`wk-day lv-${level}` + (d.today ? ' is-today' : '')}
            title={`${d.month} 月 ${d.date} 日 · ${d.count ? d.count + ' 个灵感' : '没有记录'}`}
          />
        )
      })}
      <span className="wk-days-label">近两周</span>
    </div>
  )
}

export const Hero = React.memo(function Hero({ stats, composerRef, onText, onFiles }) {
  return (
    <div className="wk-hero">
      <div className="wk-hero-date">{dateLine()}</div>
      <h1 className="wk-hero-title">
        {stats.today > 0
          ? <>今天记下了 <Num value={stats.today} /> 个灵感，<br /></>
          : <>今天还没有新灵感，<br /></>}
        本周 <Num value={stats.week} /> 个，一共 <Num value={stats.total} /> 个，<br />
        {stats.streak > 0
          ? <>已经连续记录 <Num value={stats.streak} accent /> 天。</>
          : <>从今天开始，每天记一点。</>}
      </h1>
      <Composer ref={composerRef} onText={onText} onFiles={onFiles} />
      <DayStrip days={stats.days} />
    </div>
  )
})
