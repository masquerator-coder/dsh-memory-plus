# DeepSeek Harness 记忆系统插件 · 设计规范

**版本**：v1.2（合并权威版，`merged`）
**前身**：《整体框架设计 v1.0》《UI 设计说明 v1.0》《DSH 上下文管理机制深度分析》《DSH 插件规范适配设计 v1.1》
**定位**：Cordis 双半插件（Host + Browser），为 DSH 提供持久化记忆能力
**规范性质**：本文件是**单一权威规范**，自包含；前四份文档作为演进依据保留于仓库，但实现以下文为准。

> **一句话**：一切记忆降解为**原子事实**；主会话 LLM 不做抽取（后台独立 `ctx.llm.stream`）；**分层异步**执行（同步只投递，重活走 `ctx.jobs`/后台定时）；存储**复用 DSH 原生能力**（`ctx.storageDomain` 领域 KV、`ctx.sessionQuery` 跨会话召回、`ctx.settings` 配置）并**自建轻量向量/关系索引**；soul.md 是配置注入、user.md 是实体卡片渲染视图；UI 通过**浏览器半 + `settings.section` Slot** 注入设置页七大模块。

---

## 目录

1. 概述与设计原则
2. 插件形态与 DSH 规范适配总览
3. 原子事实模型（数据契约）
4. 接入层扩展点（注入 / 观察 / 工具 / 提示）
5. 服务层四引擎（Remember / Recall / Consolidate / Policy）
6. 执行模型（同步快通道 / 异步慢通道 / 子 Agent 例外）
7. 存储层（复用 DSH + 自建模引）
8. soul.md 与 user.md
9. UI 设计（设置页「记忆」分区七大模块）
10. 配置与 Profile
11. 评估指标体系
12. 工程保障与边界问题
13. 插件包结构与双半 package.json
14. 附录：DSH 上下文管理协同与扩展点映射终稿

---

## 1. 概述与设计原则

### 1.1 目标
为 DSH 提供一套**纯插件形态、可组合、可配置、可观测**的持久化记忆系统，使 Agent 跨会话记住用户偏好、项目知识、历史事件与可复用技能。不修改 Harness 源码，只通过 Cordis 服务注册、事件拦截与浏览器 Slot 注入接入。

### 1.2 架构与 UI 设计原则

| 原则 | 含义 | DSH 落点 |
|---|---|---|
| 纯插件形态 | 不改 Harness 源码 | Host 半 `apply(ctx)` + `ctx.effect` 生命周期 |
| 一切记忆降解为原子事实 | 实体卡片是聚合、图谱是连接、程序记忆是序列化 | 原子事实模型（§3） |
| 统一模型、策略配置 | 个人助理/研究 Agent 靠 Profile 区分 | `ctx.settings` namespace + 策略表 |
| 调度优于存储 | 正确时间召回正确记忆 | Recall Engine + `agent/pre-step` 注入 |
| 主会话 LLM 不做抽取 | 抽取永远由独立 LLM 调用 | `ctx.llm.stream` + 后台作业 |
| 分层异步 | 同步只做投递，重活后台 | `ctx.jobs` + 内部任务队列 + `ctx.timer` |
| 主动遗忘 | 衰减与淘汰与存储同等重要 | Consolidate Engine + TTL |
| 透明可控 | 用户能看见并修改/删除系统记住的一切 | Browser 半「记忆管理」模块 |
| 用户主权 | 用户编辑优先级最高（credibility=1.0） | user.md 双向同步 |
| 渐进披露 | 默认只显示核心，高级配置折叠 | UI 七大模块折叠层级 |
| 危险操作需确认 | 删除/重置二次确认 + 可撤销 + 建议备份 | UI 边界约定 |
| 实时反馈 | 异步抽取/聚合有进度提示 | HostObservable + `memory/event` 推送 |
| 不打断对话 | 设置可在对话进行中修改、无需重启 | `ctx.settings` `applies:'live'` |

---

## 2. 插件形态与 DSH 规范适配总览

### 2.1 双半插件
带 UI 的功能插件是**同一个 npm 包、两个入口**（DSH 规范）：

- **Host 半**（node）：`exports["."]`，导出 `export const name` / `export const inject` / `export function apply(ctx): void`。持有权威业务逻辑、持久化、mutation 顺序与异步流水线。
- **Browser 半**（浏览器）：`exports["./client"]` + `dsh.client { platform:'web', inject:[...] }`，负责 UI 注入。通过 Typert **Remote** 调用 Host；通过 **Slots** 组合 React UI。

两半经生成的 Remote（JSON-only）+ 选定转发事件通信；组件**绝不收到 `ctx`**。

### 2.2 DSH 扩展点映射终稿（侧边速查）

| 记忆能力 | DSH 扩展点 | Cordis 机制 |
|---|---|---|
| 检索注入（RAG） | `agent/pre-step` | waterfall |
| 记忆写入（观察对话） | `session/event` + `session/flush` | emit / parallel |
| 工具级即时抽取 | `tools/result` | emit |
| 显式记忆工具 | `ctx.tools.register(defineTool(...))` | Service |
| 隐私拦截 | `tools/pre-execute` / `ctx.tools.guard()` | waterfall / guard |
| 系统提示 | `ctx.systemPrompt.section` / `.context` | Service |
| 记忆服务 API | `ctx.provide('memory', ...)` | Service + inject |
| 存储后端 | `ctx.storageDomain` / `ctx.storage` | Service（json/sqlite）|
| 历史/情景召回 | `ctx.sessionQuery` | Service（全文）|
| 后台抽取/整合 | `ctx.jobs` + `ctx.timer` | Service / timer |
| 独立 LLM 抽取 | `ctx.llm.stream` + `BlockAssembler` | Service |
| Browser UI | `ctx.slots.inject('settings.section', ...)` | Slots（browser 半）|
| Host↔Browser | `@Remote` + `ctx.remote.memory.*` + `memory/event` | Remote / forwarded event |
| 配置 | `ctx.settings.register('memory', schema, {base})` | Service |
| 卸载清理 | `ctx.effect()` | fiber 逆序自动释放 |

**生命周期**：所有注册（服务、工具、事件、提示段、定时器、后台作业）都包在 `ctx.effect()` 内；插件卸载（或 `cordis_stop`/`undefine`）时自动逆序清理全部副作用。

---

## 3. 原子事实模型（数据契约）

### 3.1 定义与三条工程化检验
原子事实是最小、不可再分、自包含的知识单元，须通过：**独立检索测试**（不含其他事实关键词的查询能单独命中）、**独立更新测试**（修改只 supersede 一条）、**独立遗忘测试**（删除精确无副作用）。三条全过才真正原子。

### 3.2 拆分粒度准则
一个谓词一个事实；同一实体紧密属性（语言+版本）内聚为一条；可能在不同场景被独立检索/更新/遗忘的就拆开；拆后信息量过低（仅一个版本号）则合并。

### 3.3 完整 Schema

```json
{
  "id": "fact_01HX...",
  "subject": { "type": "user", "id": "user:alice", "name": "Alice" },
  "predicate": "prefers_diet",
  "object": { "type": "concept", "id": "diet:vegetarian", "name": "素食" },
  "qualifiers": {
    "time": { "valid_from": "2026-09-01", "valid_to": null },
    "location": "上海", "context": "出差期间", "condition": "工作日午餐"
  },
  "content": "Alice 偏好素食，尤其在出差工作日的午餐场景。",
  "type": "semantic",
  "scope": "user:alice",
  "source": { "type": "conversation", "uri": "session:abc123#7", "extracted_by": "llm:deepseek-v3", "credibility": 0.9 },
  "confidence": 0.85,
  "version": 2,
  "supersedes": "fact_01HW...",
  "semantic_key": "<fnv1a 哈希>",
  "status": "active",
  "privacy": "private",
  "ttl": "180d",
  "embedding": [0.01, 0.02],
  "entities": ["user:alice", "diet:vegetarian"],
  "tags": ["偏好", "饮食"],
  "created_at": "2026-09-05T14:30:00Z",
  "updated_at": "2026-09-06T09:00:00Z"
}
```

（`src/model/fact.ts` 是此 schema 的可编译类型化实现。）

### 3.4 关键字段语义
- **subject/predicate/object**：结构化断言核心，支撑精确查询与关系推理。
- **qualifiers**：限定条件，防止过度泛化。
- **content**：唯一直接注入 Prompt 的自然语言表述。
- **type**：`semantic` / `episodic` / `procedural`，决定检索来源、遗忘策略、排序权重。
- **scope**：业务隔离（`user:*` / `project:*` / `agent:soul`）；DSH 侧叠加 Agent 维度做顺序性。
- **source**：`conversation` / `user_edit` / `document` / `llm_inference`，`uri` 指向 SessionEvent 日志坐标 `session:<id>#<seq>`。
- **confidence vs source.credibility**：两者独立；`confidence`=为真的概率，`credibility`=来源可信度（用户亲口说 > LLM 推断 > 外部文档）。
- **version/supersedes**：改口是演进而非删除。
- **semantic_key**：去重标识，`hash(subject.id|predicate|object.id|qualifier_signature)`（见 3.5）。
- **status**：`active` / `superseded` / `archived` / `disputed` / `expired`。
- **ttl**：强/弱遗忘配置入口。
- **embedding**：content 的向量（DSH 无内置向量库，自建 `VectorIndex` 生成/存储）。

### 3.5 语义键与去重
`semantic_key = fnv1a(subject.id | predicate | object.id | qualifier_signature)`；`qualifier_signature` 是 qualifiers 的规范化（排序/递归 canonicalize）签名。两条 key 相同 → 同一断言的不同版本/来源；冲突按 confidence/credibility/event_time 决定保留哪条。避免"喜欢素食"与"偏好素食"成为两条（要求抽取时归一为相同 subject.id/predicate/object.id）。`src/model/semantic-key.ts` 为可运行实现。

### 3.6 各类型差异
- **语义记忆**：重结构，TTL 长。
- **情景记忆**：+ `event_time` / `participants` / `outcome` / `duration` / `artifacts`。
- **程序记忆**：+ `steps` / `preconditions` / `tool_chain` / `success_rate`。
- **工作记忆**：不入库，仅在上下文内。

---

## 4. 接入层扩展点

### 4.1 检索注入（RAG）—— `agent/pre-step`
在瀑布中把检索到的记忆作为 `UserMessage` 追加进 `decision.messages`（不覆盖整段，只在 `next()` 结果上追加）：

```ts
ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
  const decision = await next()
  if (decision.kind === 'reject' || signal.aborted) return decision
  const facts = await memory.recall({ query: lastUserText(messages), scope: scopeOf(agent), topK: 5 })
  if (facts.length === 0) return decision
  const ctxMsg = createUserMessage({ content: [{ type:'text', text: renderMemoryBlock(facts) }],
    source: { kind:'plugin', plugin:'dsh-memory', form:'instructions' } })
  return { ...decision, messages: [...decision.messages, ctxMsg] }
})
```

### 4.2 记忆写入观察—— `session/event` + `session/flush`
`session/event` 是 **post-commit fire-and-forget** 增量 feed，观察 `assistant/message` / `tool/result` / `turn/end`，**同步只投递**；`session/flush` 是 `parallel`（所有监听器被 await），作为**异步写库的可持续检查点**，在此调 `ctx.jobs.start()` 后台抽取。另可选 `tools/result` 做工具级即时抽取；`agent/turn-stopping`（serial）做整轮收尾但应避免阻塞。

### 4.3 显式记忆工具 —— `ctx.tools.register(defineTool(...))`
`memory_recall` / `memory_remember` / `memory_forget` / `memory_link`（可并入 build)/ `read_user_profile`。注意模型侧只见 `{name, description, parameters}`；执行/展示回调绝不外泄；返回值经 `output.schema` 校验后由 `render()` 投影为 `ContentBlock[]`。`memory_remember` 参数是**原始内容**（主 LLM 只委托，抽取在后台）。

### 4.4 系统提示注入 —— `ctx.systemPrompt`
- 记忆意识（静态段）：`section({name:'memory-awareness', order, text})`。
- 用户画像摘要（动态）：`context({name, order, text:(ctx)=>...})`——带来源 user-role 快照，适合 RAG、可被 compaction 处理。
- soul.md 核心人格：`section` 常驻、order 低；扩展设定走记忆检索。

### 4.5 隐私拦截 —— `tools/pre-execute` / `ctx.tools.guard()`
`tools/pre-execute` 返回 `{kind:'allow'|'deny'|'ask'}`；`ctx.tools.guard()` 单调守卫（只能收窄）。敏感记忆写入前 `ask`。

---

## 5. 服务层四引擎

### 5.1 Remember Engine：抽取 → 验证 → 存储 → 关联
```
输入（原始内容/工具结果/文档）
  → ① LLM 抽取（约束提示词，独立 ctx.llm.stream 调用；一个谓词一个事实、属性内聚、自包含、标注 type/confidence/qualifiers）
  → ② 程序化验证（三元组完整性 / semantic_key 去重 / 粒度异常 / 自包含性[LLM 判断]）
  → ③ 存储（KV 主记录 + 自建向量 embedding + 关系边）
  → ④ 关联与冲突消解（同 key：按 confidence/credibility/event_time supersede 或并存；异 key：建图边）
```
验证失败处置：三元组不完整→丢弃/待人工审核；key 重复→冲突消解；粒度异常→回退 LLM 重拆；自包含不通过→补上下文重抽。
`src/engines/remember.ts` 为可运行的纯逻辑实现（validate → rebuildFact → resolveConflict → put+index）。

### 5.2 Recall Engine：向量召回 → 过滤 → 去重 → 图扩展 → 策略排序
```
query
  → ① 向量召回 top-K（自建 VectorIndex）
  → ② 过滤（scope / status=active / ttl 未过期 / privacy）
  → ③ semantic_key 去重（保留最高分版本）
  → ④ 以 entities 为种子沿关系边扩 1-2 跳
  → ⑤ 策略排序（score = w1·relevance + w2·confidence + w3·credibility + w4·recency）
  → 返回 top-N（content 渲染注入 Prompt）
```
`src/engines/recall.ts` 为可运行实现。

### 5.3 Consolidate Engine：整合与遗忘（后台定时）
去重合并（同 key 保留最高 confidence，其余 archived）、冲突解决（latest_wins / mark_conflict / confidence_based）、实体卡片聚合、衰减（TTL/confidence 降权，过期→ expired）、摘要压缩（细粒度聚合为高层摘要事实，保留溯源链接）。`src/engines/consolidate.ts` 为可运行实现。

### 5.4 Policy Engine
策略不硬编码，从 Agent Profile（`ctx.settings` 组合 base 层）读取，差异全收敛到配置。

---

## 6. 执行模型（分层异步）

主会话路径同步、主 LLM 只对话 + 工具委托；后台独立 LLM 抽取。阶段切分：

| 阶段 | 执行位置（DSH） |
|---|---|
| 事件捕获 | 同步 `session/event` 只投递 |
| 快通道 A（显式工具委托） | 同步 `memory_remember`（参数为原始内容）|
| 快通道 B（规则匹配） | 同步 `session/event` 正则命中触发词即投递 |
| 慢通道抽取 | 异步 `ctx.jobs.start()` 携带上下文快照 |
| 程序化验证 | 异步 纯函数 |
| 自包含性检查 | 异步 LLM 批量判断 |
| 存储写入 | 异步 `ctx.storageDomain` |
| 关联与建边 | 异步 关系索引 |
| 冲突消解 | 异步 per-scope 串行比对 |
| 实体卡片聚合 / 摘要 / 遗忘 | 后台定时 `ctx.timer` |

**结论**：抽取/验证/存储/建边 → 后台作业，不用子 Agent；*程序记忆归纳（从多次操作抽象 SOP）* 这类复杂多步任务才用子 Agent。后台作业用 `ctx.jobs.start()`（自带按 owner 准入与并发上限），不自行实现全局队列——DSH 无通用 workqueue 原语。

---

## 7. 存储层

### 7.1 一条原子事实的 DSH 存储分布

| 存储 | 存什么 | DSH 落点 |
|---|---|---|
| KV 主记录 | 全部字段 | `ctx.storageDomain`（`KvTable`，zod schema，json/sqlite 后端）|
| 向量段 | content embedding | 自建 `VectorIndex`（存同域表，进程内余弦）|
| 关系边 | subject-[predicate]->object | 自建 `edges` 表（`ctx.storageDomain` 域表）|
| 对象/来源 | 原始对话快照 | `ctx.sessionQuery` 检索原文 / spill |

### 7.2 向量检索：自建轻量方案
DSH **无内置向量库**。方案 A（个人助理默认）：embedding 存 `ctx.storageDomain` 域表，检索时按 scope 分桶 + 进程内余弦相似度 top-K（中千条规模足够）。方案 B（研究 Agent）：包装 `VectorIndex` 接口接外部向量后端。embedding 生成经 `ctx.llm.stream` 调 embedding 能力（`ctx.llm` 无 `chat()`，`stream` + `BlockAssembler` 折叠）。

### 7.3 历史/情景召回
复用 `ctx.sessionQuery`（全文检索 + 事件读取 + 血缘追踪）作为情景记忆的落库前检索与审计回溯。

---

## 8. soul.md 与 user.md

### 8.1 职责边界
- **soul.md = 配置**（Agent 人格，静态，变化极低），不走记忆流水线，注入系统提示（核心常驻、扩展走检索）。
- **user.md = 视图**（用户画像，底层是原子事实的实体卡片渲染），不做独立存储文件，避免双写冲突、失去原子性、无法溯源。

### 8.2 soul.md 注入
```
soul.md:
  ## 核心人格（始终注入, section, order 低）
  ## 交互风格（始终注入）
  ## 边界（始终注入）
  ## 扩展设定（按需检索, 不默认注入 → memory:scope=agent:soul#extended）
```
注入用 `ctx.systemPrompt.section`（`priority:'low'`，不覆盖核心指令），分层避免 Token 膨胀。

### 8.3 user.md 双向同步
- 正向：对话抽取新事实 → 触发实体卡片聚合 → 重渲染 user.md（可通知"画像已更新"）。
- 反向：用户编辑 user.md → 解析变更 → 按 `semantic_key` 比对 → 新增（`source=user_edit, credibility=1.0`）/ 修改（supersede）/ 删除（archived）。
- **用户编辑永远胜出**：`credibility=1.0`，冲突时优先。
- 并发：渲染时 `settings` 用 `revision` 抵御并发编辑；用户编辑优先、系统聚合延后。

### 8.4 摘要注入策略
`摘要前置 + 工具按需`：核心摘要常驻（200 token 内，`ctx.systemPrompt.context`），详情用 `read_user_profile` 工具或请求前置注入按需查。

---

## 9. UI 设计（设置页「记忆」分区）

### 9.1 位置与装配（Browser 半）
DSH 设置页是 Slot 组合：`sidebar.settings → settings.section → 各分区`。记忆插件注册 `settings.section` 分区 `id:'memory'`，`SettingsRoot` 自动投影为左侧导航行并渲染。分区内部用「子导航 + 内容区」承载七大模块。

```
DSH 设置 › 记忆  [总开关 ●]
├── 概览 │ 人格(soul) │ 用户画像(user) │ 记忆管理 │ 提示词注入 │ 备份恢复 │ 高级设置
```
顶部**总开关**：禁用后不注入/不抽取/不检索，但保留数据；状态有明确视觉反馈。

```ts
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section', id: 'memory', order: 50,
  label: () => t('memory.nav'), locale: 'memory',
  inject: () => ({ hooks: { stats, facts }, onToggle, onSearch }),
}, MemorySettingsSection))
```

### 9.2 七大模块要点
| 模块 | 职责 | 关键交互 |
|---|---|---|
| 概览 | 记忆总数/本周新增/存储占用/类型分布/最近活动/系统状态（抽取队列、后端健康）| 数字卡点击跳转；异步流水线进度 |
| 人格 soul.md | 注入模式（核心/完整）、Markdown 编辑、Token 预览、导入导出 | 热重载；核心不能空、超限警告、mtime 冲突提示 |
| 用户画像 user.md | 编辑/预览/溯源三模式、变更摘要、ChangeSummary 确认 | 溯源抽屉显示底层事实（id/谓词/置信度/来源/版本）；编辑回写原子事实；用户主权 |
| 记忆管理 | 搜索/类型/范围/状态/置信度/时间/来源筛选、分页、单条编辑抽屉、批量操作 | 删除二次确认 + 影响提示；批量导出 JSON/MD/CSV |
| 提示词注入 | 各注入段独立启用/禁用、变量插值、注入位置、实时预览 + Token 统计 | `{{user.name}}` / `{{top_preferences}}` |
| 备份恢复 | 手动导出（JSON 完整 / Markdown 可读）、恢复（合并/覆盖/补充）、自动备份（频率/保留/位置）| 恢复前差异预览 + 可撤销 |
| 高级设置 | 抽取（模型/粒度/每轮上限/自包含/粒度检测）、检索（topK/图跳数/排序权重）、遗忘（TTL/冲突策略/衰减）、隐私（加密/scope 隔离/跨设备）、危险区（重置）| 重置输入 "RESET" + 建议先导出 |

### 9.3 数据通路与实时同步
- **Remote**：Host `@Remote('name')` → Browser `ctx.remote.memory.<method>`（JSON-only）。
- **实时**：Host `this.ctx.emit('memory/event', {...})`（`fact/created`/`superseded`/`consolidation/completed`/`profile/updated`）→ Browser `ctx.remote.$on('memory/event', fn)`；或 **HostObservable** + `useX(selector)`（uSES）。列表/概览权威态必须可经 `query`/`stats` 重拉（DSH 转发事件**不重放**，不能作唯一真相源）。
- **组件不接 `ctx`**，只收 `PropsRuntime`/`InjectFace`/`PropsLocale`/`PropsRenderSlots` + 标准 hooks。

### 9.4 可访问性与国际化
键盘导航、ARIA、WCAG AA、`prefers-reduced-motion`、焦点管理；`ctx.locale.register('memory', {zh,en})` + `PropsLocale` 收 `t()`。

---

## 10. 配置与 Profile

配置文件载体：`ctx.settings.register('memory', schema, {base: profiles[p], applies:'live'})`，`scope.watch()` 响应变更；Profile 作为组合 base 层，用户覆盖叠加其上。两份预置：

### 10.1 个人助理 Profile（要点）
`injectMode:'core-only'`、user.md 自动注入（intent:user-related，summaryTokens:200）、抽取 model deepseek-v3 / maxFacts 8 / granularity medium、requireSelfContained true、storage（vector local / graph sqlite / kv sqlite）、retrieval（sources [semantic,episodic]，topK 5，timeDecay strong，ranking [recency,confidence]）、forgetting（defaultTTL 30d / sensitiveTTL 7d / latest_wins）、privacy（encrypt true / strict）。

### 10.2 研究 Agent Profile（要点）
`userProfile.autoInject: false`、maxFacts 20 / granularity fine、requireSourceTrace true、storage（vector external / graph neo4j? / kv postgres）、retrieval（sources [project_semantic,knowledge_graph,episodic]，graphExpansion 2，ranking [source_credibility,relevance,recency]）、forgetting（defaultTTL never / versioning true / mark_conflict）、privacy（shareWith project_members）。

> 图后端 neo4j/kùzu 与外部向量属于方案 B 演进；第一版统一用 `ctx.storageDomain`（sqlite）+ 自建向量/关系索引（见 §7）。

---

## 11. 评估指标体系

| 指标 | 定义 |
|---|---|
| 抽取准确率 | 抽取事实与人工标注一致比例 |
| 原子性合规率 | 通过三条独立测试比例 |
| 去重准确率 | semantic_key 判重与人工一致率 |
| 检索命中率 | 相关事实被召回比例 |
| 冲突处理正确率 | supersede / mark_conflict 决策正确率 |
| 遗忘精确率 | 删除操作无误伤比例 |
| 记忆保持力 | 多轮无关对话后仍能回忆 |
| 回溯能力 | 随对话深度增加的有效回溯距离 |
| 时间推理 | 理解事件时间顺序（qualifiers）|
| 隐私合规 | 敏感信息未泄露比例 |

Profile 权重：个人助理 = 隐私 > 偏好准确 > 时间推理；研究 Agent = 来源可溯 > 冲突处理 > 回溯能力。

---

## 12. 工程保障与边界问题

- **顺序性**：同 scope supersede 链必须串行 → `ctx.jobs` 按 owner 准入/串行 + per-scope 队列（或乐观锁 + version 校验）。
- **幂等性**：`semantic_key` 去重是幂等天然保障（事件重放/重复抽取安全）。
- **快慢通道冲突**：慢通道发现既存 → supersede；发现粒度更细 → 新建 + 旧标 coarse。
- **可观测性**：全链路追踪（事件 id → jobs id → 验证 → 写入 → 冲突决策），`ctx.logger` + `memory/event` 推送。
- **背压**：队列水位过高 → 降级"只抽取不验证"或按 scope 优先级丢弃低价值事件。
- **双向同步并发**：渲染加锁或用户编辑优先、系统聚合延后；用户编辑 `credibility=1.0` 保证冲突胜出。
- **compaction 兼容**：注入的检索段是独立 UserMessage，不覆盖整段消息，避免破坏 compaction 尾巴保留与稳定性；`ctx.systemPrompt.context` 注入可被 compaction 处理。

---

## 13. 插件包结构与双半 package.json

```
dsh-memory/
├── package.json            # exports["."]=Host, exports["./client"]=Browser, dsh.client
├── tsconfig.json / tsconfig.model.json
├── src/
│   ├── index.ts            # Host apply：组装 + 扩展点注册
│   ├── service.ts          # MemoryService（纯逻辑，可独立编译）
│   ├── model/  fact.ts · semantic-key.ts · validator.ts    （纯 TS）
│   ├── engines/  remember.ts · recall.ts · consolidate.ts  （纯 TS）
│   ├── storage/  store.ts(窄接口+内存实现,纯TS) · kv.ts · vector.ts
│   ├── adapters/  pre-step.ts · session.ts · tools.ts · privacy.ts · util.ts
│   ├── remote/  index.ts   # MemoryRemote @Remote 契约
│   ├── profile/  soul.ts · user-view.ts
│   ├── entities/  card.ts · renderer.ts
│   └── client/  index.ts · MemorySettingsSection.tsx · panels/* · locales.ts
├── example/run.mjs         # 最小可运行闭环（零 @deepseek-ai 依赖）
├── lib/  lib/index.js · lib/client.js · lib/types/**   # 构建产物
└── docs/  implementation.md
```

### package.json 关键字段
```jsonc
{
  "main": "lib/index.js", "types": "lib/types/index.d.ts",
  "exports": {
    ".":        { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": { "client": { "inject": ["dsh-client-ui-slots","dsh-client-ui-settings","dsh-client-locale","dsh-api-remotes"], "platform": "web" } },
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

## 14. 附录：上下文管理协同与现状

DSH 以**事件溯源**管理上下文：对话全量沉淀于 append-only `SessionEvent` 日志，模型"看见"的历史由日志推导（surface）。记忆插件与之协同：

| 上下文机制 | 与记忆系统的关系 |
|---|---|
| system-prompt 组装 | 记忆意识/画像摘要经 `ctx.systemPrompt.section/context` 注入 |
| 事件日志（user/assistant/tool）| 记忆写入的观察源（`session/event`）与 `source.uri` 坐标 |
| token-meter + compaction | 注入的检索段须可被 compaction 处理（独立 UserMessage）|
| spill（超大内容外置）| 记忆原文快照可落 spill，`source.uri` 引用 |
| session-query（跨会话检索）| 情景/历史记忆召回落点 |
| 持久化 | `session/flush` 作为异步写库检查点，flushing 语义对齐 |

### 核心设计要点回顾
1. 原子事实是数据契约；主会话 LLM 不做抽取；分层异步执行。
2. 混合存储：KV 主记录 + 自建向量 + 关系边 + 原文引用；复用 `ctx.storageDomain`/`ctx.sessionQuery`。
3. soul.md 是配置、user.md 是视图；策略配置化（Profile）；主动遗忘。
4. 双半插件符合 DSH 规范：Host 权威逻辑 + Browser Slot UI + Remote 通信 + `ctx.effect` 生命周期。
5. 唯一自建缺口：向量/关系索引（DSH 无内置）；其余（存储、跨会话召回、后台作业、独立 LLM、配置）均原生复用。

### 实现顺序
1. MemoryService + 原子事实类型（zod 直供 `ctx.storageDomain`）。
2. KV 表 + 基础 remember/recall（`src/engines` 纯逻辑已可跑）。
3. `agent/pre-step` 注入 + `systemPrompt.context` 摘要。
4. `memory_*` 工具（`defineTool`）。
5. `session/event`+`flush` 观察 + `ctx.jobs` 后台抽取。
6. 自建向量索引 + 混合检索 + 关系边。
7. Consolidate + 遗忘（`ctx.timer`）。
8. soul.md + user.md 双向同步。
9. Browser 半 `settings.section` + `@Remote` + 实时同步。
10. `settings` namespace + 双 Profile。
11. 评估与可观测性。

---
*本规范的纯逻辑核心有可直接运行的最小实现，见 `example/run.mjs`（抽取→验证→语义键→冲突 supersede→召回最新版本→精确遗忘）；接口层落地要点见 `docs/implementation.md`。*
