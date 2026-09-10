/**
 * 原子事实模型（Atomic Fact Model）
 *
 * 这是记忆系统的数据契约：一切记忆最终都降解为原子事实。
 * 本模块为「纯 TypeScript 核心」，不依赖任何 DSH 运行时 API，
 * 因此可以独立编译验证（`pnpm typecheck:model`）与单元测试。
 */
/** 生成一个新的 id。 */
export function nextFactId() {
    const rand = Math.random().toString(36).slice(2, 10);
    return `fact_${Date.now().toString(36)}${rand}`;
}
//# sourceMappingURL=fact.js.map