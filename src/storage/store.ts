/**
 * 记忆存储抽象（MemoryStore）。
 *
 * 引擎层只依赖这个窄接口，不依赖具体后端：
 *  - 进程内 mock（example/ 用它跑通最小闭环）
 *  - Host 半用 ctx.storageDomain 的 KvTable 实现本接口（见 src/storage/kv.ts）
 *  - 向量检索通过可选的 VectorIndex 接口注入
 *
 * 这是纯 TypeScript 类型契约，可独立编译验证。
 */

import type { AtomicFact, AtomicFactInput, FactStatus, FactType } from '../model/fact.js'

/** 查询过滤器。 */
export interface FactFilter {
  type?: FactType
  scope?: string
  status?: FactStatus
  semanticKey?: string
  search?: string
}

/** 记忆存储窄接口。 */
export interface MemoryStore {
  /** 写入/覆盖一条事实。返回存储后的事实。 */
  put(fact: AtomicFact): Promise<AtomicFact>
  /** 按 id 读取。 */
  get(id: string): Promise<AtomicFact | undefined>
  /** 按过滤器列出一批事实（简单实现，分页由上层处理）。 */
  list(filter?: FactFilter): Promise<AtomicFact[]>
  /** 删除（或归档）一条事实。 */
  delete(id: string): Promise<boolean>
  /** 按语义键找出当前 active 版本（用于去重/冲突消解）。 */
  findActiveBySemanticKey(semanticKey: string, scope: string): Promise<AtomicFact | undefined>
  /** 列出某个 scope 下同一语义键的所有版本（用于 supersede 链）。 */
  listVersions(semanticKey: string, scope: string): Promise<AtomicFact[]>
  /** 关闭存储。 */
  close(): Promise<void>
}

/** 向量检索接口（自建，DSH 无内置向量库）。 */
export interface VectorIndex {
  /** 索引一条事实的 embedding。 */
  index(fact: AtomicFact): Promise<void>
  /** 查询与 query 向量最相近的 topK 条事实。 */
  search(queryEmbedding: number[], topK: number, scope?: string): Promise<AtomicFact[]>
  /** 移除索引。 */
  remove(factId: string): Promise<void>
}

/** 内存实现：也是 example 的默认存储与测试替身。 */
export class InMemoryStore implements MemoryStore {
  private facts = new Map<string, AtomicFact>()

  async put(fact: AtomicFact): Promise<AtomicFact> {
    this.facts.set(fact.id, fact)
    return fact
  }

  async get(id: string): Promise<AtomicFact | undefined> {
    return this.facts.get(id)
  }

  async list(filter: FactFilter = {}): Promise<AtomicFact[]> {
    let items = [...this.facts.values()]
    if (filter.type) items = items.filter((f) => f.type === filter.type)
    if (filter.scope) items = items.filter((f) => f.scope === filter.scope)
    if (filter.status) items = items.filter((f) => f.status === filter.status)
    if (filter.semanticKey) items = items.filter((f) => f.semantic_key === filter.semanticKey)
    if (filter.search) {
      const q = filter.search.toLowerCase()
      items = items.filter((f) => f.content.toLowerCase().includes(q))
    }
    return items
  }

  async delete(id: string): Promise<boolean> {
    return this.facts.delete(id)
  }

  async findActiveBySemanticKey(semanticKey: string, scope: string): Promise<AtomicFact | undefined> {
    for (const f of this.facts.values()) {
      if (f.semantic_key === semanticKey && f.scope === scope && f.status === 'active') return f
    }
    return undefined
  }

  async listVersions(semanticKey: string, scope: string): Promise<AtomicFact[]> {
    return [...this.facts.values()]
      .filter((f) => f.semantic_key === semanticKey && f.scope === scope)
      .sort((a, b) => a.version - b.version)
  }

  async close(): Promise<void> {
    this.facts.clear()
  }
}

/** 内存向量实现：进程内余弦相似度（个人助理规模的默认方案 A）。 */
export class InMemoryVectorIndex implements VectorIndex {
  private entries = new Map<string, AtomicFact>()

  async index(fact: AtomicFact): Promise<void> {
    this.entries.set(fact.id, fact)
  }

  async search(query: number[], topK: number, scope?: string): Promise<AtomicFact[]> {
    const scored: Array<{ fact: AtomicFact; score: number }> = []
    for (const fact of this.entries.values()) {
      if (scope && fact.scope !== scope) continue
      if (!fact.embedding || fact.status !== 'active' || expired(fact)) continue
      scored.push({ fact, score: cosine(query, fact.embedding) })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK).map((s) => s.fact)
  }

  async remove(factId: string): Promise<void> {
    this.entries.delete(factId)
  }
}

export function cosine(a: number[], b: number[]): number {
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

/** TTL 过期判断（弱遗忘）：active 且未过 valid_to / ttl。 */
export function expired(fact: AtomicFact): boolean {
  const to = fact.qualifiers?.time?.valid_to
  if (to) return Date.parse(to) <= Date.now()
  if (fact.ttl && fact.created_at) {
    const deadline = Date.parse(fact.created_at) + parseTtlMs(fact.ttl)
    if (Number.isFinite(deadline)) return deadline <= Date.now()
  }
  return false
}

export function parseTtlMs(ttl: string): number {
  const m = /^(\d+)(d|h|m|s)$/.exec(ttl)
  if (!m) return 0
  const n = Number(m[1])
  switch (m[2]) {
    case 'd': return n * 86_400_000
    case 'h': return n * 3_600_000
    case 'm': return n * 60_000
    case 's': return n * 1000
    default: return 0
  }
}
