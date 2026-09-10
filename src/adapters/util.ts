/**
 * 轻量工具（Host 半）。
 * 依赖 @deepseek-ai/* 类型，需在 DSH workspace 内构建。
 */

import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'

/** 取最近一条用户文本输入（用于检索查询）。 */
export function lastUserText(messages: readonly UserMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m) continue
    if (m.source.kind !== 'user') continue
    const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
    if (text) return text
  }
  return ''
}

/** 作用域：DSH 以 Agent 为 ScopeKey；记忆业务 scope 默认取 user:agent.id。 */
export function scopeOf(agent: Agent): string {
  return `user:${agent.id}`
}
