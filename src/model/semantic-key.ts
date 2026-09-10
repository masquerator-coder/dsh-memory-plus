/**
 * 语义键（semantic key）与去重。
 *
 * 规则（来自框架设计）：
 *   semantic_key = hash(subject.id + predicate + object.id + qualifier_signature)
 * 其中 qualifier_signature 是对 qualifiers 规范化（排序后哈希）的摘要。
 *
 * 两条事实 semantic_key 相同 → 视为同一断言的不同版本或不同来源。
 * 冲突消解按 confidence / source.credibility / event_time 决定保留哪条。
 * 本模块为纯 TypeScript 核心，可独立编译验证。
 */

import type { AtomicFactInput, Qualifiers } from './fact.js'

/** 稳定、跨平台一致的字符串哈希（FNV-1a 64-bit 截断为 32 hex）。 */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 递归规范化一个值：数组排序、对象按键排序，保证相同逻辑内容得到相同签名。 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).sort().join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
    return `{${entries.join(',')}}`
  }
  return String(value)
}

const QUALIFIER_KEYS = ['time', 'location', 'context', 'condition'] as const

/** 从 qualifiers 中提取参与语义键的规范化签名。 */
export function qualifierSignature(qualifiers: Qualifiers | undefined): string {
  if (!qualifiers) return ''
  const picked: Record<string, unknown> = {}
  for (const key of QUALIFIER_KEYS) {
    const v = (qualifiers as Record<string, unknown>)[key]
    if (v !== undefined && v !== null) picked[key] = v
  }
  return canonicalize(picked)
}

/** 计算一条原子事实输入的 semantic_key。 */
export function computeSemanticKey(fact: Pick<AtomicFactInput, 'subject' | 'predicate' | 'object' | 'qualifiers'>): string {
  return fnv1a(
    `${fact.subject.id}|${fact.predicate}|${fact.object.id}|${qualifierSignature(fact.qualifiers)}`,
  )
}

/**
 * 判断 candidate 是否与 existing 语义相同（同一断言的不同版本/来源）。
 * 避免 "Alice 喜欢素食" 和 "Alice 偏好素食" 被当成两条不同事实——前提是二者
 * 在抽取时被归一为相同的 subject.id/predicate/object.id。
 */
export function isSameAssertion(a: AtomicFactInput, b: AtomicFactInput): boolean {
  return computeSemanticKey(a) === computeSemanticKey(b)
}
