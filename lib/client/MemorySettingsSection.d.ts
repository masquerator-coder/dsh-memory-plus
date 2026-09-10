/**
 * 「记忆」设置分区容器（Browser 半组件）。
 *
 * 组件绝不收到 ctx；props 由推导类型组合：
 *  - PropsRuntime<'settings.section'>：owner 提供的值（如 close）
 *  - InjectFace<MemorySectionInjected>：apply 中 inject factory 返回的 hooks + callbacks
 *  - PropsLocale<'memory'>：t() 本地化
 *  - PropsRenderSlots：若声明了 children slot 才提供 renderSlot
 *
 * 内部是「概览/人格/用户画像/记忆管理/提示词注入/备份恢复/高级设置」子导航 + 内容区
 * （交互细节与边界沿用《UI 设计说明》§3/§7），此处为可编译骨架。
 */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemorySectionInjected } from './index.js';
export type MemoryProps = PropsRuntime<'settings.section'> & InjectFace<MemorySectionInjected> & PropsLocale<'memory'>;
export declare function MemorySettingsSection({ close }: MemoryProps): import("react").JSX.Element;
//# sourceMappingURL=MemorySettingsSection.d.ts.map