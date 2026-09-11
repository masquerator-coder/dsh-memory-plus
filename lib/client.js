window.__ModuleLoader__.load({
	id: "@dsh/dsh-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region ../lib/types/client/MemorySettingsSection.js
		/**
		* 「记忆」设置分区容器（Browser 半组件）。
		*
		* 这里先落地「抽取路由」小节：复用主会话默认路由 / 独立配置 provider+model。
		* 通过注入的 `settings`（MemorySettingsFace，经 ctx.settingsScope）读写 `dsh-memory`
		* 命名空间，用 useSyncExternalStore 订阅其快照以实现响应式。
		*
		* 组件绝不收到 ctx；props 由推导类型组合（runtime + injected + locale）。
		*/
		/** 命名空间尚未就绪时的稳定回退快照（避免 useSyncExternalStore 快照引漂移）。 */
		const FALLBACK_SETTINGS = {
			routeMode: "independent",
			provider: "",
			model: ""
		};
		function MemorySettingsSection({ close, settings }) {
			const current = (0, react.useSyncExternalStore)(settings.subscribe, () => settings.get() ?? FALLBACK_SETTINGS);
			const routeMode = current.routeMode;
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-memory-section": true,
				"aria-label": "记忆",
				children: [(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsx)("h2", { children: "记忆" }), (0, react_jsx_runtime.jsx)("button", {
					onClick: close,
					"aria-label": "关闭",
					children: "✕"
				})] }), (0, react_jsx_runtime.jsxs)("section", {
					"data-memory-extraction-route": true,
					children: [
						(0, react_jsx_runtime.jsx)("h3", { children: "抽取路由" }),
						(0, react_jsx_runtime.jsx)("p", { children: "记忆抽取所用的 LLM：可复用主会话的默认路由，或独立配置模型（空则回退默认）。" }),
						(0, react_jsx_runtime.jsxs)("fieldset", { children: [
							(0, react_jsx_runtime.jsx)("legend", { children: "路由模式" }),
							(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "routeMode",
								value: "reuse",
								checked: routeMode === "reuse",
								onChange: () => {
									settings.set("routeMode", "reuse");
								}
							}), "复用主会话默认路由"] }),
							(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "routeMode",
								value: "independent",
								checked: routeMode === "independent",
								onChange: () => {
									settings.set("routeMode", "independent");
								}
							}), "独立配置模型"] })
						] }),
						routeMode === "independent" && (0, react_jsx_runtime.jsxs)("div", {
							"data-memory-route-independent": true,
							children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Provider", (0, react_jsx_runtime.jsx)("input", {
								value: current.provider,
								placeholder: "deepseek",
								onChange: (e) => {
									settings.set("provider", e.target.value);
								}
							})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Model", (0, react_jsx_runtime.jsx)("input", {
								value: current.model,
								placeholder: "deepseek-v4-flash",
								onChange: (e) => {
									settings.set("model", e.target.value);
								}
							})] })]
						})
					]
				})]
			});
		}
		//#endregion
		//#region ../lib/types/client/locales.js
		/** 「记忆」分区本地化字典（最小样例；键值沿用《UI 设计说明》§9.2 结构）。 */
		const zh = {
			"nav": "记忆",
			"overview.totalFacts": "记忆总数",
			"soul.injectMode.core": "仅核心人格",
			"profile.editWarning": "编辑此文件将同步更新底层记忆",
			"danger.reset.confirm": "输入 \"RESET\" 确认"
		};
		const en = {
			"nav": "Memory",
			"overview.totalFacts": "Total memories",
			"soul.injectMode.core": "Core persona only",
			"profile.editWarning": "Editing this file updates the underlying memories",
			"danger.reset.confirm": "Type \"RESET\" to confirm"
		};
		//#endregion
		//#region ../lib/types/client/index.js
		/**
		* Browser 半入口：把「记忆」设置分区注入 DSH 设置页，并把「抽取路由」配置
		* （复用主会话默认路由 / 独立 provider+model）通过 `ctx.settingsScope` 读写底层
		* settings 的 `dsh-memory` 命名空间。
		*
		* 需在 DSH workspace 内构建（依赖 dsh-client-ui-slots / dsh-client-ui-settings /
		* dsh-client-locale / dsh-api-remotes 的浏览器侧类型）。
		*/
		const inject = [
			"slots",
			"locale",
			"remote",
			"settingsScope"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("memory", {
				zh,
				en
			}), "dsh-memory: dictionaries");
			const routeScope = ctx.settingsScope.bind({ namespace: "dsh-memory" });
			const settingsFace = {
				get: () => routeScope.getSnapshot().value,
				set: (field, value) => routeScope.set(field, value),
				unset: (field) => routeScope.unset(field),
				subscribe: (cb) => routeScope.subscribe(cb)
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "memory",
				order: 50,
				label: () => "记忆",
				locale: "memory",
				inject: () => ({
					hooks: {
						stats: ctx.remote.$host ? void 0 : void 0,
						facts: void 0
					},
					onToggle: (v) => ctx.remote.memory.toggle(v),
					onSearch: (q) => {},
					settings: settingsFace
				})
			}, MemorySettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map