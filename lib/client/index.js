/**
 * Browser 半入口：把「记忆」设置分区注入 DSH 设置页，并把「抽取路由」配置
 * （复用主会话默认路由 / 独立 provider+model）通过 `ctx.settingsScope` 读写底层
 * settings 的 `dsh-memory` 命名空间。
 *
 * 需在 DSH workspace 内构建（依赖 dsh-client-ui-slots / dsh-client-ui-settings /
 * dsh-client-locale / dsh-api-remotes 的浏览器侧类型）。
 */
import { MemorySettingsSection } from "./MemorySettingsSection.js";
import { zh, en } from "./locales.js";
export const inject = ['slots', 'locale', 'remote', 'settingsScope'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('memory', { zh, en }), 'dsh-memory: dictionaries');
    // 绑定抽取路由命名空间：getSnapshot().value 是解析后的分区（含默认值）。
    const routeScope = ctx.settingsScope.bind({ namespace: 'dsh-memory' });
    const settingsFace = {
        get: () => routeScope.getSnapshot().value,
        set: (field, value) => routeScope.set(field, value),
        unset: (field) => routeScope.unset(field),
        subscribe: (cb) => routeScope.subscribe(cb),
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'memory',
        order: 50,
        label: () => '记忆',
        locale: 'memory',
        inject: () => ({
            hooks: {
                stats: ctx.remote.$host ? undefined : undefined,
                facts: undefined,
            },
            onToggle: (v) => ctx.remote.memory.toggle(v),
            onSearch: (q) => { void q; },
            settings: settingsFace,
        }),
    }, MemorySettingsSection));
}
//# sourceMappingURL=index.js.map