/**
 * 原子事实模型（Atomic Fact Model）
 *
 * 这是记忆系统的数据契约：一切记忆最终都降解为原子事实。
 * 本模块为「纯 TypeScript 核心」，不依赖任何 DSH 运行时 API，
 * 因此可以独立编译验证（`pnpm typecheck:model`）与单元测试。
 */

/** 记忆类型。type 决定检索来源、遗忘策略、排序权重。 */
export type FactType = 'semantic' | 'episodic' | 'procedural'

/** 生命周期状态。 */
export type FactStatus = 'active' | 'superseded' | 'archived' | 'disputed' | 'expired'

/** 隐私等级。 */
export type FactPrivacy = 'private' | 'project' | 'org' | 'public'

/** 来源类型。 */
export type SourceType = 'conversation' | 'user_edit' | 'document' | 'llm_inference'

/** 结构化断言的三元组：subject - predicate -> object。 */
export interface SpsObject {
  /** 主体类型，如 user / project / agent。 */
  type: string
  /** 主体业务 id，如 user:alice。 */
  id: string
  /** 主体展示名。 */
  name?: string
}

/** 限定条件（qualifiers），防止过度泛化，让一条事实可粗可细。 */
export interface Qualifiers {
  /** 生效时间窗口。 */
  time?: { valid_from?: string; valid_to?: string | null }
  /** 地点。 */
  location?: string
  /** 场景上下文。 */
  context?: string
  /** 附加条件。 */
  condition?: string
  [key: string]: unknown
}

/** 来源溯源。研究 Agent 刚需，个人助理用于判断可信度。 */
export interface FactSource {
  type: SourceType
  /** 来源 URI，DSH 中可指向 SessionEvent 日志坐标 session:<id>#<seq>。 */
  uri: string
  /** 抽取者，如 llm:deepseek-v3 / user_edit。 */
  extracted_by: string
  /** 来源本身可信度：用户亲口说 > LLM 推断 > 外部文档。 */
  credibility: number
}

/** 情景记忆扩展字段。 */
export interface EpisodicExt {
  event_time: string
  participants: string[]
  outcome: string
  duration?: string
  artifacts?: string[]
}

/** 程序记忆扩展字段。 */
export interface ProceduralExt {
  steps: string[]
  preconditions: string[]
  tool_chain: string[]
  success_rate: number
}

/** 一条原子事实。 */
export interface AtomicFact {
  id: string
  subject: SpsObject
  predicate: string
  object: SpsObject
  qualifiers?: Qualifiers
  /** 自然语言表述，直接注入 Prompt，LLM 可直接消费。 */
  content: string
  type: FactType
  /** 业务隔离边界：user:alice / project:x / agent:soul。 */
  scope: string
  source: FactSource
  /** 这条事实为真的概率（0-1），与 source.credibility 分离。 */
  confidence: number
  /** 版本号，改口是演进而非删除。 */
  version: number
  /** 被本事实取代的旧事实 id。 */
  supersedes?: string
  /** 语义键：判断「是否同一条」的去重标识。 */
  semantic_key: string
  status: FactStatus
  privacy: FactPrivacy
  /** 过期策略（强化遗忘 vs 弱遗忘的配置入口）。 */
  ttl?: string
  /** content 的 embedding 向量（DSH 无内置向量库，由 VectorIndex 生成/存储）。 */
  embedding?: number[]
  /** 关联实体 id 列表。 */
  entities?: string[]
  tags?: string[]
  /** 情景扩展（type=episodic 时）。 */
  episodic?: EpisodicExt
  /** 程序扩展（type=procedural 时）。 */
  procedural?: ProceduralExt
  /** 创建时间（ISO）。 */
  created_at: string
  /** 最后更新时间（ISO）。 */
  updated_at: string
}

/** 用于提取/输入构造事实的宽松输入（无需 id/semantic_key/status 等派生字段）。 */
export type AtomicFactInput = Omit<
  AtomicFact,
  'id' | 'semantic_key' | 'status' | 'version' | 'created_at' | 'updated_at'
>

/** 当前事实的简版视图（供 UI 列表展示）。 */
export interface FactSummary {
  id: string
  content: string
  type: FactType
  confidence: number
  scope: string
  status: FactStatus
  version: number
  updated_at: string
}

/** 生成一个新的 id。 */
export function nextFactId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `fact_${Date.now().toString(36)}${rand}`
}
