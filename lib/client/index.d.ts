/**
 * Browser 半入口：把「记忆」设置分区注入 DSH 设置页，并把「抽取路由」配置
 * （复用主会话默认路由 / 独立 provider+model）通过 `ctx.settingsScope` 读写底层
 * settings 的 `dsh-memory` 命名空间。
 *
 * 需在 DSH workspace 内构建（依赖 dsh-client-ui-slots / dsh-client-ui-settings /
 * dsh-client-locale / dsh-api-remotes 的浏览器侧类型）。
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const inject: string[];
/** 抽取路由配置的浏览器侧形状（与 host `dsh-memory` 命名空间字段对齐）。 */
export interface MemoryRouteSettings {
    readonly routeMode: 'reuse' | 'independent';
    readonly provider: string;
    readonly model: string;
}
/** 浏览器侧对 `dsh-memory` 设置的读写/订阅面（经 ctx.settingsScope）。 */
export interface MemorySettingsFace {
    /** 当前同步值；命名空间尚未就绪时返回 undefined。 */
    get(): MemoryRouteSettings | undefined;
    /** 写一个字段（routeMode/provider/model）。 */
    set(field: 'routeMode' | 'provider' | 'model', value: string): Promise<void>;
    /** 清除 provider/model（恢复默认）。 */
    unset(field: 'provider' | 'model'): Promise<void>;
    /** 订阅快照变化，返回取消器。 */
    subscribe(cb: () => void): () => void;
}
export interface MemorySectionInjected {
    hooks: {
        stats?: unknown;
        facts?: unknown;
    };
    onToggle(v: boolean): Promise<unknown>;
    onSearch(q: string): void;
    settings: MemorySettingsFace;
}
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map