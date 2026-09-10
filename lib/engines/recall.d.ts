/**
 * Recall Engine（纯逻辑）：向量召回 → 过滤 → semantic_key 去重 → 图扩展 → 策略排序。
 *
 * 可注入依赖：store / vector / graph（关系边，可选）/ policy（排序权重）。
 */
import type { AtomicFact } from '../model/fact.js';
import type { MemoryStore, VectorIndex } from '../storage/store.js';
/** 关系边（自建图索引，见 storage/edges.ts 的纯逻辑版）。 */
export interface FactEdge {
    from: string;
    predicate: string;
    to: string;
}
/** 图扩展接口：给定种子实体，返回 1-2 跳相关的实体 id。 */
export interface GraphIndex {
    expand(seedEntities: string[], hops: number): Promise<string[]>;
}
export interface RecallQuery {
    query: string;
    queryEmbedding: number[];
    scope?: string;
    topK: number;
    graphHops?: number;
}
export interface RankingWeights {
    relevance: number;
    confidence: number;
    credibility: number;
    recency: number;
}
export interface RecallOptions {
    store: MemoryStore;
    vector: VectorIndex;
    graph?: GraphIndex;
    weights?: Partial<RankingWeights>;
}
/** 召回：返回按最终分数排序的 top-N 事实。 */
export declare function recall(q: RecallQuery, opts: RecallOptions): Promise<AtomicFact[]>;
//# sourceMappingURL=recall.d.ts.map