/** 「记忆」分区本地化字典（最小样例；键值沿用《UI 设计说明》§9.2 结构）。 */

export const zh = {
  'nav': '记忆',
  'overview.totalFacts': '记忆总数',
  'soul.injectMode.core': '仅核心人格',
  'profile.editWarning': '编辑此文件将同步更新底层记忆',
  'danger.reset.confirm': '输入 "RESET" 确认',
}

/** Translation keys owned by the `memory` locale namespace. */
export type MemoryKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 「记忆」分区 UI 文案命名空间。 */
    memory: MemoryKey
  }
}

export const en = {
  'nav': 'Memory',
  'overview.totalFacts': 'Total memories',
  'soul.injectMode.core': 'Core persona only',
  'profile.editWarning': 'Editing this file updates the underlying memories',
  'danger.reset.confirm': 'Type "RESET" to confirm',
} satisfies Record<MemoryKey, string>
