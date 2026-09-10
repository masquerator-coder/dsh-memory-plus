import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 「记忆」设置分区容器（Browser 半组件）。
 *
 * 这里先落地「抽取路由」小节：复用主会话默认路由 / 独立配置 provider+model。
 * 通过注入的 `settings`（MemorySettingsFace，经 ctx.settingsScope）读写 `dsh-memory`
 * 命名空间，用 useSyncExternalStore 订阅其快照以实现响应式。
 *
 * 组件绝不收到 ctx；props 由推导类型组合（runtime + injected + locale）。
 */
import { useSyncExternalStore } from 'react';
/** 命名空间尚未就绪时的稳定回退快照（避免 useSyncExternalStore 快照引漂移）。 */
const FALLBACK_SETTINGS = { routeMode: 'independent', provider: '', model: '' };
export function MemorySettingsSection({ close, settings }) {
    const current = useSyncExternalStore(settings.subscribe, () => settings.get() ?? FALLBACK_SETTINGS);
    const routeMode = current.routeMode;
    return (_jsxs("section", { "data-memory-section": true, "aria-label": "\u8BB0\u5FC6", children: [_jsxs("header", { children: [_jsx("h2", { children: "\u8BB0\u5FC6" }), _jsx("button", { onClick: close, "aria-label": "\u5173\u95ED", children: "\u2715" })] }), _jsxs("section", { "data-memory-extraction-route": true, children: [_jsx("h3", { children: "\u62BD\u53D6\u8DEF\u7531" }), _jsx("p", { children: "\u8BB0\u5FC6\u62BD\u53D6\u6240\u7528\u7684 LLM\uFF1A\u53EF\u590D\u7528\u4E3B\u4F1A\u8BDD\u7684\u9ED8\u8BA4\u8DEF\u7531\uFF0C\u6216\u72EC\u7ACB\u914D\u7F6E\u6A21\u578B\uFF08\u7A7A\u5219\u56DE\u9000\u9ED8\u8BA4\uFF09\u3002" }), _jsxs("fieldset", { children: [_jsx("legend", { children: "\u8DEF\u7531\u6A21\u5F0F" }), _jsxs("label", { children: [_jsx("input", { type: "radio", name: "routeMode", value: "reuse", checked: routeMode === 'reuse', onChange: () => { void settings.set('routeMode', 'reuse'); } }), "\u590D\u7528\u4E3B\u4F1A\u8BDD\u9ED8\u8BA4\u8DEF\u7531"] }), _jsxs("label", { children: [_jsx("input", { type: "radio", name: "routeMode", value: "independent", checked: routeMode === 'independent', onChange: () => { void settings.set('routeMode', 'independent'); } }), "\u72EC\u7ACB\u914D\u7F6E\u6A21\u578B"] })] }), routeMode === 'independent' && (_jsxs("div", { "data-memory-route-independent": true, children: [_jsxs("label", { children: ["Provider", _jsx("input", { value: current.provider, placeholder: "deepseek", onChange: (e) => { void settings.set('provider', e.target.value); } })] }), _jsxs("label", { children: ["Model", _jsx("input", { value: current.model, placeholder: "deepseek-v4-flash", onChange: (e) => { void settings.set('model', e.target.value); } })] })] }))] })] }));
}
//# sourceMappingURL=MemorySettingsSection.js.map