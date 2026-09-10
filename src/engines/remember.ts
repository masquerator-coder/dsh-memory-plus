/**
 * Remember Engine（纯逻辑）：抽取 → 验证 → 存储 → 关联与冲突消解。
 *
 * 设计原则（框架设计 §6.3）：主会话 LLM 不做抽取，抽取永远由独立 LLM 调用完成。
 * 本引擎是可注入依赖的纯逻辑实现：
 *  - extractor：把原始内容拆为候选原子事实（后台独立 LLM，见 Host 半 ctx.llm.stream）
 *  - store / vector：存储与向量索引
 *  - validate：程序化验证（含可选的 LLM 自包含检查）
 *
 * example/ 用 mock extractor 跑通最小闭环；Host 半注入真实实现。
 */

import type { AtomicFact, AtomicFactInput } from '../model/fact.js'
import { nextFactId } from '../model/fact.js'
import { computeSemanticKey } from '../model/semantic-key.js'
import { validateWithChecks, type ValidatorDeps } from '../model/validator.js'
import type { MemoryStore, VectorIndex } from '../storage/store.js'

/** 冲突解决策略（Policy 驱动，默认 latest_wins）。 */
export type ConflictResolution = 'latest_wins' | 'mark_conflict' | 'confidence_based'

/** 抽取器接口：把文本拆为候选原子事实（不强制原子，由验证层把关）。 */
export interface Extractor {
  extract(content: string, scope: string): Promise<AtomicFactInput[]>
}

export interface RememberOptions {
  store: MemoryStore
  vector?: VectorIndex
  deps?: ValidatorDeps
  conflict?: ConflictResolution
  /** 用户编辑来源的 credibility，冲突时永远胜出。 */
  onRemember?: (fact: AtomicFact) => Promise<void>
}

export interface RememberResult {
  created: AtomicFact[]
  updates: AtomicFact[]
}

/**
 * 记住一批事实（引擎主入口）。对每条候选：
 *  1. 验证（三元组完整 / 粒度 / 自包含）
 *  2. 语义键去重 → 冲突消解（supersede 或并存）
 *  3. 写入存储 + 索引向量
 */
export async function rememberMany(
  candidates: AtomicFactInput[],
  opts: RememberOptions,
): Promise<RememberResult> {
  const created: AtomicFact[] = []
  const updates: AtomicFact[] = []

  for (const candidate of candidates) {
    const validated = await validateWithChecks(candidate, opts.deps)
    if (!validated.ok) {
      // 三元组不完整 → 丢弃（真实实现可标记为待人工审核）
      continue
    }
    const input = validated.fact
    const key = computeSemanticKey(input)

    const existing = await opts.store.findActiveBySemanticKey(key, input.scope)
    if (existing) {
      const resolved = resolveConflict(input, existing, opts.conflict ?? 'latest_wins')
      if (resolved) {
        const next = buildFact(input, { supersedes: existing.id, version: existing.version + 1 })
        const store = await opts.store.put(next)
        // 旧事实标记为 superseded
        await opts.store.put({ ...existing, status: 'superseded', updated_at: new Date().toISOString() })
        updates.push(store)
        created.push(store)
      }
    } else {
      const fact = buildFact(input, { version: 1 })
      const st = await opts.store.put(fact)
      created.push(st)
    }

    // 索引向量（若提供）
    if (opts.vector && created.length > 0) {
      for (const f of created) await opts.vector.index(f)
    }
  }

  for (const f of created) await opts.onRemember?.(f)
  return { created, updates }
}

/** 构造一条完整事实（填派生字段）。 */
export function buildFact(
  input: AtomicFactInput,
  meta: { version: number; supersedes?: string },
): AtomicFact {
  const now = new Date().toISOString()
  return {
    id: nextFactId(),
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    qualifiers: input.qualifiers,
    content: input.content,
    type: input.type,
    scope: input.scope,
    source: input.source,
    confidence: input.confidence,
    version: meta.version,
    ...(meta.supersedes ? { supersedes: meta.supersedes } : {}),
    semantic_key: computeSemanticKey(input),
    status: 'active',
    privacy: input.privacy ?? 'private',
    ttl: input.ttl,
    embedding: input.embedding,
    entities: input.entities,
    tags: input.tags,
    episodic: input.episodic,
    procedural: input.procedural,
    created_at: now,
    updated_at: now,
  }
}

/** 冲突消解：决定是否用新事实 supersede 旧事实。 */
function resolveConflict(
  input: AtomicFactInput,
  existing: AtomicFact,
  strategy: ConflictResolution,
): boolean {
  switch (strategy) {
    case 'latest_wins':
      return true // 最新写入优先（个人助理默认）
    case 'confidence_based': {
      const newScore = input.confidence
      const oldScore = existing.confidence * (existing.source.credibility || 1)
      const newScoreWeighted = input.confidence * (input.source.credibility || 1)
      return newScoreWeighted > oldScore
    }
    case 'mark_conflict':
    default:
      // 研究 Agent 默认：标记冲突，不覆盖（由后续 consolidate 处理）
      return false
  }
}
