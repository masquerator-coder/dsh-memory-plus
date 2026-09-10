# DeepSeek Harness 记忆系统插件 · DSH 插件规范适配设计

**版本**：v1.1（适配 DSH 真实插件规范）
**前置文档**：《整体框架设计 v1.0》《UI 设计说明 v1.0》《DSH 上下文管理机制深度分析》
**定位**：Cordis 双半插件（Host + Browser），为 DSH 提供持久化记忆能力
**规范依据**：DSH 源码实测（`D:\Apps\deepseek-harness`）——`docs/subsystems/{tools,system-prompt,slots,settings,web-client,storage,session-query,jobs}.zh.md`、`docs/cordis-api/{context,fiber,service,inherited}.zh.md`、`packages/extensions/{tool-cordis,ui-cordis,cordis-host-runner}` 真实实现

---

## 0. 本文档要解决的问题

原《整体框架设计》与《UI 设计说明》是一份**业务意图正确、但 API 调用层假设了通用 Cordis 语法**的设计稿。本文档在**保留其全部业务设计意图**（原子事实模型、四引擎、分层异步、混合存储、soul.md/user.md、UI 七大模块）的前提下，将其**修正、落地为符合 DSH 真实插件规范**的可实现设计。

三处关键差异需要在实现前明确：| 设计稿假设 | DSH 真实规范 | 说明 |
|---|---|---|
| `ctx.settings.registerTab(...)` 新增设置页 | `ctx.slots.inject('settings.section', ...)` + browser 半插件 | DSH 的设置页是 Slot 组合系统，无 `registerTab` API |
| `session/event` 作为观察者、`agent/request` 注入 | `agent/*`、`session/*`、`tools/*` 事件群（见 §4.2） | 事件名与语义需按真实 API 对齐 |
| Kùzu/Neo4j 图库、外部向量库 | 无内置向量/图库；用 `ctx.storageDomain`（json/sqlite）自建 | 需自建轻量向量与关系索引（见 §7） |

---

## 1. 概述与设计原则

### 1.1 目标

为 DSH 提供一套**纯插件形态、可组合、可配置、可观测**的持久化记忆系统，使 Agent 跨越会话记住用户偏好、项目知识、历史事件与可复用技能。插件不修改 Harness 源码，只通过 Cordis 服务注册、事件拦截与浏览器 Slot 注入接入。

### 1.2 设计原则（沿用框架设计，逐条给出 DSH 落点）

| 原则 | 含义 | DSH 落点 |
|---|---|---|
| 纯插件形态 | 不改 Harness 源码 | Host 半 `apply(ctx)` + Cordis 效果生命周期 |
| 一切记忆降解为原子事实 | 实体卡片是聚合、图谱是连接、程序记忆是序列化 | 原子事实模型（§5） |
| 统一模型、策略配置 | 个人助理/研究 Agent 靠 Profile 区分 | `settings` namespace + 策略表 |
| 调度优于存储 | 正确时间召回正确记忆 | Recall Engine + `agent/pre-step` 注入 |
| 主会话 LLM 不做抽取 | 抽取永远由独立 LLM 调用 | `ctx.llm.stream` + 后台 Worker |
| 分层异步 | 同步只做投递，重活后台 | `ctx.jobs` + 内部任务队列 |
| 主动遗忘 | 衰减与淘汰与存储同等重要 | Consolidate Engine + TTL |

---

## 2. 插件形态：Host 半 + Browser 半（双半插件）

DSH 中带 UI 的功能插件是**同一个 npm 包、两个入口**：

```
dsh-memory/
├── package.json          # exports["."]=Host 半, exports["./client"]=Browser 半, dsh.client 声明
├── src/
│   ├── index.ts          # ── Host 半 apply(ctx)：注册记忆服务、引擎、工具、事件注入
│   └── client/
│       └── index.ts      # ── Browser 半 apply(ctx)：Slot 注入设置页「记忆」选项卡、Remote 调用
```

### 2.1 Host 半（node，权威业务逻辑）

```ts
// src/index.ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-memory'
export const inject = [
  'tools', 'systemPrompt', 'storage', 'storageDomain', 'sessionQuery',
  'jobs', 'llm', 'logger',
]

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const memory = new MemoryService(ctx)
    // 导入所需的依赖服务、注册 init 回调
  })
  // 各能力通过 ctx.effect 注册，插件卸载即逆序自动清理（见 §4.1）
}
```

**要点**：
- `ctx` 类型来自 `@deepseek-ai/cordis`（vendored）；`inject` 数组中的服务由 Cordis 解析后才调用 `apply`。
- 所有注册（服务、工具、事件监听、系统提示段、后台作业、定时器）都包在 `ctx.effect()` 里，卸载时逆向自动清理——这正是 DSH 规范化副作用管理的做法，插件卸载不残留。
- 权威记忆数据、持久化、mutation 顺序、异步流水线全部在 Host 半。

### 2.2 Browser 半（浏览器，UI 注入）

```ts
// src/client/index.ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client' // settings.section 声明
import { MemorySettingsSection } from './MemorySettingsSection.tsx'

export const inject = ['slots', 'locale', 'remote', 'remote.memory']

export function apply(ctx: Context): void {
  ctx.locale.register('memory', { zh, en })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory',
    order: 50,
    label: () => ctx.locale.t('memory.nav'),
    locale: 'memory',
    inject: (): MemorySectionInjected => ({
      hooks: {
        stats: hostObservable(stats),      // HostObservable，见 §8.7
        facts: hostObservable(facts),
      },
      onToggle: (v) => ctx.remote.memory.toggle(v),
      onSearch: (q) => ctx.remote.$stream('memory.facts', { query: q }),
    }),
  }, MemorySettingsSection))
}
```

**要点**：
- Browser 半在 `package.json` 通过 `exports["./client"]` + `dsh.client { platform:'web', inject:[...] }` 声明，由 client program 装载。
- 设置页「记忆」选项卡通过 `ctx.slots.inject('settings.section', ...)` 注入（与 ui-settings-general、ui-models 同构）。
- 组件**绝不收到 `ctx`**；只收 `PropsRuntime` / `PropsRenderSlots` / `PropsStore` / `InjectFace` / `PropsLocale` 与标准 hooks——业务数据走 Remote + HostObservable。

---

## 3. 整体架构

```
┌────────────────────────────────────────────────────────────────┐
│                      DSH Runtime (Cordis)                        │
│   Agent Loop • Session Event Log • Tool Registry • SystemPrompt │
└──────┬──────────────────┬──────────────────┬──────────────┬─────┘
       ▼                  ▼                  ▼              ▼
┌────────────────────────────────────────────────────────────────┐
│               Extension Surface（DSH 真实扩展点）               │
│  ctx.on('agent/pre-step')  ctx.on('session/*')  ctx.tools       │
│  ctx.systemPrompt.section/context   ctx.effect                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                    Memory Service Layer（服务层）                │
│   Recall Engine │ Remember Engine │ Consolidate Engine          │
│        Policy Engine（settings 策略 namespace 驱动）            │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│            Storage Layer（复用 DSH 存储 + 自建模引）             │
│  ctx.storageDomain（KV，json/sqlite）＋ 自建向量段 ＋ 关系边     │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│        Atomic Fact Model（原子事实模型 • 数据契约）              │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. 扩展点接入（Host 半）

### 4.1 生命周期与副作用（Cordis 规范）

- 一切注册包在 `ctx.effect(execute, label?)`。`execute` 立即运行并产生 disposer；在 dispose 调用或 fiber 卸载时**按注册相反顺序**清理。卸载一次即清理服务、工具、事件、提示段、定时器、后台作业。
- 提供服务用 `ctx.provide(name, value)`（可被同作用域依赖方 `inject`）；读取惰性服务用 `ctx.get(name)`。

```ts
ctx.effect(() => {
  const disposers: Array<() => void> = [
    ctx.provide('memory', memoryService),
    ctx.tools.register(memoryRecallTool),
    ...
  ]
  return () => disposers.forEach(d => d())
}, 'dsh-memory: register')
```

### 4.2 事件观察与注入（DSH 真实事件群）

DSH 记忆插件真正用到的扩展点与设计稿的映射：

| 记忆能力 | DSH 真实扩展点 | 模式 | 说明 |
|---|---|---|---|
| 检索注入（RAG） | `agent/pre-step` | waterfall | 把检索到的记忆作为 `UserMessage` 追加进 `decision.messages`（最贴 RAG；见 §4.3） |
| 记忆写入（观察对话） | `session/event`（post-commit feed）+ `session/flush`（parallel） | emit / parallel | 观察 `assistant/message`、`tool/result`、`turn/end`；在 `session/flush` 检查点落地异步写库 |
| 工具级即时抽取 | `tools/result` | emit | 每工具结算后抽取（量级最小） |
| 显式记忆工具 | `ctx.tools.register(defineTool(...))` | Service | `memory_recall` / `memory_remember` / `memory_forget` / ... |
| 工具隐私拦截 | `tools/pre-execute`（waterfall）或 `ctx.tools.guard()` | waterfall / guard | 敏感记忆写入前拦截/询问 |
| 系统提示注入 | `ctx.systemPrompt.section()` / `ctx.systemPrompt.context()` | Service | 记忆意识提示 / 用户画像摘要 |
| 会话收尾 | `agent/turn-stopping`（serial） | serial | 整轮收尾（应避免阻塞，见 §6） |
| 会话清理 | `session/disposed` | emit | 清理该会话关联的临时状态 |

### 4.3 检索注入 RAG（`agent/pre-step`）

```ts
// 官方权威写法：在 agent/pre-step 中把检索段追加进 decision.messages
ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
  const decision = await next()
  if (decision.kind === 'reject' || signal.aborted) return decision
  const memories = await memoryService.recall({            // 向量 + 图 + 策略排序
    query: lastUserText(messages),
    scope: scopeOf(agent),
    topK: policy.retrieval.topK,
  })
  if (memories.length === 0) return decision
  return {
    ...decision,
    messages: [...decision.messages, renderMemoryContext(memories)], // UserMessage，带来源
  }
})
```

> `agent/pre-step` 返回 `PreStepDecision = {kind:'reject'} | {kind:'enter', messages: UserMessage[], startsRequestSeries?}`。注入时**不要**覆盖整段消息，只在 `next()` 结果上追加检索段，避免破坏 compaction 的尾巴保留与稳定性。

### 4.4 记忆写入观察（`session/event` + `session/flush`）

```ts
ctx.on('session/event', (session, event) => {
  if (event.type === 'assistant/message' || event.type === 'tool/result') {
    enqueueExtraction({ sessionId: session.id, event })   // 同步只投递，不抽取
  }
})
// session/flush 是 parallel：所有监听器被 await，作为异步写库的可持续检查点
ctx.on('session/flush', (session) => {
  return drainExtractionQueue(session.id)                 // 在此落地（抽取→验证→写入）
})
```

### 4.5 系统提示注入（`ctx.systemPrompt`）

- **记忆意识提示**（静态）：`ctx.systemPrompt.section({ name:'memory-awareness', order: <finite>, text: '...' })`。
- **用户画像摘要**（动态，随组装求值）：推荐 `ctx.systemPrompt.context({ name, order, text: (ctx) => renderSummaryFor(scope) })`——它作为带来源的 user-role 快照，只在变化时记录、可被 compaction 处理，适合 RAG 注入。
- **soul.md 分层注入**：核心人格用 `section`（常驻、order 低）；扩展设定走记忆检索，不默认注入。

### 4.6 工具注册（`ctx.tools.register(defineTool(...))`）

设计稿的五个工具全部落地为真实 `defineTool`（示例见 §10.3）。注意模型侧只见 `{name, description, parameters}`，执行/展示回调绝不外泄；返回值由 `output.schema` 校验后经 `render()` 投影为 `ContentBlock[]` 进入模型。

---

## 5. 原子事实模型（数据契约，沿用框架设计）

保持 §3 的完整 Schema（id / subject / predicate / object / qualifiers / content / type / scope / source / confidence / version / supersedes / semantic_key / status / privacy / ttl / embedding / entities / tags）。为适配 DSH 存储，做如下工程化映射：

- **`scope`**：DSH 作用域以活跃 `Agent` 对象为 `ScopeKey`，不承载字符串业务作用域。记忆插件的 `scope` 字段保留设计稿的字符串业务语义（`user:alice` / `project:x` / `agent:soul`），但在**顺序性/隔离**上叠加 DSH 的 `Agent` 维度：一条记忆 = `{ agentScope, fact }`，同一 `agentScope` 下按 `semantic_key` 串行演进。
- **`source.uri`**：直接引用 `SessionEvent` 日志坐标 `session:<id>#<seq>`（DSH 会话日志基于 `seq` 连续递增），保证可回溯。
- **`embedding`**：DSH 无内置向量库，向量段自建（见 §7.2）。

---

## 6. 执行模型（沿用框架，映射 DSH 机制）

沿用「同步快通道 + 异步慢通道 + 子 Agent 例外」的阶段划分。DSH 落点：

| 阶段 | 上下文依赖 | 延迟敏感 | 全局视野 | 执行方式（DSH） |
|---|---|---|---|---|
| 事件捕获 | 高 | 低 | 无 | 同步：`session/event` 只投递 |
| 快通道 A（工具委托） | 高 | 高 | 无 | 同步：模型调 `memory_remember`，参数为原始内容 |
| 快通道 B（规则匹配） | 高 | 极高 | 无 | 同步：`session/event` 内正则匹配触发词，命中即投递 |
| 慢通道抽取 | 高 | 低 | 无 | 异步：`ctx.jobs.start()` 后台作业，携带上下文快照 |
| 程序化验证 | 低 | 中 | 部分 | 异步：纯函数（三元组/semantic_key/粒度/自包含） |
| 存储写入 | 无 | 中 | 无 | 异步：`ctx.storageDomain` 写入 |
| 关联与建边 | 无 | 低 | 是 | 异步：关系索引写入 |
| 冲突消解 | 无 | 低 | 强 | 异步：per-scope 串行比对 semantic_key |
| 实体卡片聚合 | 无 | 低 | 强 | 后台定时（`ctx.timer.interval`）|
| 摘要压缩 / 遗忘 | 无 | 低 | 强 | 后台定时 |

**核心原则（不变）**：主会话 LLM 不做抽取，只做对话与工具委托。抽取永远由后台 `ctx.llm.stream` 独立调用完成（见 §7.4）。

**子 Agent 仍是例外**：程序记忆归纳（从多次操作抽象 SOP）等复杂多步任务才用子 Agent，单独作业；单步抽取/验证/写入用轻量后台作业，不用 Agent。

**后台作业用 `ctx.jobs.start()`**（`JobRegistry`，自带按 owner 的准入与并发上限），不要自行实现全局任务队列——DSH 没有通用 workqueue 原语。

---

## 7. Storage Layer（复用 DSH + 自建模引）

### 7.1 一条原子事实的 DSH 存储分布

| 存储 | 存什么 | DSH 落点 |
|---|---|---|
| KV 主记录 | 全部字段 | `ctx.storageDomain`（`KvTable`，zod schema，json/sqlite 后端）|
| 向量段 | `content` 的 embedding | 自建（§7.2）|
| 关系边 | `subject -[predicate]-> object` | 自建关系表（`KvTable` 或进程内索引）|
| 对象/来源 | 原始对话快照 | 复用 `session-query` 检索原文，或 `ctx.spillStore` |

### 7.2 向量检索：自建轻量方案

DSH **无内置 embedding/向量库**。两个可选实现，按规模选择：

- **方案 A（个人助理，默认）**：用 `ctx.storageDomain` 存 `(factId → embedding[])`，检索时进程内计算余弦相似度 top-K。数据量在中千条以内，线性扫描足够（个人画像规模）。可加简单 ANN（按 scope 分桶以缩小扫描面）。
- **方案 B（研究 Agent）**：接入外部向量库（如 sqlite + 余弦超平面近似、或经由 `ctx.llm.stream` 调外部 embedding API 生成向量后仍存 DSH KV）。演进为一层可插拔 `VectorIndex` 接口，两者共用 Recall Engine。

**embedding 生成**：通过 `ctx.llm.stream` 调用 embedding 能力（DSH 无 `chat()` 便捷方法，用 `stream` 取流，`BlockAssembler` 折叠；或外部 embedding API）。

### 7.3 关系（图）检索：自建关系边

Kùzu/Neo4j 不引入（个人助理规模过重）。用 `ctx.storageDomain` 的两张表维护：
- `edges: { from, predicate, to, ... }`，按 `from`/`to` 各建一层索引；
- 图扩展（1-2 跳）在进程内沿边展开，命中 `entities` 种子后召回邻居事实。

### 7.4 检索链路总览

```
query
  → 向量 top-K（自建 VectorIndex）
  → 过滤 scope / status=active / ttl / privacy
  → semantic_key 去重（保留最高分版本）
  → 以 entities 为种子沿 edges 扩 1-2 跳
  → Policy 排序（score = w·relevance + w·confidence + w·credibility + w·recency）
  → 返回 top-N（content 渲染注入 Prompt）
```

跨会话**历史/情景召回**可复用 `ctx.sessionQuery`（全文检索 + 事件读取 + 血缘追踪），作为情景记忆的落库前检索与审计回溯。

---

## 8. UI Design（Browser 半，Slot 注入）

### 8.1 在 DSH 设置页中的位置（Slot 树）

DSH 设置页是 Slot 组合：`sidebar → sidebar.settings → settings.section → (各分区)`。记忆插件通过注册 `settings.section` 的分区 `id:'memory'`，`SettingsRoot` 自动把它投影为左侧导航行，并在激活时渲染你的分区组件。

```
DSH 设置 › (左侧导航，settings.section 自动投影)
├── 通用        (settings.general.item 等，其他插件)
├── 模型        (ui-settings-models)
├── 插件        (ui-settings-plugins)
├── 记忆   ◀── 本插件注册的 settings.section 分区 (id:'memory', order:50)
│   ├── 概览
│   ├── 人格（soul.md）
│   ├── 用户画像（user.md）
│   ├── 记忆管理
│   ├── 提示词注入
│   ├── 备份与恢复
│   └── 高级设置
└── 关于
```

"记忆"分区内部仍是**子导航 + 内容区**的七个模块（沿用 UI 设计文档 §2/§3 的完整交互与边界设计）。实现时子导航可以用 `settings.section` 内的子 Slot（本插件自己的声明），或多个 `settings.general.item` 行；推荐在 `MemorySettingsSection` 组件内部做 tabs，避免过度嵌套外层 slot。

### 8.2 各模块与 DSH 数据通路

| 模块 | 数据来源（Host 半） | Browser 获取方式 |
|---|---|---|
| 概览 Dashboard | `memory.stats` | `ctx.remote.memory.stats()` + HostObservable 实时订阅 |
| 人格 soul.md | `memory.soul` | `ctx.remote.memory.soul.get()` / `.put()` |
| 用户画像 user.md | `memory.profile` | `ctx.remote.memory.profile.get()` / `.parse()` / `.apply()` + provenance |
| 记忆管理 | `memory.facts` | `ctx.remote.$stream('memory.facts', {filters})` + 增删改 Remote |
| 提示词注入 | `memory.injection` | `ctx.remote.memory.injection.*` |
| 备份与恢复 | `memory.backup` | `ctx.remote.memory.backup.*`（导出走精确 Fetch 路由）|
| 高级设置 | `memory.config` | `ctx.remote.memory.config.*` + `ctx.remote.settings` |

### 8.3 Remote 契约（Browser 半调用 Host 半）

Host 半定义 `MemoryRemote extends TypertRemoteService`，方法加 `@Remote('name')`；Browser 半把 namespace 挂在 `ctx.remote.memory`。契约沿用 UI 设计文档 §5 的 API（经严格 JSON 序列化）：

```ts
// Host 半（@Remote 标记）
@Remote('stats')       stats(): Promise<Stats>
@Remote('soul.get')    soulGet(): Promise<{content, tokenCount}>
@Remote('soul.put')    soulPut(patch: {content: string}): Promise<{...}>
@Remote('facts.query') factsQuery(filter: FactsFilter): Promise<FactsPage>
@Remote('fact.update') factUpdate(id: string, patch: FactUpdate): Promise<...>
@Remote('fact.delete') factDelete(id: string): Promise<{ok:boolean}>
@Remote('profile.parse') profileParse(content: string): Promise<ChangeSummary>
@Remote('profile.apply') profileApply(changes: Change[]): Promise<void>
@Remote('config.get')  configGet(): Promise<MemoryConfig>
@Remote('config.put')  configPut(config: MemoryConfig): Promise<...>
@Remote('toggle')      toggle(enabled: boolean): Promise<void>
@Remote('backup.export') backupExport(opts): Promise<Blob>   // 或走精确 Fetch 路由
```

### 8.4 实时同步（记忆更新 → UI 刷新）

两条 DSH 机制，按场景选择：

1. **Host 事件 → 浏览器 `ctx.remote.$on`**：Host 半 `this.ctx.emit('memory/event', {...})`（`fact/created`、`fact/superseded`、`consolidation/completed`、`profile/updated`…），Browser 半 `ctx.remote.$on('memory/event', fn)` 实时刷新列表/概览。
2. **HostObservable + `useX(selector)`**：Host 半暴露 `HostObservable`（getSnapshot/subscribe 裸源），经 slot `inject` 的 `hooks` 交给组件，renderer 转为 `useStats(selector)` 订阅。

> **可靠性**：DSH 的 forwarded notification **不重放**。因此列表/概览的"权威状态"必须可经 `query`/`stats` 重新拉取（提供 baseline）；事件推送只做增量优化的信号，不做唯一真相源。避免在无 baseline 的 stateful 数据上依赖纯事件恢复。

### 8.5 危险操作与边界（沿用 UI 设计文档 §7）

- 删除/批量删除/重置：二次确认 + 显示影响范围；重置输入 "RESET" + 建议先导出。
- 恢复备份：差异预览 + 可撤销（保留恢复前快照）。
- 保存冲突：`settings` 写入用 descriptor `revision` + `expectedRevision` 拒绝陈旧写入（DSH 原生能力）；user.md 双向同步沿用"用户编辑 `credibility=1.0` 永远胜出"。

### 8.6 国际化 / 可访问性

- 国际化：Browser 半 `ctx.locale.register('memory', {zh, en})`，组件 `PropsLocale<'memory'>` 收 `t()`。键值结构沿用 UI 设计 §9.2。
- 可访问性：键盘导航、ARIA、WCAG AA、`prefers-reduced-motion`（组件侧实现；Skeleton/空态/错误态沿用 §7.3）。

---

## 9. 插件包结构（真实 package.json）

```
dsh-memory/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Host 半 apply(ctx)：MemoryService + 四引擎 + 工具 + 事件 + 调度
│   ├── service.ts               # MemoryService（extends Service）
│   ├── atomic/
│   │   ├── schema.ts            # 原子事实类型（zod，供 storageDomain defineDomain 复用）
│   │   ├── extractor.ts         # 抽取提示词 + ctx.llm.stream 调用
│   │   ├── validator.ts         # 程序化验证
│   │   └── semantic-key.ts      # 语义键生成与去重
│   ├── engines/
│   │   ├── recall.ts            # Recall Engine（向量+图+排序）
│   │   ├── remember.ts          # Remember Engine（抽取→验证→存储→关联）
│   │   └── consolidate.ts       # Consolidate Engine（去重/冲突/聚合/衰减/摘要）
│   ├── storage/
│   │   ├── vector.ts            # 自建 VectorIndex（方案 A/B）
│   │   ├── edges.ts             # 关系边表
│   │   └── kv.ts                # ctx.storageDomain 封装（KvTable + defineDomain）
│   ├── policy/
│   │   ├── engine.ts            # Policy Engine
│   │   └── profiles.ts          # personal / research 预置
│   ├── profile/
│   │   ├── soul.ts              # 加载/注入 soul.md（segment/context）
│   │   └── user-view.ts         # 渲染/解析 user.md（实体卡片视图）
│   ├── entities/
│   │   ├── card.ts              # 实体卡片聚合
│   │   └── renderer.ts          # 卡片 → user.md 渲染
│   ├── adapters/
│   │   ├── pre-step.ts          # agent/pre-step 检索注入
│   │   ├── session.ts           # session/event + session/flush 观察
│   │   ├── tools.ts             # memory_* 工具注册
│   │   └── privacy.ts           # tools/pre-execute 隐私拦截
│   ├── remote/
│   │   └── index.ts             # MemoryRemote（@Remote 方法）+ HostObservable 源
│   └── client/
│       ├── index.ts             # Browser 半 apply：slots 注入 + locale + Remote 装配
│       ├── MemorySettingsSection.tsx   # 「记忆」分区容器（子导航 + 内容区）
│       ├── panels/
│       │   ├── OverviewPanel.tsx
│       │   ├── SoulPanel.tsx
│       │   ├── UserProfilePanel.tsx
│       │   ├── MemoryManagerPanel.tsx
│       │   ├── PromptInjectionPanel.tsx
│       │   ├── BackupRestorePanel.tsx
│       │   └── AdvancedPanel.tsx
│       ├── stores.ts            # 视图 store（纯 UI 状态）
│       └── locales.ts           # zh/en 字典
├── lib/                         # tsdown 产物：index.js(host), client.js(browser)
└── docs/
```

### package.json 关键字段

```jsonc
{
  "name": "@dsh/dsh-memory",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":        { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },   // Host 半
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }, // Browser 半
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": ["dsh-client-ui-slots", "dsh-client-ui-settings", "dsh-client-locale", "dsh-api-remotes"],
      "platform": "web"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-tools": "workspace:^",
    "@deepseek-ai/dsh-system-prompt": "workspace:^",
    "@deepseek-ai/dsh-storage": "workspace:^",
    "@deepseek-ai/dsh-storage-domain": "workspace:^",
    "@deepseek-ai/dsh-session-query": "workspace:^",
    "@deepseek-ai/dsh-jobs": "workspace:^",
    "@deepseek-ai/dsh-llm": "workspace:^"
  }
}
```

---

## 10. 配置与 Profile

### 10.1 配置载体：`ctx.settings` namespace（DSH 原生配置系统）

设计稿里的 `config: profile` / `policy` 等配置，落地为注册一个 `settings` namespace（schemastery schema 驱动，value 持在 `cordis.yml` 用户文档，支持 `describe/update/replace/watch`、`revision` 冲突保护、`redactSecrets`）。这样：
- 配置可以热更新、被 DSH 配置 UI 描述、可被插件 `watch` 响应。
- Profile（personal/research）作为组合 `base` 层，用户覆盖层在其上叠加。

```ts
// Host 半注册配置 namespace
const scope = ctx.settings.register('memory', MemorySettingsSchema, {
  base: profiles[activeProfile],        // 组合 base 层 = 预置 profile
  applies: 'live',
})
// 需要时 watch 变更（策略不硬编码）
scope.watch((next) => policyEngine.update(next.policy))
```

### 10.2 个人助理 / 研究 Agent Profile（沿用框架设计 §10）

两份预置以配置 base 层形式交付，字段与语义完全沿用 §10.1 / §10.2（抽取模型、粒度、TTL、冲突策略、排序权重、隐私）。差异收敛到配置，代码单一份。

---

## 11. 可观测性与工程保障

- **全链路追踪**：事件 ID → 抽取作业（`ctx.jobs` 作业 id）→ 验证 → 写入 → 冲突决策；写 `memory/*` 日志（`ctx.logger`），并作为 `memory/event` 推送供 UI 概览展示最近活动。
- **顺序性**：同 `agentScope` 内 `semantic_key` 演进串行——用 `ctx.jobs` 按 owner 的准入/串行语义，或 per-scope 自旋队列。
- **幂等性**：`semantic_key` 去重天然保证事件重放/重复抽取幂等。
- **快慢通道冲突**：慢通道发现既存 → supersede；粒度更细 → 新建 + 旧标 coarse。
- **背压**：抽取队列水位过高时降级为"只抽取不验证"或按 scope 优先级丢弃低价值事件（观察 `ctx.jobs` 水位）。
- **持久化一致性**：`session/flush` 作为异步写库检查点，flushing 语义与 DSH 会话持久化对齐。

---

## 12. 附录：DSH 扩展点映射（终稿）

| 记忆能力 | DSH 扩展点 | Cordis 机制 |
|---|---|---|
| 检索注入 | `agent/pre-step` | waterfall |
| 记忆写入（对话观察） | `session/event` + `session/flush` | emit / parallel |
| 工具级即时抽取 | `tools/result` | emit |
| 显式记忆工具 | `ctx.tools.register(defineTool(...))` | Service |
| 隐私拦截 | `tools/pre-execute` / `ctx.tools.guard()` | waterfall / guard |
| 系统提示 | `ctx.systemPrompt.section` / `.context` | Service |
| 记忆服务 API | `ctx.provide('memory', ...)` | Service + inject |
| 存储后端 | `ctx.storageDomain` / `ctx.storage` | Service（json/sqlite）|
| 历史/情景召回 | `ctx.sessionQuery` | Service（全文）|
| 后台抽取/聚合 | `ctx.jobs` + `ctx.timer` | Service / timer |
| 独立 LLM 抽取 | `ctx.llm.stream` + `BlockAssembler` | Service |
| Browser UI | `ctx.slots.inject('settings.section', ...)` | Slots（browser 半）|
| Host↔Browser | `@Remote` + `ctx.remote.memory.*` + `memory/event` | Remote / forwarded event |
| 配置 | `ctx.settings.register('memory', schema, {base})` | Service |
| 卸载清理 | `ctx.effect()` | fiber 逆序自动释放 |

整个插件的所有注册都包在 `ctx.effect()` 内，插件卸载（或 `cordis_stop`/`undefine`）时自动清理全部副作用——服务、事件、工具、提示段、定时器、后台作业与浏览器 Slot 挂载。

---

## 13. 实现顺序（沿用框架设计，按 DSH 依赖调整）

1. MemoryService + 原子事实类型（zod schema，直接服务 storageDomain `defineDomain`）。
2. `ctx.storageDomain` KV 表 + 基础 remember/recall。
3. `agent/pre-step` 检索注入 + `ctx.systemPrompt.context` 摘要注入。
4. `memory_*` 工具注册（`defineTool`）。
5. `session/event` + `session/flush` 观察 + `ctx.jobs` 后台抽取流水线。
6. 自建向量索引（方案 A 起）+ 混合检索 + 关系边。
7. Consolidate Engine + 遗忘策略（`ctx.timer` 后台定时）。
8. soul.md 加载注入 + user.md 双向同步。
9. Browser 半：`settings.section` 注入「记忆」分区 + `@Remote` 契约 + 实时同步。
10. `settings` namespace 配置 + 双 Profile。
11. 评估框架与可观测性。
