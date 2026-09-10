/**
 * MemoryService（纯逻辑组合层）。
 *
 * 把 Extractor / Store / VectorIndex / Graph / Policy 组装成对外 API：
 *  - remember(input)：抽取候选 → Remember Engine
 *  - recall(query)：Recall Engine
 *  - forget(id, mode)：删除或归档
 *
 * Host 半的 DSH 版本（src/index.ts）在这层包一层 ctx 服务注册与事件注入，
 * 但业务逻辑复用它，避免在端点里重复实现。
 */

import type { AtomicFact, AtomicFactInput } from './model/fact.js'
import type { Extractor } from './engines/remember.js'
import { rememberMany } from './engines/remember.js'
import type { RecallQuery } from './engines/recall.js'
import { recall as recallEngine } from './engines/recall.js'
import type { MemoryStore, VectorIndex } from './storage/store.js'
import type { GraphIndex, RankingWeights } from './engines/recall.js'
import type { ValidatorDeps } from './model/validator.js'

export interface MemoryServiceDeps {
  store: MemoryStore
  vector: VectorIndex
  extractor: Extractor
  graph?: GraphIndex
  deps?: ValidatorDeps
  weights?: Partial<RankingWeights>
}

export class MemoryService {
  constructor(private deps: MemoryServiceDeps) {}

  /** 显式 / 隐式记忆入口：抽取 → 验证 → 存储 → 关联。 */
  async remember(input: { content: string; scope: string; source: AtomicFactInput['source'] }): Promise<AtomicFact[]> {
    // 抽取永远由独立 Extractor 完成（主会话 LLM 不做抽取）
    const candidates = await this.deps.extractor.extract(input.content, input.scope)
    const mapped = candidates.map((c) => ({
      ...c,
      scope: input.scope,
      source: c.source ?? input.source,
    }))
    const result = await rememberMany(mapped, {
      store: this.deps.store,
      vector: this.deps.vector,
      deps: this.deps.deps,
    })
    return result.created
  }

  /** 检索相关记忆（向量 + 图扩展 + 策略排序）。 */
  async recall(query: RecallQuery): Promise<AtomicFact[]> {
    return recallEngine(query, {
      store: this.deps.store,
      vector: this.deps.vector,
      graph: this.deps.graph,
      weights: this.deps.weights,
    })
  }

  /** 删除或归档一条事实。 mode: 'delete' 硬删；'archive' 标记 archived。 */
  async forget(id: string, mode: 'delete' | 'archive' = 'delete'): Promise<boolean> {
    if (mode === 'archive') {
      const f = await this.deps.store.get(id)
      if (!f) return false
      await this.deps.store.put({ ...f, status: 'archived', updated_at: new Date().toISOString() })
      await this.deps.vector.remove(id)
      return true
    }
    const ok = await this.deps.store.delete(id)
    if (ok) await this.deps.vector.remove(id)
    return ok
  }
}
