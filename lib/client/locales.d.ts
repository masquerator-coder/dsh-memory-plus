/** 「记忆」分区本地化字典（最小样例；键值沿用《UI 设计说明》§9.2 结构）。 */
export declare const zh: {
    nav: string;
    'overview.totalFacts': string;
    'soul.injectMode.core': string;
    'profile.editWarning': string;
    'danger.reset.confirm': string;
};
/** Translation keys owned by the `memory` locale namespace. */
export type MemoryKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** 「记忆」分区 UI 文案命名空间。 */
        memory: MemoryKey;
    }
}
export declare const en: {
    nav: string;
    'overview.totalFacts': string;
    'soul.injectMode.core': string;
    'profile.editWarning': string;
    'danger.reset.confirm': string;
};
//# sourceMappingURL=locales.d.ts.map