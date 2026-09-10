/**
 * 自建向量索引（VectorIndex）——方案 A（个人助理规模）。
 *
 * DSH 无内置 embedding/向量库：embedding 直接存在 `facts` 表记录里（AtomicFact.embedding），
 * 这里在内存做进程内余弦相似度检索，按 scope 过滤。`index`/`remove` 不再需要单独的表，
 * 因为 embedding 随事实记录一起持久化；`search` 从存储读取 active 事实后打分取 topK。
 * @module @dsh/dsh-memory/storage/vector
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AtomicFact } from '../model/fact.js'
import type { VectorIndex } from './store.js'
import { cosine, expired } from './store.js'
import { DshStore } from './kv.js'

export class DshVectorIndex implements VectorIndex {
  private store: DshStore

  constructor(_ctx: Context) {
    this.store = new DshStore(_ctx)
  }

  /** embedding 已随记录持久化；`index` 作为幂等 no-op（保留接口形态）。 */
  async index(_fact: AtomicFact): Promise<void> {
    // embedding 属于 AtomicFact.embedding，由 DshStore.put 一并写库。
  }

  async search(queryEmbedding: number[], topK: number, scope?: string): Promise<AtomicFact[]> {
    const candidates = await this.store.list({ status: 'active', ...(scope ? { scope } : {}) })
    const scored: Array<{ fact: AtomicFact; score: number }> = []
    for (const fact of candidates) {
      if (!fact.embedding || fact.embedding.length === 0) continue
      if (expired(fact)) continue
      scored.push({ fact, score: cosine(queryEmbedding, fact.embedding) })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, Math.max(0, topK)).map((s) => s.fact)
  }

  async remove(factId: string): Promise<void> {
    // 删除记录时 embedding 随之移除；此项保留接口形态。
    void factId
  }
}
