/**
 * Recall Engine（纯逻辑）：向量召回 → 过滤 → semantic_key 去重 → 图扩展 → 策略排序。
 *
 * 可注入依赖：store / vector / graph（关系边，可选）/ policy（排序权重）。
 */

import type { AtomicFact } from '../model/fact.js'
import type { MemoryStore, VectorIndex } from '../storage/store.js'

/** 关系边（自建图索引，见 storage/edges.ts 的纯逻辑版）。 */
export interface FactEdge {
  from: string
  predicate: string
  to: string
}

/** 图扩展接口：给定种子实体，返回 1-2 跳相关的实体 id。 */
export interface GraphIndex {
  expand(seedEntities: string[], hops: number): Promise<string[]>
}

export interface RecallQuery {
  query: string
  queryEmbedding: number[]
  scope?: string
  topK: number
  graphHops?: number
}

export interface RankingWeights {
  relevance: number
  confidence: number
  credibility: number
  recency: number
}

export interface RecallOptions {
  store: MemoryStore
  vector: VectorIndex
  graph?: GraphIndex
  weights?: Partial<RankingWeights>
  /** 判断查询文本与事实 content 的相关性打分（默认用向量的余弦，见 recall）。 */
}

const DEFAULT_WEIGHTS: RankingWeights = {
  relevance: 0.4,
  confidence: 0.25,
  credibility: 0.2,
  recency: 0.15,
}

/** 召回：返回按最终分数排序的 top-N 事实。 */
export async function recall(
  q: RecallQuery,
  opts: RecallOptions,
): Promise<AtomicFact[]> {
  // ① 向量召回 top-K（预留裕量供去重/过滤）
  const pool = await opts.vector.search(q.queryEmbedding, Math.max(q.topK * 3, 16), q.scope)

  // ② 过滤（vector.search 已保证 active + scope + 未过期；这里再做 status 兜底）
  // ③ semantic_key 去重：同一键只保留最高分
  const byKey = new Map<string, AtomicFact>()
  for (const fact of pool) {
    if (fact.status !== 'active') continue
    const prev = byKey.get(fact.semantic_key)
    if (!prev || fact.version > prev.version) byKey.set(fact.semantic_key, fact)
  }
  let scored = [...byKey.values()]

  // ④ 图扩展：以命中事实的 entities 为种子沿边扩展，把邻居事实并入候选
  if (opts.graph && q.graphHops && q.graphHops > 0) {
    const seedEntities = new Set<string>()
    for (const f of scored) for (const e of f.entities ?? []) seedEntities.add(e)
    const related = await opts.graph.expand([...seedEntities], q.graphHops)
    if (related.length > 0) {
      const neighbors = await opts.store.list({ scope: q.scope })
      for (const f of neighbors) {
        if (f.status !== 'active') continue
        if (related.some((r) => (f.entities ?? []).includes(r))) {
          if (!byKey.has(f.semantic_key)) byKey.set(f.semantic_key, f)
        }
      }
      scored = [...byKey.values()]
    }
  }

  // ⑤ 策略排序
  const w: RankingWeights = { ...DEFAULT_WEIGHTS, ...opts.weights }
  scored = scored.map((f) => ({
    fact: f,
    score: rankScore(q, f, w),
  })).sort((a, b) => b.score - a.score).map((s) => s.fact)

  return scored.slice(0, q.topK)
}

/** 排序打分：score = w1·relevance + w2·confidence + w3·credibility + w4·recency。 */
function rankScore(q: RecallQuery, f: AtomicFact, w: RankingWeights): number {
  const relevance = f.embedding ? cosineSimilarity(q.queryEmbedding, f.embedding) : 0
  const recency = Math.max(0, 1 - dayAge(f.updated_at) / 180)
  return (
    w.relevance * relevance +
    w.confidence * f.confidence +
    w.credibility * (f.source.credibility || 0.5) +
    w.recency * recency
  )
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function dayAge(iso: string): number {
  const ms = Date.now() - Date.parse(iso)
  return Number.isFinite(ms) ? ms / 86_400_000 : 0
}
