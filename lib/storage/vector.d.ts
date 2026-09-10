/**
 * 自建向量索引（VectorIndex）。
 *
 * DSH 无内置 embedding/向量库，本实现提供：
 *  - 方案 A（默认，个人助理）：embedding 存于 ctx.storageDomain，进程内余弦相似度检索
 *  - 方案 B：可插拔为外部向量后端（保留 VectorIndex 接口）
 *  - embedding 生成：经 ctx.llm.stream 调 embedding 能力（或外部 API），BlockAssembler 折叠
 *
 * 需在 DSH workspace 内构建。骨架给出接口与检索形态。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AtomicFact } from '../model/fact.js';
import type { VectorIndex } from './store.js';
export declare class DshVectorIndex implements VectorIndex {
    constructor(_ctx: Context);
    index(_fact: AtomicFact): Promise<void>;
    search(_queryEmbedding: number[], _topK: number, _scope?: string): Promise<AtomicFact[]>;
    remove(_factId: string): Promise<void>;
    /** 生成 query 的 embedding（真实实现经 ctx.llm.stream 调 embedding 能力）。 */
    embed(_text: string): Promise<number[]>;
}
//# sourceMappingURL=vector.d.ts.map