/**
 * Consolidate Engine（纯逻辑）：后台整合与遗忘。
 *
 *  - 去重合并：semantic_key 相同保留最高 confidence，其余 status=archived
 *  - 冲突处理：按 Policy 标记 mark_conflict 的事实
 *  - 衰减：TTL 过期 → status=expired
 *  - 摘要压缩（占位）：细粒度事实聚合为高层摘要事实（保留溯源链接）
 */
import type { AtomicFact } from '../model/fact.js';
import type { MemoryStore } from '../storage/store.js';
export interface ConsolidateOptions {
    store: MemoryStore;
    scopes?: string[];
}
export interface ConsolidateStats {
    archived: number;
    expired: number;
    conflicted: number;
}
/** 运行一次整合：对每个 scope 内的 active 事实做去重、衰减、冲突标记。 */
export declare function consolidate(opts: ConsolidateOptions): Promise<ConsolidateStats>;
/**
 * 摘要压缩：把一组同 scope 的细粒度事实聚合为一条高层摘要事实。
 * 真实实现调用 ctx.llm.stream 归纳；此处保留接口与数据结构契约。
 */
export interface Abstractable {
    groupLabel: string;
    facts: AtomicFact[];
}
export interface Summarizer {
    summarize(group: Abstractable): Promise<{
        content: string;
        confidence: number;
    }>;
}
//# sourceMappingURL=consolidate.d.ts.map