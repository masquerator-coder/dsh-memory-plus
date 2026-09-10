/**
 * 记忆存储抽象（MemoryStore）。
 *
 * 引擎层只依赖这个窄接口，不依赖具体后端：
 *  - 进程内 mock（example/ 用它跑通最小闭环）
 *  - Host 半用 ctx.storageDomain 的 KvTable 实现本接口（见 src/storage/kv.ts）
 *  - 向量检索通过可选的 VectorIndex 接口注入
 *
 * 这是纯 TypeScript 类型契约，可独立编译验证。
 */
import type { AtomicFact, FactStatus, FactType } from '../model/fact.js';
/** 查询过滤器。 */
export interface FactFilter {
    type?: FactType;
    scope?: string;
    status?: FactStatus;
    semanticKey?: string;
    search?: string;
}
/** 记忆存储窄接口。 */
export interface MemoryStore {
    /** 写入/覆盖一条事实。返回存储后的事实。 */
    put(fact: AtomicFact): Promise<AtomicFact>;
    /** 按 id 读取。 */
    get(id: string): Promise<AtomicFact | undefined>;
    /** 按过滤器列出一批事实（简单实现，分页由上层处理）。 */
    list(filter?: FactFilter): Promise<AtomicFact[]>;
    /** 删除（或归档）一条事实。 */
    delete(id: string): Promise<boolean>;
    /** 按语义键找出当前 active 版本（用于去重/冲突消解）。 */
    findActiveBySemanticKey(semanticKey: string, scope: string): Promise<AtomicFact | undefined>;
    /** 列出某个 scope 下同一语义键的所有版本（用于 supersede 链）。 */
    listVersions(semanticKey: string, scope: string): Promise<AtomicFact[]>;
    /** 关闭存储。 */
    close(): Promise<void>;
}
/** 向量检索接口（自建，DSH 无内置向量库）。 */
export interface VectorIndex {
    /** 索引一条事实的 embedding。 */
    index(fact: AtomicFact): Promise<void>;
    /** 查询与 query 向量最相近的 topK 条事实。 */
    search(queryEmbedding: number[], topK: number, scope?: string): Promise<AtomicFact[]>;
    /** 移除索引。 */
    remove(factId: string): Promise<void>;
}
/** 内存实现：也是 example 的默认存储与测试替身。 */
export declare class InMemoryStore implements MemoryStore {
    private facts;
    put(fact: AtomicFact): Promise<AtomicFact>;
    get(id: string): Promise<AtomicFact | undefined>;
    list(filter?: FactFilter): Promise<AtomicFact[]>;
    delete(id: string): Promise<boolean>;
    findActiveBySemanticKey(semanticKey: string, scope: string): Promise<AtomicFact | undefined>;
    listVersions(semanticKey: string, scope: string): Promise<AtomicFact[]>;
    close(): Promise<void>;
}
/** 内存向量实现：进程内余弦相似度（个人助理规模的默认方案 A）。 */
export declare class InMemoryVectorIndex implements VectorIndex {
    private entries;
    index(fact: AtomicFact): Promise<void>;
    search(query: number[], topK: number, scope?: string): Promise<AtomicFact[]>;
    remove(factId: string): Promise<void>;
}
export declare function cosine(a: number[], b: number[]): number;
/** TTL 过期判断（弱遗忘）：active 且未过 valid_to / ttl。 */
export declare function expired(fact: AtomicFact): boolean;
export declare function parseTtlMs(ttl: string): number;
//# sourceMappingURL=store.d.ts.map