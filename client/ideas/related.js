// 相关灵感（纯函数）：按共同的关键词给旧灵感打分。
// 关键词：英文单词、中文连续两字；用“越少见越重要”（IDF）加权，常见词自然降权。

const STOP = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'you', 'are', 'was', 'from', 'have', 'has', 'not', 'but', 'can', 'how', 'what', 'why', 'www', 'com', 'http', 'https',
  '一个', '这个', '那个', '我们', '你们', '他们', '自己', '什么', '怎么', '为什么', '可以', '就是', '不是', '没有', '还是', '因为', '所以', '但是', '已经', '现在', '真的', '一下', '一些', '这样', '那样', '时候', '觉得', '知道', '然后',
])

const CJK_RUN = /[㐀-鿿]+/g
const WORD = /[a-z0-9][a-z0-9+#]*(?:[.-][a-z0-9+#]+)*/g

// 把一段文字拆成关键词集合
export function keywords(text) {
  const out = new Set()
  const s = String(text ?? '').toLowerCase()
  for (const w of s.match(WORD) || []) {
    if (w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w)
  }
  for (const run of s.match(CJK_RUN) || []) {
    if (run.length >= 2 && run.length <= 4 && !STOP.has(run)) out.add(run)
    for (let i = 0; i + 2 <= run.length; i++) {
      const pair = run.slice(i, i + 2)
      if (!STOP.has(pair)) out.add(pair)
    }
  }
  return out
}

function textOf(it) {
  const p = it.preview || {}
  return [it.text, p.title, p.description].filter(Boolean).join(' ')
}

// 找出与 target 相关的灵感，返回按相关程度排好的 id（不含 target 自己、不含归档）。
// target 可以是一条灵感，也可以是 { text, tags }。
export function relatedIdeas(ideas, target, { limit = 8, minScore = 2.2 } = {}) {
  const pool = ideas.filter(it => !it.archived && it.id !== target.id)
  if (!pool.length) return []
  const targetWords = keywords(textOf(target))
  const targetTags = new Set(target.tags || [])
  if (!targetWords.size && !targetTags.size) return []

  const docs = pool.map(it => ({ it, words: keywords(textOf(it)), tags: new Set(it.tags || []) }))
  // 文档频率：一个词出现在多少条灵感里
  const df = new Map()
  for (const d of docs) for (const w of d.words) if (targetWords.has(w)) df.set(w, (df.get(w) || 0) + 1)
  const n = docs.length
  const idf = w => Math.log((n + 1) / ((df.get(w) || 0) + 1)) + 1

  const scored = []
  for (const d of docs) {
    let score = 0
    let strong = 0 // 完整的词（英文单词 / 短中文词）命中次数；两字片段只算弱命中
    for (const w of d.words) {
      if (!targetWords.has(w)) continue
      const isPair = /^[㐀-鿿]{2}$/.test(w)
      score += idf(w) * (isPair ? 0.6 : 1.2)
      if (!isPair) strong++
    }
    for (const t of d.tags) if (targetTags.has(t)) { score += 3; strong++ }
    // 有完整的词或标签命中就算相关；只撞上两字片段的，要撞够几个才算，
    // 避免“今天”“视频”这类泛词凑数
    if (strong > 0 ? score >= 1 : score >= minScore) {
      scored.push({ id: d.it.id, score, at: d.it.createdAt ?? 0 })
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, limit)
    .map(s => s.id)
}
