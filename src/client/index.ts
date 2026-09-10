/**
 * Browser 半入口：把「记忆」分区注入 DSH 设置页。
 *
 * 需在 DSH workspace 内构建（依赖 dsh-client-ui-slots / dsh-client-ui-settings /
 * dsh-client-locale / dsh-api-remotes 的浏览器侧类型）。
 *
 * 通过 ctx.slots.inject('settings.section', ...) 注册 id:'memory' 分区，
 * SettingsRoot 自动将其投影为设置页左侧导航行并在激活时渲染。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client' // settings.section 声明
import { MemorySettingsSection } from './MemorySettingsSection.tsx'
import { zh, en } from './locales.ts'

export const inject = ['slots', 'locale', 'remote']

export function apply(ctx: Context): void {
  ctx.locale.register('memory', { zh, en })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory',
    order: 50,
    label: () => '记忆',
    locale: 'memory',
    inject: (): MemorySectionInjected => ({
      hooks: {
        // HostObservable 源（见设计文档 §8.4），renderer 转为 useStats/useFacts
        stats: ctx.remote.$host ? undefined : undefined,
        facts: undefined,
      },
      onToggle: (v: boolean) => ctx.remote.memory.toggle(v),
      onSearch: (q: string) => { void q }, // $stream('memory.facts', {query:q})
    }),
  }, MemorySettingsSection))
}

export interface MemorySectionInjected {
  hooks: {
    stats?: unknown
    facts?: unknown
  }
  onToggle(v: boolean): Promise<unknown>
  onSearch(q: string): void
}
