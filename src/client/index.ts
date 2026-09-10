/**
 * Browser 半入口：把「记忆」设置分区注入 DSH 设置页，并把「抽取路由」配置
 * （复用主会话默认路由 / 独立 provider+model）通过 `ctx.settingsScope` 读写底层
 * settings 的 `dsh-memory` 命名空间。
 *
 * 需在 DSH workspace 内构建（依赖 dsh-client-ui-slots / dsh-client-ui-settings /
 * dsh-client-locale / dsh-api-remotes 的浏览器侧类型）。
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only Context augmentations: ctx.slots (ui-renderer), ctx.locale
// (locale), ctx.remote (remotes), ctx.settingsScope (ui-settings), and the
// settings.section slot declaration (ui-settings).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { MemorySettingsSection } from './MemorySettingsSection.tsx'
import { zh, en } from './locales.ts'

export const inject = ['slots', 'locale', 'remote', 'settingsScope']

/** 抽取路由配置的浏览器侧形状（与 host `dsh-memory` 命名空间字段对齐）。 */
export interface MemoryRouteSettings {
  readonly routeMode: 'reuse' | 'independent'
  readonly provider: string
  readonly model: string
}

/** 浏览器侧对 `dsh-memory` 设置的读写/订阅面（经 ctx.settingsScope）。 */
export interface MemorySettingsFace {
  /** 当前同步值；命名空间尚未就绪时返回 undefined。 */
  get(): MemoryRouteSettings | undefined
  /** 写一个字段（routeMode/provider/model）。 */
  set(field: 'routeMode' | 'provider' | 'model', value: string): Promise<void>
  /** 清除 provider/model（恢复默认）。 */
  unset(field: 'provider' | 'model'): Promise<void>
  /** 订阅快照变化，返回取消器。 */
  subscribe(cb: () => void): () => void
}

export interface MemorySectionInjected {
  hooks: {
    stats?: unknown
    facts?: unknown
  }
  onToggle(v: boolean): Promise<unknown>
  onSearch(q: string): void
  settings: MemorySettingsFace
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('memory', { zh, en }), 'dsh-memory: dictionaries')

  // 绑定抽取路由命名空间：getSnapshot().value 是解析后的分区（含默认值）。
  const routeScope = ctx.settingsScope.bind<MemoryRouteSettings>({ namespace: 'dsh-memory' })
  const settingsFace: MemorySettingsFace = {
    get: () => routeScope.getSnapshot().value,
    set: (field, value) => routeScope.set(field, value),
    unset: (field) => routeScope.unset(field),
    subscribe: (cb) => routeScope.subscribe(cb),
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory',
    order: 50,
    label: () => '记忆',
    locale: 'memory',
    inject: (): MemorySectionInjected => ({
      hooks: {
        stats: ctx.remote.$host ? undefined : undefined,
        facts: undefined,
      },
      onToggle: (v: boolean) => (ctx.remote as unknown as { memory: { toggle(v: boolean): Promise<unknown> } }).memory.toggle(v),
      onSearch: (q: string) => { void q },
      settings: settingsFace,
    }),
  }, MemorySettingsSection))
}
