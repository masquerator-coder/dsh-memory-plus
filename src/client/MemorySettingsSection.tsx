/**
 * 「记忆」设置分区容器（Browser 半组件）。
 *
 * 这里先落地「抽取路由」小节：复用主会话默认路由 / 独立配置 provider+model。
 * 通过注入的 `settings`（MemorySettingsFace，经 ctx.settingsScope）读写 `dsh-memory`
 * 命名空间，用 useSyncExternalStore 订阅其快照以实现响应式。
 *
 * 组件绝不收到 ctx；props 由推导类型组合（runtime + injected + locale）。
 */

import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemorySectionInjected, MemoryRouteSettings } from './index.js'

export type MemoryProps =
  PropsRuntime<'settings.section'> & InjectFace<MemorySectionInjected> & PropsLocale<'memory'>

/** 命名空间尚未就绪时的稳定回退快照（避免 useSyncExternalStore 快照引漂移）。 */
const FALLBACK_SETTINGS: MemoryRouteSettings = { routeMode: 'independent', provider: '', model: '' }

export function MemorySettingsSection({ close, settings }: MemoryProps): ReactNode {
  const current = useSyncExternalStore(
    settings.subscribe,
    () => settings.get() ?? FALLBACK_SETTINGS,
  )
  const routeMode = current.routeMode

  return (
    <section data-memory-section aria-label="记忆">
      <header>
        <h2>记忆</h2>
        <button onClick={close} aria-label="关闭">✕</button>
      </header>

      <section data-memory-extraction-route>
        <h3>抽取路由</h3>
        <p>记忆抽取所用的 LLM：可复用主会话的默认路由，或独立配置模型（空则回退默认）。</p>

        <fieldset>
          <legend>路由模式</legend>
          <label>
            <input
              type="radio" name="routeMode" value="reuse"
              checked={routeMode === 'reuse'}
              onChange={() => { void settings.set('routeMode', 'reuse') }}
            />
            复用主会话默认路由
          </label>
          <label>
            <input
              type="radio" name="routeMode" value="independent"
              checked={routeMode === 'independent'}
              onChange={() => { void settings.set('routeMode', 'independent') }}
            />
            独立配置模型
          </label>
        </fieldset>

        {routeMode === 'independent' && (
          <div data-memory-route-independent>
            <label>
              Provider
              <input
                value={current.provider} placeholder="deepseek"
                onChange={(e) => { void settings.set('provider', e.target.value) }}
              />
            </label>
            <label>
              Model
              <input
                value={current.model} placeholder="deepseek-v4-flash"
                onChange={(e) => { void settings.set('model', e.target.value) }}
              />
            </label>
          </div>
        )}
      </section>
    </section>
  )
}
