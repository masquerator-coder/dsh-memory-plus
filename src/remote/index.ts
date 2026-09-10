/**
 * Host 半 Remote 契约（供 Browser 半调用）。
 *
 * 用 Typert Remote 装饰器（@Remote）把权威方法暴露到 ctx.remote.memory.<method>。
 * 真实实现继承 TypertRemoteService；浏览器半把 namespace 挂到 ctx.remote.memory。
 * 契约对齐设计文档 §8.3 API 表。
 *
 * 需在 DSH workspace 内构建（依赖 @deepseek-ai/typert 等 Remote 体系）。
 */

/** 概览统计（对齐 UI 设计 §5.1）。 */
export interface MemoryStats {
  totalFacts: number
  newThisWeek: number
  storageBytes: number
  typeDistribution: { semantic: number; episodic: number; procedural: number }
  recentActivity: Array<{ time: string; text: string }>
  systemStatus: {
    extractionQueue: number
    lastSync: string
    vectorStore: 'healthy' | 'degraded' | 'down'
    graphStore: 'healthy' | 'degraded' | 'down'
  }
}

export interface FactDetail {
  id: string
  subject: string
  predicate: string
  object: string
  qualifiers?: string
  confidence: number
  source: string
  version: number
  status: string
}

export interface ChangeSummary {
  added: string[]
  modified: string[]
  removed: string[]
}

/** 官方 MemoryRemote service（骨架）——真实签名：
 *  class MemoryRemote extends TypertRemoteService {
 *    constructor(ctx) { super(ctx, 'memory', { id: 'memory' }) }
 *    @Remote('stats')      stats(): Promise<MemoryStats> { ... }
 *    @Remote('facts.query') factsQuery(f: FactFilter): Promise<FactsPage> { ... }
 *    ...
 *  }
 */
export abstract class MemoryRemoteContract {
  abstract stats(): Promise<MemoryStats>
  abstract soulGet(): Promise<{ content: string; tokenCount: number }>
  abstract soulPut(patch: { content: string }): Promise<{ ok: boolean }>
  abstract factsQuery(filter: unknown): Promise<{ items: FactDetail[]; total: number }>
  abstract factUpdate(id: string, patch: unknown): Promise<{ ok: boolean }>
  abstract factDelete(id: string): Promise<{ ok: boolean }>
  abstract profileParse(content: string): Promise<ChangeSummary>
  abstract profileApply(changes: ChangeSummary): Promise<void>
  abstract configGet(): Promise<unknown>
  abstract configPut(config: unknown): Promise<void>
  abstract toggle(enabled: boolean): Promise<void>
}
