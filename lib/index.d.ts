/**
 * Host 半入口：apply(ctx) 装配记忆服务并注册 DSH 扩展点。
 *
 * ⚠️ 本文件依赖 @deepseek-ai/* 运行时类型，需在 DSH workspace 内作为 workspace 包构建
 *  （放入 packages/extensions/dsh-memory 并加入根 tsconfig references）。纯逻辑核心
 *  （src/model、src/storage/store.ts、src/engines、src/service.ts）可在本目录独立
 *  编译验证：`pnpm exec tsc -p tsconfig.model.json`。
 *
 * 装配的 DSH 扩展点（见设计文档 §4）：
 *  - ctx.effect(): 统一副作用生命周期，卸载即逆序清理
 *  - ctx.provide('memory', ...): 暴露记忆服务
 *  - ctx.tools.register(defineTool(...)): 注册 memory_* 工具
 *  - ctx.systemPrompt.section/context(): 记忆意识提示 + 用户画像摘要
 *  - ctx.on('agent/pre-step'|'session/event'|'session/flush'|'tools/pre-execute'): 注入/观察
 *  - ctx.jobs / ctx.timer: 后台抽取与定时整合
 *  - ctx.llm.stream + BlockAssembler: 独立抽取调用
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-memory";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map