# 「记忆」设置分区 · 面板组件

本目录承载 `MemorySettingsSection` 内部的七大面板（对应《设计规范 v1.2》§9.2）。骨架阶段为占位，完整实现在 DSH workspace 内落地：

| 文件 | 对应模块 |
|---|---|
| `OverviewPanel.tsx` | 概览（统计卡 + 类型分布 + 最近活动 + 系统状态）|
| `SoulPanel.tsx` | 人格（soul.md 编辑器）|
| `UserProfilePanel.tsx` | 用户画像（编辑/预览/溯源）|
| `MemoryManagerPanel.tsx` | 记忆管理（列表/筛选/编辑/批量）|
| `PromptInjectionPanel.tsx` | 提示词注入 |
| `BackupRestorePanel.tsx` | 备份与恢复 |
| `AdvancedPanel.tsx` | 高级设置（抽取/检索/遗忘/隐私/危险区）|

所有面板组件**不接收 `ctx`**，通过 `PropsRuntime`/`InjectFace`/`PropsLocale` + HostObservable hooks 消费数据，经 `ctx.remote.memory.*` 发起权威变更。
