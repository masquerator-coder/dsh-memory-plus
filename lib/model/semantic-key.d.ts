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
import type { AtomicFactInput, Qualifiers } from './fact.js';
/** 稳定、跨平台一致的字符串哈希（FNV-1a 64-bit 截断为 32 hex）。 */
export declare function fnv1a(str: string): string;
/** 递归规范化一个值：数组排序、对象按键排序，保证相同逻辑内容得到相同签名。 */
export declare function canonicalize(value: unknown): string;
/** 从 qualifiers 中提取参与语义键的规范化签名。 */
export declare function qualifierSignature(qualifiers: Qualifiers | undefined): string;
/** 计算一条原子事实输入的 semantic_key。 */
export declare function computeSemanticKey(fact: Pick<AtomicFactInput, 'subject' | 'predicate' | 'object' | 'qualifiers'>): string;
/**
 * 判断 candidate 是否与 existing 语义相同（同一断言的不同版本/来源）。
 * 避免 "Alice 喜欢素食" 和 "Alice 偏好素食" 被当成两条不同事实——前提是二者
 * 在抽取时被归一为相同的 subject.id/predicate/object.id。
 */
export declare function isSameAssertion(a: AtomicFactInput, b: AtomicFactInput): boolean;
//# sourceMappingURL=semantic-key.d.ts.map