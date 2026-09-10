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
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { MemoryService } from './service.js';
import { DshStore } from './storage/kv.js';
import { DshVectorIndex } from './storage/vector.js';
import { rememberTool, recallTool, forgetTool, readUserProfileTool } from './adapters/tools.js';
import { lastUserText, scopeOf } from './adapters/util.js';
export const name = 'dsh-memory';
export const inject = [
    'tools', 'systemPrompt', 'storage', 'storageDomain', 'sessionQuery',
    'jobs', 'llm', 'logger', 'settings',
];
/**
 * 当前装配好的记忆服务（在 ctx.effect 内创建后缓存）。
 * 因 ctx.get('memory') 未声明为 Context 服务键，这里用模块级变量捕获，
 * 供 pre-step / 定时整合等挂载点读取（见 DSH context.get 的键约束）。
 */
let activeMemory;
/** 抽象出脊：真正注入 DSH 存储/LLM 的组装点。 */
function assemble(ctx) {
    const store = new DshStore(ctx); // ctx.storageDomain 封装
    const vector = new DshVectorIndex(ctx); // 自建向量索引（方案 A）
    const extractor = {
        extract: (content, _scope) => new LlmExtractor().extract(content),
    };
    return new MemoryService({ store, vector, extractor });
}
/** 抽取器：经 ctx.llm.stream + BlockAssembler 调用独立 LLM（主会话 LLM 不做抽取）。 */
class LlmExtractor {
    async extract(_content) {
        // 实现要点（骨架）：构造抽取提示词 → ctx.llm.stream() → BlockAssembler 折叠 → 解析 JSON 数组
        // 约束：一个谓词一个事实、属性内聚、自包含、标注 type/confidence/qualifiers。
        // 此处保留接口与返回契约；真实实现见 backend note（docs/implementation.md）。
        return [];
    }
}
export function apply(ctx) {
    const logger = ctx.logger('dsh-memory');
    ctx.effect(() => {
        const memory = assemble(ctx);
        activeMemory = memory;
        const disposers = [
            // 1) 暴露记忆服务，供其他插件/工具注入
            ctx.provide('memory', memory),
            // 2) 记忆工具
            ctx.tools.register(rememberTool(memory)),
            ctx.tools.register(recallTool(memory)),
            ctx.tools.register(forgetTool(memory)),
            ctx.tools.register(readUserProfileTool(memory)),
            // 3) 系统提示：记忆意识
            ctx.systemPrompt.section({
                name: 'memory-awareness',
                order: 850,
                text: [
                    'You have persistent memory modelled as atomic facts.',
                    'Use memory_recall to retrieve relevant facts before answering.',
                    'Use memory_remember to store important preferences, decisions, or facts you learn.',
                ].join('\n'),
            }),
        ];
        return () => {
            activeMemory = undefined;
            disposers.forEach((d) => d());
        };
    }, 'dsh-memory: assemble services');
    // 4) 检索注入（RAG）—— agent/pre-step 追加检索段
    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
        const decision = await next();
        if (decision.kind === 'reject' || signal.aborted)
            return decision;
        const memory = activeMemory;
        if (!memory)
            return decision;
        const facts = await memory.recall({
            query: lastUserText(messages),
            queryEmbedding: [], // 真实实现经向量索引生成 query embedding（见 DshVectorIndex）
            scope: scopeOf(agent),
            topK: 5,
        });
        if (facts.length === 0)
            return decision;
        const context = createUserMessage({
            content: [{ type: 'text', text: renderMemoryBlock(facts) }],
            source: { kind: 'plugin', plugin: name, form: 'instructions' },
        });
        return { ...decision, messages: [...decision.messages, context] };
    });
    // 5) 记忆写入观察—— session/event 只投递，session/flush 异步落地
    ctx.on('session/event', (_session, event) => {
        if (event.type === 'assistant/message' || event.type === 'tool/result') {
            enqueueExtraction(ctx, event); // 同步只投递到内部队列
        }
    });
    ctx.on('session/flush', (session) => drainExtractionQueue(ctx, session.id));
    // 6) 隐私拦截—— 敏感记忆写入前 ask/deny
    ctx.on('tools/pre-execute', async (exec, next) => {
        if (exec.name === 'memory_remember' && isSensitive(exec.arguments)) {
            return { kind: 'ask', reason: '该内容可能包含敏感信息，请确认是否写入记忆' };
        }
        return next();
    });
    // 7) 后台定时整合与遗忘（cordis-plugin-timer：interval(callback, delay)）
    const timer = ctx.timer;
    timer?.interval(() => {
        const memory = activeMemory;
        if (memory)
            runConsolidate(ctx, memory).catch((err) => logger.warn('consolidate failed', err));
    }, 6 * 60 * 60 * 1000); // 每 6 小时
    logger.info('dsh-memory host half applied');
}
// —— 以下为示意辅助（真实实现见对应 adapter/storage 文件）——
function renderMemoryBlock(facts) {
    return ['<memory_context>', ...facts.map((f) => `- ${f.content} (conf ${f.confidence.toFixed(2)})`), '</memory_context>'].join('\n');
}
function enqueueExtraction(_ctx, _event) {
    // 推入按 scope 分片的内部提取队列（见 docs/implementation.md 背压策略）
}
function drainExtractionQueue(_ctx, _sessionId) {
    // 在 session/flush 检查点落地：取出排队事件 → ctx.jobs.start() 后台抽取
    return Promise.resolve();
}
function runConsolidate(_ctx, _memory) {
    // 调 consolidate 引擎（去重/衰减/归档）
    return Promise.resolve();
}
function isSensitive(_args) {
    // 简单关键识别（电话/身份证/密钥模式命中即敏感）；真实实现可用正则 + 配置
    return false;
}
//# sourceMappingURL=index.js.map