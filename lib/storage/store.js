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
/** 内存实现：也是 example 的默认存储与测试替身。 */
export class InMemoryStore {
    facts = new Map();
    async put(fact) {
        this.facts.set(fact.id, fact);
        return fact;
    }
    async get(id) {
        return this.facts.get(id);
    }
    async list(filter = {}) {
        let items = [...this.facts.values()];
        if (filter.type)
            items = items.filter((f) => f.type === filter.type);
        if (filter.scope)
            items = items.filter((f) => f.scope === filter.scope);
        if (filter.status)
            items = items.filter((f) => f.status === filter.status);
        if (filter.semanticKey)
            items = items.filter((f) => f.semantic_key === filter.semanticKey);
        if (filter.search) {
            const q = filter.search.toLowerCase();
            items = items.filter((f) => f.content.toLowerCase().includes(q));
        }
        return items;
    }
    async delete(id) {
        return this.facts.delete(id);
    }
    async findActiveBySemanticKey(semanticKey, scope) {
        for (const f of this.facts.values()) {
            if (f.semantic_key === semanticKey && f.scope === scope && f.status === 'active')
                return f;
        }
        return undefined;
    }
    async listVersions(semanticKey, scope) {
        return [...this.facts.values()]
            .filter((f) => f.semantic_key === semanticKey && f.scope === scope)
            .sort((a, b) => a.version - b.version);
    }
    async close() {
        this.facts.clear();
    }
}
/** 内存向量实现：进程内余弦相似度（个人助理规模的默认方案 A）。 */
export class InMemoryVectorIndex {
    entries = new Map();
    async index(fact) {
        this.entries.set(fact.id, fact);
    }
    async search(query, topK, scope) {
        const scored = [];
        for (const fact of this.entries.values()) {
            if (scope && fact.scope !== scope)
                continue;
            if (!fact.embedding || fact.status !== 'active' || expired(fact))
                continue;
            scored.push({ fact, score: cosine(query, fact.embedding) });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).map((s) => s.fact);
    }
    async remove(factId) {
        this.entries.delete(factId);
    }
}
export function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
/** TTL 过期判断（弱遗忘）：active 且未过 valid_to / ttl。 */
export function expired(fact) {
    const to = fact.qualifiers?.time?.valid_to;
    if (to)
        return Date.parse(to) <= Date.now();
    if (fact.ttl && fact.created_at) {
        const deadline = Date.parse(fact.created_at) + parseTtlMs(fact.ttl);
        if (Number.isFinite(deadline))
            return deadline <= Date.now();
    }
    return false;
}
export function parseTtlMs(ttl) {
    const m = /^(\d+)(d|h|m|s)$/.exec(ttl);
    if (!m)
        return 0;
    const n = Number(m[1]);
    switch (m[2]) {
        case 'd': return n * 86_400_000;
        case 'h': return n * 3_600_000;
        case 'm': return n * 60_000;
        case 's': return n * 1000;
        default: return 0;
    }
}
//# sourceMappingURL=store.js.map