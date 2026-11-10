// 信息流：置顶在最上，其余按记录时间倒序、按天分组。
import React from 'react'
import { groupByDay } from '../../src/ideas.js'
import { IdeaCard } from './IdeaCard.jsx'

const { useMemo } = React

export function FeedView({ items, cardProps }) {
  const pinned = useMemo(() => items.filter(it => it.pinned), [items])
  const groups = useMemo(() => groupByDay(items.filter(it => !it.pinned)), [items])

  return (
    <div className="wk-feed">
      {pinned.length > 0 && (
        <section className="wk-feed-group">
          <h3 className="wk-feed-day">📌 置顶</h3>
          {pinned.map(it => <IdeaCard key={it.id} idea={it} variant="feed" {...cardProps} />)}
        </section>
      )}
      {groups.map(g => (
        <section key={g.key} className="wk-feed-group">
          <h3 className="wk-feed-day">{g.label}<span className="wk-feed-count">{g.items.length}</span></h3>
          {g.items.map(it => <IdeaCard key={it.id} idea={it} variant="feed" {...cardProps} />)}
        </section>
      ))}
    </div>
  )
}
