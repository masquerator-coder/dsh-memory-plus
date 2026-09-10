/**
 * DSH 存储封装：用 ctx.storageDomain 的 KvTable 实现 MemoryStore 窄接口。
 *
 * 打开 `memoryDomainSpec`，`facts` 表按 id 存 AtomicFact；所有写都走领域写链
 * （backend 先持久化再改内存再发事件），读同步来自内存。get/list 包装成异步接口
 * 以贴合 MemoryStore。
 * @module @dsh/dsh-memory/storage/kv
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryStore, FactFilter } from './store.js';
import type { AtomicFact } from '../model/fact.js';
export declare class DshStore implements MemoryStore {
    private ctx;
    private domain;
    private facts;
    constructor(ctx: Context);
    /** 惰性打开领域（首次经 ctx.storageDomain.open），并由 ctx.effect 托管关闭。 */
    private open;
    put(fact: AtomicFact): Promise<AtomicFact>;
    get(id: string): Promise<AtomicFact | undefined>;
    list(filter?: FactFilter): Promise<AtomicFact[]>;
    delete(id: string): Promise<boolean>;
    findActiveBySemanticKey(semanticKey: string, scope: string): Promise<AtomicFact | undefined>;
    listVersions(semanticKey: string, scope: string): Promise<AtomicFact[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=kv.d.ts.map