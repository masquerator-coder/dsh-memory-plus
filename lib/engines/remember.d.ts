/**
 * Remember Engine（纯逻辑）：抽取 → 验证 → 存储 → 关联与冲突消解。
 *
 * 设计原则（框架设计 §6.3）：主会话 LLM 不做抽取，抽取永远由独立 LLM 调用完成。
 * 本引擎是可注入依赖的纯逻辑实现：
 *  - extractor：把原始内容拆为候选原子事实（后台独立 LLM，见 Host 半 ctx.llm.stream）
 *  - store / vector：存储与向量索引
 *  - validate：程序化验证（含可选的 LLM 自包含检查）
 *
 * example/ 用 mock extractor 跑通最小闭环；Host 半注入真实实现。
 */
import type { AtomicFact, AtomicFactInput } from '../model/fact.js';
import { type ValidatorDeps } from '../model/validator.js';
import type { MemoryStore, VectorIndex } from '../storage/store.js';
/** 冲突解决策略（Policy 驱动，默认 latest_wins）。 */
export type ConflictResolution = 'latest_wins' | 'mark_conflict' | 'confidence_based';
/** 抽取器接口：把文本拆为候选原子事实（不强制原子，由验证层把关）。 */
export interface Extractor {
    extract(content: string, scope: string): Promise<AtomicFactInput[]>;
}
export interface RememberOptions {
    store: MemoryStore;
    vector?: VectorIndex;
    deps?: ValidatorDeps;
    conflict?: ConflictResolution;
    /** 用户编辑来源的 credibility，冲突时永远胜出。 */
    onRemember?: (fact: AtomicFact) => Promise<void>;
}
export interface RememberResult {
    created: AtomicFact[];
    updates: AtomicFact[];
}
/**
 * 记住一批事实（引擎主入口）。对每条候选：
 *  1. 验证（三元组完整 / 粒度 / 自包含）
 *  2. 语义键去重 → 冲突消解（supersede 或并存）
 *  3. 写入存储 + 索引向量
 */
export declare function rememberMany(candidates: AtomicFactInput[], opts: RememberOptions): Promise<RememberResult>;
/** 构造一条完整事实（填派生字段）。 */
export declare function buildFact(input: AtomicFactInput, meta: {
    version: number;
    supersedes?: string;
}): AtomicFact;
//# sourceMappingURL=remember.d.ts.map