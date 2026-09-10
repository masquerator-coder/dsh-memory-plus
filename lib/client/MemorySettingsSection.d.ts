/**
 * 「记忆」设置分区容器（Browser 半组件）。
 *
 * 这里先落地「抽取路由」小节：复用主会话默认路由 / 独立配置 provider+model。
 * 通过注入的 `settings`（MemorySettingsFace，经 ctx.settingsScope）读写 `dsh-memory`
 * 命名空间，用 useSyncExternalStore 订阅其快照以实现响应式。
 *
 * 组件绝不收到 ctx；props 由推导类型组合（runtime + injected + locale）。
 */
import type { ReactNode } from 'react';
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemorySectionInjected } from './index.js';
export type MemoryProps = PropsRuntime<'settings.section'> & InjectFace<MemorySectionInjected> & PropsLocale<'memory'>;
export declare function MemorySettingsSection({ close, settings }: MemoryProps): ReactNode;
//# sourceMappingURL=MemorySettingsSection.d.ts.map