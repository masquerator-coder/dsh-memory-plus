/**
 * DSH 存储封装：把 ctx.storageDomain 的 KvTable 适配成 MemoryStore 窄接口。
 *
 * 需在 DSH workspace 内构建（依赖 @deepseek-ai/dsh-storage-domain）。
 * 用 defineDomain(spec) 声明领域表（json/sqlite 后端），KvTable 提供 get/put/delete/list。
 *
 * 说明：这是骨架，给出字段与调用形态；真实实现需按 storage-domain 的领域表 API 精确对接。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AtomicFact, AtomicFactInput, FactStatus } from '../model/fact.js';
import type { FactFilter, MemoryStore } from './store.js';
export declare class DshStore implements MemoryStore {
    constructor(_ctx: Context);
    private facts;
    put(fact: AtomicFact): Promise<AtomicFact>;
    get(id: string): Promise<AtomicFact | undefined>;
    list(_filter?: FactFilter): Promise<AtomicFact[]>;
    delete(_id: string): Promise<boolean>;
    findActiveBySemanticKey(_semanticKey: string, _scope: string): Promise<AtomicFact | undefined>;
    listVersions(_semanticKey: string, _scope: string): Promise<AtomicFact[]>;
    close(): Promise<void>;
}
/** Placeholder 类型（避免未使用告警）。 */
export type { AtomicFact, AtomicFactInput, FactStatus };
//# sourceMappingURL=kv.d.ts.map