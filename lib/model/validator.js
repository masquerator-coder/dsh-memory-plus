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
import { computeSemanticKey } from './semantic-key.js';
const MULTI_ENTITY_RE = /[、，,和及以及与]/g;
/** 校验单条待入库事实。 */
export function validateFact(input) {
    const errors = [];
    const warnings = [];
    // 1. 三元组完整性
    const s = input.subject;
    if (!s || typeof s.type !== 'string' || s.type.length === 0)
        errors.push('subject.type 缺失');
    if (!s || typeof s.id !== 'string' || s.id.length === 0)
        errors.push('subject.id 缺失');
    if (typeof input.predicate !== 'string' || input.predicate.length === 0)
        errors.push('predicate 缺失');
    const o = input.object;
    if (!o || typeof o.type !== 'string' || o.type.length === 0)
        errors.push('object.type 缺失');
    if (!o || typeof o.id !== 'string' || o.id.length === 0)
        errors.push('object.id 缺失');
    if (typeof input.content !== 'string' || input.content.trim().length === 0) {
        errors.push('content 缺失（自包含自然语言表述是注入 Prompt 的唯一文本）');
    }
    // 2. 置信度 / 可信度范围
    if (typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 1) {
        errors.push('confidence 必须落在 [0,1]');
    }
    if (typeof input.source?.credibility !== 'number' || input.source.credibility < 0 || input.source.credibility > 1) {
        errors.push('source.credibility 必须落在 [0,1]');
    }
    if (errors.length > 0)
        return { ok: false, errors, fact: input };
    // 3. 粒度异常（object 含多实体，通常说明该拆成多条）
    if (o && typeof o.name === 'string' && o.name.length > 0 && MULTI_ENTITY_RE.test(o.name)) {
        warnings.push(`object.name 可能含多个实体：「${o.name}」，应考虑拆分（一个谓词一个事实）`);
    }
    // object.id 含多个分隔符也提示
    if (o && typeof o.id === 'string' && MULTI_ENTITY_RE.test(o.id)) {
        warnings.push(`object.id 疑似含多实体：「${o.id}」`);
    }
    return { ok: true, fact: input, warnings };
}
/**
 * 完整校验流水线。出错返回 {ok:false}；粒度/自包含问题返回 warnings（由上层决定处置）。
 */
export async function validateWithChecks(input, deps = {}) {
    const base = validateFact(input);
    if (!base.ok)
        return base;
    const warnings = [...base.warnings];
    if (deps.selfContainment) {
        const check = await deps.selfContainment(input.content);
        if (!check.selfContained) {
            warnings.push(`自包含性不通过：${check.reason ?? '脱离上下文无法理解，应补充上下文或重抽'}`);
        }
    }
    return { ok: true, fact: input, warnings };
}
/** 语义键去重：给定已有事实的语义键集合，判断 input 是否重复。 */
export function dedupeCheck(input, existingKeys) {
    const key = computeSemanticKey(input);
    if (existingKeys.has(key))
        return { duplicate: true, existingKey: key };
    return { duplicate: false };
}
/**
 * 独立更新测试：修改该事实是否只影响自身（supersede 只命中小于等于目标版本的一条）。
 * 返回受影响事实列表（应恰为改口前的那一条）。
 */
export function independentUpdateCheck(target, all) {
    return all.filter((f) => f.semantic_key === target.semantic_key).length;
}
/** 独立遗忘测试：删除该事实是否精确无副作用（只匹配目标 id 一条）。 */
export function independentForgetCheck(target, all) {
    return all.filter((f) => f.id === target.id).length;
}
//# sourceMappingURL=validator.js.map