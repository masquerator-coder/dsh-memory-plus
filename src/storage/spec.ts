/**
 * 记忆系统领域声明（DSH storage-domain）。
 *
 * 以 zod schema 定义持久化形状，`ctx.storageDomain.open(spec)` 后经
 * `domain.table(name)` 获得类型化 KvTable。这是 json/sqlite 后端共用的单一权威。
 * @module @dsh/dsh-memory/storage/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { AtomicFact, FactStatus } from '../model/fact.js'

/** 持久化的事实记录：与模型 `AtomicFact` 对齐（id 为表键，其余全量存储）。 */
export const factRecord = z.object({
  id: z.string(),
  subject: z.object({ type: z.string(), id: z.string(), name: z.string().optional() }),
  predicate: z.string(),
  object: z.object({ type: z.string(), id: z.string(), name: z.string().optional() }),
  qualifiers: z.record(z.string(), z.unknown()).optional(),
  content: z.string(),
  type: z.enum(['semantic', 'episodic', 'procedural']),
  scope: z.string(),
  source: z.object({
    type: z.enum(['conversation', 'user_edit', 'document', 'llm_inference']),
    uri: z.string(),
    extracted_by: z.string(),
    credibility: z.number(),
  }),
  confidence: z.number(),
  version: z.number(),
  supersedes: z.string().optional(),
  semantic_key: z.string(),
  status: z.enum(['active', 'superseded', 'archived', 'disputed', 'expired']),
  privacy: z.enum(['private', 'project', 'org', 'public']),
  ttl: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  entities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  episodic: z.object({
    event_time: z.string(),
    participants: z.array(z.string()),
    outcome: z.string(),
    duration: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
  }).optional(),
  procedural: z.object({
    steps: z.array(z.string()),
    preconditions: z.array(z.string()),
    tool_chain: z.array(z.string()),
    success_rate: z.number(),
  }).optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

/** 一条持久化事实（zod 推断类型）。 */
export type FactRecord = z.infer<typeof factRecord>

/** 记忆系统持久化领域：`facts` 表按 id 存原子事实。 */
export const memoryDomainSpec = defineDomain({
  name: 'dsh_memory',
  version: 1,
  tables: {
    facts: domainTable<string, FactRecord>(factRecord),
  },
})

/** 校验一条 AtomicFact 是否为可持久化形状（非法即抛）。 */
export function toFactRecord(fact: AtomicFact): FactRecord {
  const parsed = factRecord.parse(fact)
  return parsed as FactRecord
}

/** 兼容：把存储上的记录还原为模型类型（类型层面一致，JSON 直通）。 */
export function fromFactRecord(record: FactRecord): AtomicFact {
  return record as unknown as AtomicFact
}

export type { FactStatus }
