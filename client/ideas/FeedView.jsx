// 信息流：瀑布流卡片。置顶在最上，其余按记录时间倒序、按天分组。
import React from 'react'
import { groupByDay } from '../../src/ideas.js'
import { IdeaCard } from './IdeaCard.jsx'
import { masonryColumns, GAP } from './layout.js'

const { useMemo, useState, useRef, useLayoutEffect } = React

const MIN_COL = 240
const MAX_COLS = 4

// 根据容器宽度决定列数
function useColumns(ref) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  const cols = Math.max(1, Math.min(MAX_COLS, Math.floor((width + GAP) / (MIN_COL + GAP))))
  return { cols, colWidth: width ? (width - GAP * (cols - 1)) / cols : MIN_COL }
}

function Masonry({ items, cols, colWidth, cardProps, highlight }) {
  const columns = useMemo(() => masonryColumns(items, cols, colWidth), [items, cols, colWidth])
  return (
    <div className="wk-masonry" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {columns.map((col, i) => (
        <div key={i} className="wk-masonry-col">
          {col.map(it => (
            <div key={it.id} className={'wk-masonry-cell' + (highlight === it.id ? ' is-new' : '')}>
              <IdeaCard idea={it} variant="feed" {...cardProps} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function FeedView({ items, cardProps, related, relatedItems, anchor, onCloseRelated, highlight }) {
  const ref = useRef(null)
  const { cols, colWidth } = useColumns(ref)
  const pinned = useMemo(() => items.filter(it => it.pinned), [items])
  const groups = useMemo(() => groupByDay(items.filter(it => !it.pinned)), [items])

  return (
    <div className="wk-feed" ref={ref}>
      {related && (
        <section className="wk-feed-group wk-related">
          <h3 className="wk-feed-day">
            {relatedItems.length
              ? <>和「{anchor}」相关的灵感<span className="wk-feed-count">{relatedItems.length}</span></>
              : <>没有找到和「{anchor}」相关的灵感</>}
            <button className="wk-mini wk-related-close" onClick={onCloseRelated}>收起（Esc）</button>
          </h3>
          {relatedItems.length > 0 && <Masonry items={relatedItems} cols={cols} colWidth={colWidth} cardProps={cardProps} />}
        </section>
      )}
      {pinned.length > 0 && (
        <section className="wk-feed-group">
          <h3 className="wk-feed-day">📌 置顶</h3>
          <Masonry items={pinned} cols={cols} colWidth={colWidth} cardProps={cardProps} highlight={highlight} />
        </section>
      )}
      {groups.map(g => (
        <section key={g.key} className="wk-feed-group">
          <h3 className="wk-feed-day">{g.label}<span className="wk-feed-count">{g.items.length}</span></h3>
          <Masonry items={g.items} cols={cols} colWidth={colWidth} cardProps={cardProps} highlight={highlight} />
        </section>
      ))}
    </div>
  )
}
