/**
 * DSH 存储封装：把 ctx.storageDomain 的 KvTable 适配成 MemoryStore 窄接口。
 *
 * 需在 DSH workspace 内构建（依赖 @deepseek-ai/dsh-storage-domain）。
 * 用 defineDomain(spec) 声明领域表（json/sqlite 后端），KvTable 提供 get/put/delete/list。
 *
 * 说明：这是骨架，给出字段与调用形态；真实实现需按 storage-domain 的领域表 API 精确对接。
 */
export class DshStore {
    constructor(_ctx) {
        // 真实实现：
        //   const domain = this.ctx.storageDomain.open(defineDomain({
        //     name: 'dsh-memory',
        //     table: (t) => ({
        //       facts: t.object<AtomicFact>().index('semantic_key').index('scope').index('status'),
        //       edges:  t.object<FactEdge>().index('from').index('to'),
        //     }),
        //   }))
        //   this.facts = domain.table('facts')
    }
    facts = {
        // placeholder — see comments above; wired in the real constructor
        get: async () => undefined,
    };
    async put(fact) {
        // this.facts.put(fact.id, fact)
        return fact;
    }
    async get(id) {
        return this.facts.get(id);
    }
    async list(_filter = {}) {
        // this.facts.entries 过滤
        return [];
    }
    async delete(_id) {
        // return this.facts.delete(id)
        return true;
    }
    async findActiveBySemanticKey(_semanticKey, _scope) {
        // 按 semantic_key+scope 索引查询
        return undefined;
    }
    async listVersions(_semanticKey, _scope) {
        return [];
    }
    async close() {
        // domain.close()
    }
}
//# sourceMappingURL=kv.js.map