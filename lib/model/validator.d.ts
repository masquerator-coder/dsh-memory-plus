/**
 * 程序化验证（Validator）。
 *
 * 对抽取结果做纯函数校验：
 *  - 三元组完整性（subject/predicate/object 齐全）
 *  - 粒度异常检测（object 含多实体 / content 含多谓词）
 *  - 置信度与来源可信度范围
 * 自包含性检查是 LLM 判断，接口留出（见 SelfContainmentChecker）。
 *
 * 另实现框架设计中的「三条工程化检验」：独立检索 / 独立更新 / 独立遗忘，
 * 用于原子性合规评估。
 */
import type { AtomicFactInput } from './fact.js';
export type ValidationResult = {
    ok: true;
    fact: AtomicFactInput;
    warnings: string[];
} | {
    ok: false;
    errors: string[];
    fact?: AtomicFactInput;
};
/** 校验单条待入库事实。 */
export declare function validateFact(input: AtomicFactInput): ValidationResult;
/** 自包含性检查器接口：脱离对话上下文能否被独立理解。由后台调用独立 LLM 实现。 */
export interface SelfContainmentChecker {
    (content: string): Promise<{
        selfContained: boolean;
        reason?: string;
    }>;
}
/** 一组可注入的检查器（验证层插槽）。 */
export interface ValidatorDeps {
    /** 自包含性检查（可缺省，缺省跳过）。 */
    selfContainment?: SelfContainmentChecker;
}
/**
 * 完整校验流水线。出错返回 {ok:false}；粒度/自包含问题返回 warnings（由上层决定处置）。
 */
export declare function validateWithChecks(input: AtomicFactInput, deps?: ValidatorDeps): Promise<ValidationResult>;
/** 语义键去重：给定已有事实的语义键集合，判断 input 是否重复。 */
export declare function dedupeCheck(input: AtomicFactInput, existingKeys: ReadonlySet<string>): {
    duplicate: boolean;
    existingKey?: string;
};
/**
 * 独立更新测试：修改该事实是否只影响自身（supersede 只命中小于等于目标版本的一条）。
 * 返回受影响事实列表（应恰为改口前的那一条）。
 */
export declare function independentUpdateCheck(target: {
    semantic_key: string;
}, all: Array<{
    semantic_key: string;
}>): number;
/** 独立遗忘测试：删除该事实是否精确无副作用（只匹配目标 id 一条）。 */
export declare function independentForgetCheck(target: {
    id: string;
}, all: Array<{
    id: string;
}>): number;
//# sourceMappingURL=validator.d.ts.map