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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** 抽取 LLM 路由设置命名空间（settings 限制小写连字符标识）。 */
export declare const MEMORY_SETTINGS_NAMESPACE = "dsh-memory";
/** 抽取路由模式：复用主会话配置的默认路由，或独立配置。 */
export type RouteMode = 'reuse' | 'independent';
/** routeMode 的可选值（schemastery union）。 */
export declare const ROUTE_MODES: readonly ["reuse", "independent"];
/** 默认抽取路由模式（保持既有独立配置行为为默认）。 */
export declare const DEFAULT_ROUTE_MODE: RouteMode;
/** 抽取路由与参数设置的持久化形状。 */
export interface MemorySettings {
    /** 路由模式：`reuse` 复用主会话默认路由，`independent` 用下方独立 provider/model。 */
    readonly routeMode: RouteMode;
    /** 独立模式下的抽取 LLM provider；空串表示未配置（回退默认）。 */
    readonly provider: string;
    /** 独立模式下的抽取 LLM model id；空串表示未配置。 */
    readonly model: string;
    /** 抽取调用输出 token 上限。 */
    readonly extractionMaxTokens: number;
}
/** 持久化 schema（schemastery）。 */
export declare const MemorySettingsSchema: z<MemorySettings>;
/** 默认抽取路由（未配置 / settings 服务不可用时回退）。 */
export declare const DEFAULT_EXTRACTION_PROVIDER = "deepseek";
export declare const DEFAULT_EXTRACTION_MODEL = "deepseek-v4-flash";
/**
 * 读取当前抽取配置（settings 服务可选，缺失时回退默认）。返回的 provider/model
 * 可能为空串，调用方需用 `DEFAULT_EXTRACTION_PROVIDER/MODEL` 兜底。
 */
export declare function readMemorySettings(ctx: Context): MemorySettings;
//# sourceMappingURL=settings.d.ts.map