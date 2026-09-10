/**
 * MemoryService（纯逻辑组合层）。
 *
 * 把 Extractor / Store / VectorIndex / Graph / Policy 组装成对外 API：
 *  - remember(input)：抽取候选 → Remember Engine
 *  - recall(query)：Recall Engine
 *  - forget(id, mode)：删除或归档
 *
 * Host 半的 DSH 版本（src/index.ts）在这层包一层 ctx 服务注册与事件注入，
 * 但业务逻辑复用它，避免在端点里重复实现。
 */
import type { AtomicFact, AtomicFactInput } from './model/fact.js';
import type { Extractor } from './engines/remember.js';
import type { RecallQuery } from './engines/recall.js';
import type { MemoryStore, VectorIndex } from './storage/store.js';
import type { GraphIndex, RankingWeights } from './engines/recall.js';
import type { ValidatorDeps } from './model/validator.js';
export interface MemoryServiceDeps {
    store: MemoryStore;
    vector: VectorIndex;
    extractor: Extractor;
    graph?: GraphIndex;
    deps?: ValidatorDeps;
    weights?: Partial<RankingWeights>;
}
export declare class MemoryService {
    private deps;
    constructor(deps: MemoryServiceDeps);
    /** 显式 / 隐式记忆入口：抽取 → 验证 → 存储 → 关联。 */
    remember(input: {
        content: string;
        scope: string;
        source: AtomicFactInput['source'];
    }): Promise<AtomicFact[]>;
    /** 检索相关记忆（向量 + 图扩展 + 策略排序）。 */
    recall(query: RecallQuery): Promise<AtomicFact[]>;
    /** 删除或归档一条事实。 mode: 'delete' 硬删；'archive' 标记 archived。 */
    forget(id: string, mode?: 'delete' | 'archive'): Promise<boolean>;
}
//# sourceMappingURL=service.d.ts.map