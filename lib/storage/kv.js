/**
 * DSH 存储封装：用 ctx.storageDomain 的 KvTable 实现 MemoryStore 窄接口。
 *
 * 打开 `memoryDomainSpec`，`facts` 表按 id 存 AtomicFact；所有写都走领域写链
 * （backend 先持久化再改内存再发事件），读同步来自内存。get/list 包装成异步接口
 * 以贴合 MemoryStore。
 * @module @dsh/dsh-memory/storage/kv
 */
import { memoryDomainSpec, toFactRecord, fromFactRecord } from './spec.js';
export class DshStore {
    ctx;
    domain;
    facts;
    constructor(ctx) {
        this.ctx = ctx;
    }
    /** 惰性打开领域（首次经 ctx.storageDomain.open），并由 ctx.effect 托管关闭。 */
    async open() {
        if (this.facts)
            return this.facts;
        const domain = await this.ctx.storageDomain.open(memoryDomainSpec);
        this.ctx.effect(() => () => { void domain.close(); }, 'dsh-memory.storage.domainClose');
        this.domain = domain;
        this.facts = domain.table('facts');
        return this.facts;
    }
    async put(fact) {
        const table = await this.open();
        await table.put(fact.id, toFactRecord(fact));
        return fact;
    }
    async get(id) {
        const table = await this.open();
        const record = table.get(id);
        return record ? fromFactRecord(record) : undefined;
    }
    async list(filter = {}) {
        const table = await this.open();
        const items = [];
        for (const [, record] of table.entries()) {
            const fact = fromFactRecord(record);
            if (filter.type && fact.type !== filter.type)
                continue;
            if (filter.scope && fact.scope !== filter.scope)
                continue;
            if (filter.status && fact.status !== filter.status)
                continue;
            if (filter.semanticKey && fact.semantic_key !== filter.semanticKey)
                continue;
            if (filter.search && !fact.content.toLowerCase().includes(filter.search.toLowerCase()))
                continue;
            items.push(fact);
        }
        return items;
    }
    async delete(id) {
        const table = await this.open();
        return table.delete(id);
    }
    async findActiveBySemanticKey(semanticKey, scope) {
        const items = await this.list({ semanticKey, scope, status: 'active' });
        return items[0];
    }
    async listVersions(semanticKey, scope) {
        const items = await this.list({ semanticKey, scope });
        return items.sort((a, b) => a.version - b.version);
    }
    async close() {
        if (this.domain) {
            await this.domain.close();
            this.domain = undefined;
            this.facts = undefined;
        }
    }
}
//# sourceMappingURL=kv.js.map