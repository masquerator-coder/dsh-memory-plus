import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** 子导航项（对应《UI 设计说明》七大模块）。 */
const NAV = ['overview', 'soul', 'profile', 'facts', 'prompt', 'backup', 'advanced'];
export function MemorySettingsSection({ close }) {
    // 简化骨架：显示总开关 + 占位分区；完整实现见 panels/*（此处仅展示 UI 装配与 props 用法）
    return (_jsxs("section", { "data-memory-section": true, "aria-label": "\u8BB0\u5FC6", children: [_jsxs("header", { children: [_jsx("h2", { children: "\u8BB0\u5FC6" }), _jsx("button", { onClick: close, "aria-label": "\u5173\u95ED", children: "\u2715" })] }), _jsx("p", { children: "\u8FD9\u91CC\u5C06\u627F\u8F7D\u300C\u6982\u89C8 / \u4EBA\u683C(soul.md) / \u7528\u6237\u753B\u50CF(user.md) / \u8BB0\u5FC6\u7BA1\u7406 / \u63D0\u793A\u8BCD\u6CE8\u5165 / \u5907\u4EFD\u6062\u590D / \u9AD8\u7EA7\u8BBE\u7F6E\u300D\u4E03\u5927\u6A21\u5757\u3002" }), _jsx("ul", { children: NAV.map((k) => (_jsx("li", { children: k }, k))) })] }));
}
//# sourceMappingURL=MemorySettingsSection.js.map