/**
 * DSH 存储封装：把 ctx.storageDomain 的 KvTable 适配成 MemoryStore 窄接口。
 *
 * 需在 DSH workspace 内构建（依赖 @deepseek-ai/dsh-storage-domain）。
 * 用 defineDomain(spec) 声明领域表（json/sqlite 后端），KvTable 提供 get/put/delete/list。
 *
 * 说明：这是骨架，给出字段与调用形态；真实实现需按 storage-domain 的领域表 API 精确对接。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AtomicFact, AtomicFactInput, FactFilter, FactStatus } from '../model/fact.js'
import type { MemoryStore } from './store.js'

export class DshStore implements MemoryStore {
  constructor(private ctx: Context) {
    // 真实实现：
    //   const domain = this.ctx.storageDomain.open(defineDomain({
    //     name: 'dsh-memory',
    //     table: (t) => ({
    //       facts: t.object<AtomicFact>().index('semantic_key').index('scope').index('status'),
    //       edges:  t.object<FactEdge>().index('from').index('to'),
    //     }),
    //   }))
    //   this.facts = domain.table('facts')
  }

  private facts: { get: (k: string) => Promise<AtomicFact | undefined>; } = {
    // placeholder — see comments above; wired in the real constructor
    get: async () => undefined,
  }

  async put(fact: AtomicFact): Promise<AtomicFact> {
    // this.facts.put(fact.id, fact)
    return fact
  }

  async get(id: string): Promise<AtomicFact | undefined> {
    return this.facts.get(id)
  }

  async list(_filter: FactFilter = {}): Promise<AtomicFact[]> {
    // this.facts.entries 过滤
    return []
  }

  async delete(id: string): Promise<boolean> {
    // return this.facts.delete(id)
    return true
  }

  async findActiveBySemanticKey(_semanticKey: string, _scope: string): Promise<AtomicFact | undefined> {
    // 按 semantic_key+scope 索引查询
    return undefined
  }

  async listVersions(_semanticKey: string, _scope: string): Promise<AtomicFact[]> {
    return []
  }

  async close(): Promise<void> {
    // domain.close()
  }
}

/** Placeholder 类型（避免未使用告警）。 */
export type { AtomicFact, AtomicFactInput, FactStatus }
