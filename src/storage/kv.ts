/**
 * DSH 存储封装：用 ctx.storageDomain 的 KvTable 实现 MemoryStore 窄接口。
 *
 * 打开 `memoryDomainSpec`，`facts` 表按 id 存 AtomicFact；所有写都走领域写链
 * （backend 先持久化再改内存再发事件），读同步来自内存。get/list 包装成异步接口
 * 以贴合 MemoryStore。
 * @module @dsh/dsh-memory/storage/kv
 */

import type { Context } from '@deepseek-ai/cordis'
import type { MemoryStore, FactFilter } from './store.js'
import type { AtomicFact } from '../model/fact.js'
import { memoryDomainSpec, toFactRecord, fromFactRecord } from './spec.js'
import type { FactRecord } from './spec.js'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'

/** 关键类型：承载 storage-domain 的领域与表句柄。 */
type DomainOf = Domain<typeof memoryDomainSpec>
type FactsTable = KvTable<string, FactRecord>

export class DshStore implements MemoryStore {
  private domain: DomainOf | undefined
  private facts: FactsTable | undefined

  constructor(private ctx: Context) {}

  /** 惰性打开领域（首次经 ctx.storageDomain.open），并由 ctx.effect 托管关闭。 */
  private async open(): Promise<FactsTable> {
    if (this.facts) return this.facts
    const domain = await this.ctx.storageDomain.open(memoryDomainSpec)
    this.ctx.effect(() => () => { void domain.close() }, 'dsh-memory.storage.domainClose')
    this.domain = domain
    this.facts = domain.table('facts')
    return this.facts
  }

  async put(fact: AtomicFact): Promise<AtomicFact> {
    const table = await this.open()
    await table.put(fact.id, toFactRecord(fact))
    return fact
  }

  async get(id: string): Promise<AtomicFact | undefined> {
    const table = await this.open()
    const record = table.get(id)
    return record ? fromFactRecord(record) : undefined
  }

  async list(filter: FactFilter = {}): Promise<AtomicFact[]> {
    const table = await this.open()
    const items: AtomicFact[] = []
    for (const [, record] of table.entries()) {
      const fact = fromFactRecord(record)
      if (filter.type && fact.type !== filter.type) continue
      if (filter.scope && fact.scope !== filter.scope) continue
      if (filter.status && fact.status !== filter.status) continue
      if (filter.semanticKey && fact.semantic_key !== filter.semanticKey) continue
      if (filter.search && !fact.content.toLowerCase().includes(filter.search.toLowerCase())) continue
      items.push(fact)
    }
    return items
  }

  async delete(id: string): Promise<boolean> {
    const table = await this.open()
    return table.delete(id)
  }

  async findActiveBySemanticKey(semanticKey: string, scope: string): Promise<AtomicFact | undefined> {
    const items = await this.list({ semanticKey, scope, status: 'active' })
    return items[0]
  }

  async listVersions(semanticKey: string, scope: string): Promise<AtomicFact[]> {
    const items = await this.list({ semanticKey, scope })
    return items.sort((a, b) => a.version - b.version)
  }

  async close(): Promise<void> {
    if (this.domain) {
      await this.domain.close()
      this.domain = undefined
      this.facts = undefined
    }
  }
}
