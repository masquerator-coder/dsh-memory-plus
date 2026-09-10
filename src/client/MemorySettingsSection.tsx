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

import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MemorySectionInjected } from './index.js'

export type MemoryProps =
  PropsRuntime<'settings.section'> & InjectFace<MemorySectionInjected> & PropsLocale<'memory'>

/** 子导航项（对应《UI 设计说明》七大模块）。 */
const NAV = ['overview', 'soul', 'profile', 'facts', 'prompt', 'backup', 'advanced'] as const

export function MemorySettingsSection({ close }: MemoryProps) {
  // 简化骨架：显示总开关 + 占位分区；完整实现见 panels/*（此处仅展示 UI 装配与 props 用法）
  return (
    <section data-memory-section aria-label="记忆">
      <header>
        <h2>记忆</h2>
        <button onClick={close} aria-label="关闭">✕</button>
      </header>
      <p>这里将承载「概览 / 人格(soul.md) / 用户画像(user.md) / 记忆管理 / 提示词注入 / 备份恢复 / 高级设置」七大模块。</p>
      <ul>
        {NAV.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      {/* 完整实现：OverviewPanel / SoulPanel / UserProfilePanel / MemoryManagerPanel /
          PromptInjectionPanel / BackupRestorePanel / AdvancedPanel（见 src/client/panels/） */}
    </section>
  )
}
