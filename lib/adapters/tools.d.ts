/**
 * memory_* 工具注册（Host 半）。
 * 复用设计文档 §4.3 工具清单，落地为真实 DSH `defineTool` 形态。
 * 依赖 @deepseek-ai/dsh-tools，需在 DSH workspace 内构建。
 *
 * 注意：模型侧只见 {name, description, parameters}；执行/展示回调绝不外泄。
 * 返回值由 output.schema 校验后经 render() 投影为 ContentBlock[] 进入模型。
 */
import type { MemoryService } from '../service.js';
/** memory_recall：检索相关原子事实。 */
export declare function recallTool(memory: MemoryService): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** memory_remember：显式写入原始内容（主 LLM 只委托，抽取由后台独立完成）。 */
export declare function rememberTool(memory: MemoryService): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** memory_forget：删除或归档一条记忆。 */
export declare function forgetTool(memory: MemoryService): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** read_user_profile：读取当前用户画像摘要（实体卡片渲染）。 */
export declare function readUserProfileTool(_memory: MemoryService): import("@deepseek-ai/dsh-tools").ToolDefinition;
//# sourceMappingURL=tools.d.ts.map