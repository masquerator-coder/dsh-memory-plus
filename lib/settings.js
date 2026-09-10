/**
 * 记忆系统设置（DSH settings 命名空间）。
 *
 * DSH 的 settings 服务用「schemastery」schema（注意：不是 zod——zod 仅用于
 * storage-domain 的持久化形状）。我们注册一个 `dsh-memory` 命名空间，让用户在
 * DSH 设置里配置抽取用的真实 provider/model，未配置时回退到占位默认值。
 *
 * schemastery 没有 `.optional()`：provider/model 用 `.default('')`，空串视为「未配置」。
 *
 * 读取：`ctx.get('settings').get('dsh-memory')` 返回合并后的分区（默认 + 用户覆盖）。
 * @module @dsh/dsh-memory/settings
 */
import z from '@deepseek-ai/schemastery';
/** 抽取 LLM 路由设置命名空间（settings 限制小写连字符标识）。 */
export const MEMORY_SETTINGS_NAMESPACE = 'dsh-memory';
/** routeMode 的可选值（schemastery union）。 */
export const ROUTE_MODES = ['reuse', 'independent'];
/** 默认抽取路由模式（保持既有独立配置行为为默认）。 */
export const DEFAULT_ROUTE_MODE = 'independent';
/** 空串哨兵：用户未配置 provider/model。 */
const UNSET = '';
/** 持久化 schema（schemastery）。 */
export const MemorySettingsSchema = z.object({
    routeMode: z.union([...ROUTE_MODES]).default(DEFAULT_ROUTE_MODE),
    provider: z.string().default(UNSET),
    model: z.string().default(UNSET),
    extractionMaxTokens: z.number().step(1).min(16).default(1024),
});
/** 默认抽取路由（未配置 / settings 服务不可用时回退）。 */
export const DEFAULT_EXTRACTION_PROVIDER = 'deepseek';
export const DEFAULT_EXTRACTION_MODEL = 'deepseek-v4-flash';
/** settings 服务不可用时的最小回退。 */
const FALLBACK = {
    routeMode: DEFAULT_ROUTE_MODE,
    provider: UNSET,
    model: UNSET,
    extractionMaxTokens: 1024,
};
/**
 * 读取当前抽取配置（settings 服务可选，缺失时回退默认）。返回的 provider/model
 * 可能为空串，调用方需用 `DEFAULT_EXTRACTION_PROVIDER/MODEL` 兜底。
 */
export function readMemorySettings(ctx) {
    const settings = ctx.get('settings');
    if (settings === undefined)
        return FALLBACK;
    const section = settings.get(MEMORY_SETTINGS_NAMESPACE);
    if (section === undefined)
        return FALLBACK;
    return { ...FALLBACK, ...section };
}
//# sourceMappingURL=settings.js.map