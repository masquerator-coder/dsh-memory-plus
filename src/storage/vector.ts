/**
 * 自建向量索引（VectorIndex）。
 *
 * DSH 无内置 embedding/向量库，本实现提供：
 *  - 方案 A（默认，个人助理）：embedding 存于 ctx.storageDomain，进程内余弦相似度检索
 *  - 方案 B：可插拔为外部向量后端（保留 VectorIndex 接口）
 *  - embedding 生成：经 ctx.llm.stream 调 embedding 能力（或外部 API），BlockAssembler 折叠
 *
 * 需在 DSH workspace 内构建。骨架给出接口与检索形态。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AtomicFact } from '../model/fact.js'
import type { VectorIndex } from './store.js'

export class DshVectorIndex implements VectorIndex {
  constructor(private ctx: Context) {
    // 用 ctx.storageDomain 的一张表存 (factId -> embedding[])，按 scope 分桶减小扫描面
  }

  async index(_fact: AtomicFact): Promise<void> {
    // this.table.put(fact.id, fact.embedding)
  }

  async search(queryEmbedding: number[], topK: number, _scope?: string): Promise<AtomicFact[]> {
    // 方案 A：扫描该 scope 桶内所有向量，进程内余弦相似度排序取 topK
    return []
  }

  async remove(factId: string): Promise<void> {
    // this.table.delete(factId)
  }

  /** 生成 query 的 embedding（真实实现经 ctx.llm.stream 调 embedding 能力）。 */
  async embed(_text: string): Promise<number[]> {
    // const chunks = ctx.llm.stream({ provider, model, messages: [{role:'user', content:text}] })
    // return BlockAssembler 折叠 → 向量
    return []
  }
}
