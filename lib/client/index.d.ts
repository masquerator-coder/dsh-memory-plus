/**
 * Browser 半入口：把「记忆」分区注入 DSH 设置页。
 *
 * 需在 DSH workspace 内构建（依赖 dsh-client-ui-slots / dsh-client-ui-settings /
 * dsh-client-locale / dsh-api-remotes 的浏览器侧类型）。
 *
 * 通过 ctx.slots.inject('settings.section', ...) 注册 id:'memory' 分区，
 * SettingsRoot 自动将其投影为设置页左侧导航行并在激活时渲染。
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export interface MemorySectionInjected {
    hooks: {
        stats?: unknown;
        facts?: unknown;
    };
    onToggle(v: boolean): Promise<unknown>;
    onSearch(q: string): void;
}
//# sourceMappingURL=index.d.ts.map