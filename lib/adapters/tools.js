/**
 * memory_* 工具注册（Host 半）。
 * 复用设计文档 §4.3 工具清单，落地为真实 DSH `defineTool` 形态。
 * 依赖 @deepseek-ai/dsh-tools，需在 DSH workspace 内构建。
 *
 * 注意：模型侧只见 {name, description, parameters}；执行/展示回调绝不外泄。
 * 返回值由 output.schema 校验后经 render() 投影为 ContentBlock[] 进入模型。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
/** memory_recall：检索相关原子事实。 */
export function recallTool(memory) {
    return defineTool({
        name: 'memory_recall',
        description: 'Retrieve the most relevant persistent memories for a query. Call before answering when the user references past preferences, decisions, or knowledge.',
        parameters: {
            query: { type: 'string', required: true, description: 'The search text (e.g. the user\'s request).' },
            scope: { type: 'string', description: 'Optional scope filter (e.g. user:alice, project:x). Defaults to current agent.' },
            limit: { type: 'integer', description: 'Max results. Defaults to policy topK.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    entries: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        async execute(args) {
            const facts = await memory.recall({
                query: args.query,
                queryEmbedding: [], // 真实实现经 DshVectorIndex 生成 query embedding
                ...(args.scope !== undefined ? { scope: args.scope } : {}),
                topK: args.limit ?? 5,
            });
            return { entries: facts.map((f) => f.content) };
        },
    });
}
/** memory_remember：显式写入原始内容（主 LLM 只委托，抽取由后台独立完成）。 */
export function rememberTool(memory) {
    return defineTool({
        name: 'memory_remember',
        description: 'Persist a fact, preference, or decision. Pass the ORIGINAL content, not a pre-split atomic fact — extraction happens in the background.',
        parameters: {
            content: { type: 'string', required: true, description: 'The original statement to remember.' },
            scope: { type: 'string', description: 'Optional scope. Defaults to current agent.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: { stored: { type: 'integer', required: true } },
            },
            render: (_args, value) => [{ type: 'text', text: `Stored ${value.stored} fact(s).` }],
        },
        async execute(args) {
            const facts = await memory.remember({
                content: args.content,
                scope: args.scope ?? 'user:default',
                source: { type: 'conversation', uri: 'memory_remember', extracted_by: 'user_tool', credibility: 1.0 },
            });
            return { stored: facts.length };
        },
    });
}
/** memory_forget：删除或归档一条记忆。 */
export function forgetTool(memory) {
    return defineTool({
        name: 'memory_forget',
        description: 'Delete or archive a specific memory by id.',
        parameters: {
            id: { type: 'string', required: true, description: 'Fact id returned by memory_recall or the UI.' },
            mode: { type: 'string', enum: ['delete', 'archive'], description: 'delete removes it; archive just marks archived.' },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
            render: (_args, value) => [{ type: 'text', text: value.ok ? 'Deleted.' : 'Not found.' }],
        },
        async execute(args) {
            const ok = await memory.forget(args.id, args.mode ?? 'delete');
            return { ok };
        },
    });
}
/** read_user_profile：读取当前用户画像摘要（实体卡片渲染）。 */
export function readUserProfileTool(_memory) {
    return defineTool({
        name: 'read_user_profile',
        description: 'Read the current user\'s compact profile summary (aggregated from atomic facts).',
        parameters: {},
        output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
        },
        async execute() {
            // 真实实现：聚合 scope 下 active 事实 → 渲染 user.md 摘要（见 profile/user-view.ts）
            return { summary: '(profile aggregated from atomic facts — see user-view implementation)' };
        },
    });
}
//# sourceMappingURL=tools.js.map