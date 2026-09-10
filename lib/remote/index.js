/**
 * Host 半 Remote 契约（供 Browser 半调用）。
 *
 * 用 Typert Remote 装饰器（@Remote）把权威方法暴露到 ctx.remote.memory.<method>。
 * 真实实现继承 TypertRemoteService；浏览器半把 namespace 挂到 ctx.remote.memory。
 * 契约对齐设计文档 §8.3 API 表。
 *
 * 需在 DSH workspace 内构建（依赖 @deepseek-ai/typert 等 Remote 体系）。
 */
/** 官方 MemoryRemote service（骨架）——真实签名：
 *  class MemoryRemote extends TypertRemoteService {
 *    constructor(ctx) { super(ctx, 'memory', { id: 'memory' }) }
 *    @Remote('stats')      stats(): Promise<MemoryStats> { ... }
 *    @Remote('facts.query') factsQuery(f: FactFilter): Promise<FactsPage> { ... }
 *    ...
 *  }
 */
export class MemoryRemoteContract {
}
//# sourceMappingURL=index.js.map