/**
 * 自建向量索引（VectorIndex）——方案 A（个人助理规模）。
 *
 * DSH 无内置 embedding/向量库：embedding 直接存在 `facts` 表记录里（AtomicFact.embedding），
 * 这里在内存做进程内余弦相似度检索，按 scope 过滤。`index`/`remove` 不再需要单独的表，
 * 因为 embedding 随事实记录一起持久化；`search` 从存储读取 active 事实后打分取 topK。
 * @module @dsh/dsh-memory/storage/vector
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AtomicFact } from '../model/fact.js';
import type { VectorIndex } from './store.js';
export declare class DshVectorIndex implements VectorIndex {
    private store;
    constructor(_ctx: Context);
    /** embedding 已随记录持久化；`index` 作为幂等 no-op（保留接口形态）。 */
    index(_fact: AtomicFact): Promise<void>;
    search(queryEmbedding: number[], topK: number, scope?: string): Promise<AtomicFact[]>;
    remove(factId: string): Promise<void>;
}
//# sourceMappingURL=vector.d.ts.map