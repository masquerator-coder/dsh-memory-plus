# DeepSeek Harness 记忆系统插件 · 完整设计说明

**版本**：v1.0
**状态**：设计稿
**定位**：Cordis 插件，为 DSH 提供持久化记忆能力

---

## 目录

1. 概述与设计原则
2. 整体架构
3. 原子事实模型（底层基础）
4. Extension Adapter Layer（接入层）
5. Memory Service Layer（服务层）
6. 执行模型（同步 / 异步 / 子 Agent）
7. Storage Layer（存储层）
8. soul.md 与 user.md 设计
9. 插件包结构
10. 配置与 Profile
11. 评估指标体系
12. 工程保障与边界问题
13. 附录：与 DSH 扩展点映射

---

## 1. 概述与设计原则

### 1.1 目标

为 DSH 提供一套**可组合、可配置、可观测**的持久化记忆系统，使 Agent 能够跨越会话记住用户偏好、项目知识、历史事件和可复用技能。

### 1.2 设计原则

| 原则                       | 含义                                                    |
| -------------------------- | ------------------------------------------------------- |
| **纯插件形态**             | 不修改 Harness 源码，通过 Cordis 服务注册和事件拦截接入 |
| **一切记忆降解为原子事实** | 实体卡片是聚合，图谱是连接，程序记忆是序列化            |
| **统一模型、策略配置**     | 底层对象模型统一，个人助理/研究 Agent 通过 Profile 区分 |
| **调度优于存储**           | 核心能力是在正确时间召回正确记忆，而非存储所有数据      |
| **主会话 LLM 不做抽取**    | 抽取永远由独立 LLM 调用完成，避免注意力分散             |
| **分层异步**               | 同步只做低延迟投递，重活与全局操作在后台完成            |
| **主动遗忘**               | 衰减和淘汰机制与存储同等重要                            |

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                    DSH Runtime (Cordis)                       │
│  Agent Loop │ Session Log │ Tool Registry │ System Prompt    │
└──────┬────────────┬──────────────┬────────────────┬──────────┘
       │            │              │                │
       ▼            ▼              ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│              Extension Adapter Layer (接入层)                 │
│  agent/request │ session/event │ tools/pre-execute │ prompt   │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Memory Service Layer (服务层)                    │
│  Recall Engine │ Remember Engine │ Consolidate Engine        │
│                     Policy Engine                            │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Storage Layer (存储层 · 混合后端)                │
│  Vector Store │ Graph Store │ KV/Relational │ Object Store    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│         Atomic Fact Model (原子事实模型 · 数据契约)            │
│   subject-predicate-object + qualifiers + metadata           │
│   所有记忆的唯一最小单元，贯穿抽取/存储/检索/遗忘全流程         │
└──────────────────────────────────────────────────────────────┘
```

**核心原则：一切记忆最终都降解为原子事实。** 原子事实是整个系统的“细胞”，上层所有引擎、存储、策略都围绕它构建。

---

## 3. 原子事实模型（底层基础）

### 3.1 定义

原子事实是从对话或环境中提取出的**最小、不可再分、自包含**的知识单元，必须同时满足：

1. **不可再分**：无法拆成两个独立有意义的子事实。
2. **自包含**：脱离上下文也能被独立理解。
3. **可独立检索**：单独存在时能被语义检索命中。

### 3.2 反例与正例

```
❌ 复合陈述：
"用户的项目用 Go 1.22，数据库用 PostgreSQL 16，ORM 用 GORM，部署在阿里云 ACK 上"
```

拆为四条原子事实：

```
✅ 用户的项目编程语言是 Go 1.22
✅ 用户的项目数据库是 PostgreSQL 16
✅ 用户的项目 ORM 框架是 GORM
✅ 用户的项目部署环境是阿里云 ACK
```

### 3.3 三条工程化检验

| 检验             | 方法                           | 通过标准          |
| ---------------- | ------------------------------ | ----------------- |
| **独立检索测试** | 用不含其他事实关键词的查询检索 | 能单独命中        |
| **独立更新测试** | 修改该事实是否只影响自身       | 只 supersede 一条 |
| **独立遗忘测试** | 删除该事实是否精确无副作用     | 不误伤其他事实    |

三条全部通过，才算真正原子。

### 3.4 拆分粒度准则

| 准则             | 说明                                             |
| ---------------- | ------------------------------------------------ |
| 一个谓词一个事实 | 每条只表达一个 `subject-predicate-object` 三元组 |
| 属性内聚         | 同一实体的紧密属性（如语言+版本）合并为一条      |
| 场景可分离       | 可能在不同场景被独立检索/更新/遗忘的，就拆开     |
| 信息密度阈值     | 拆开后信息量过低（如只有一个版本号），考虑合并   |

### 3.5 完整 Schema

```json
{
  "id": "fact_01HX...",
  "subject": { "type": "user", "id": "user:alice", "name": "Alice" },
  "predicate": "prefers_diet",
  "object": { "type": "concept", "id": "diet:vegetarian", "name": "素食" },
  "qualifiers": {
    "time": { "valid_from": "2026-09-01", "valid_to": null },
    "location": "上海",
    "context": "出差期间",
    "condition": "工作日午餐"
  },
  "content": "Alice 偏好素食，尤其在出差工作日的午餐场景。",
  "type": "semantic",
  "scope": "user:alice",
  "source": {
    "type": "conversation",
    "uri": "session:abc123#turn-7",
    "extracted_by": "llm:deepseek-v3",
    "credibility": 0.9
  },
  "confidence": 0.85,
  "version": 2,
  "supersedes": "fact_01HW...",
  "semantic_key": "hash(user:alice|prefers_diet|diet:vegetarian|sig)",
  "status": "active",
  "privacy": "private",
  "ttl": "180d",
  "embedding": [0.01, 0.02, ...],
  "entities": ["user:alice", "diet:vegetarian"],
  "tags": ["偏好", "饮食"]
}
```

### 3.6 关键字段说明

| 字段                       | 作用           | 设计理由                                            |
| -------------------------- | -------------- | --------------------------------------------------- |
| `subject/predicate/object` | 结构化断言核心 | 支持图存储、精确查询、关系推理                      |
| `qualifiers`               | 限定条件       | 防止过度泛化，让一条事实可粗可细                    |
| `content`                  | 自然语言表述   | 直接注入 Prompt，LLM 可直接消费                     |
| `type`                     | 记忆类型       | 决定检索来源、遗忘策略、排序权重                    |
| `scope`                    | 隔离边界       | 个人/项目/组织级隔离，权限控制基础                  |
| `source`                   | 来源溯源       | 研究 Agent 刚需，个人助理用于判断可信度             |
| `confidence`               | 置信度         | 冲突解决、衰减、排序的核心输入                      |
| `version/supersedes`       | 版本演进       | 支持改口场景，保留历史而非删除                      |
| `semantic_key`             | 去重标识       | 判断两条事实是否“同一条”的语义键                    |
| `status`                   | 生命周期状态   | active / superseded / archived / disputed / expired |
| `ttl`                      | 过期策略       | 强遗忘 vs 弱遗忘的配置入口                          |
| `embedding`                | 语义检索       | 向量召回的必需字段                                  |

### 3.7 语义键与去重

```
semantic_key = hash(subject.id + predicate + object.id + qualifier_signature)
```

- `qualifier_signature` 是对 qualifiers 规范化（排序后哈希）的摘要。
- 两条事实 `semantic_key` 相同，视为同一断言的不同版本或不同来源。
- 冲突解决时按 `confidence`、`source.credibility`、`event_time` 决定保留哪条。
- 避免“Alice 喜欢素食”和“Alice 偏好素食”被当成两条不同事实。

### 3.8 版本化：改口是演进，不是删除

```
旧事实: status = "superseded", valid_to = 变更时间
新事实: version = 旧.version + 1, supersedes = 旧.id
```

- 个人助理：默认只检索 `status = active`，保留历史用于审计。
- 研究 Agent：可检索所有版本，分析观点演变或矛盾。

### 3.9 置信度与来源分离

`confidence` 和 `source.credibility` 是两个独立维度：

- `source.credibility`：来源本身的可信度（用户亲口说 > LLM 推断 > 外部文档）。
- `confidence`：这条事实为真的概率，综合来源、抽取质量、后续验证。

排序分数：

```
score = w1 * relevance + w2 * confidence + w3 * source.credibility + w4 * recency
```

### 3.10 各记忆类型的原子事实差异

| 记忆类型     | 示例                                    | 核心字段差异                         |
| ------------ | --------------------------------------- | ------------------------------------ |
| **语义记忆** | `Alice prefers_diet vegetarian`         | 重 subject/predicate/object，TTL 长  |
| **情景记忆** | `Alice 在 2026-09-05 完成了项目 X 部署` | 重 event_time、participants、outcome |
| **程序记忆** | `部署流程：先跑测试，再灰度，再全量`    | 重 steps、preconditions、tool_chain  |
| **工作记忆** | 当前对话轮次、工具返回结果              | 不入库，仅在上下文内                 |

**情景记忆扩展字段：**

```json
{
  "type": "episodic",
  "event_time": "2026-09-05T14:30:00Z",
  "participants": ["user:alice", "agent:assistant"],
  "outcome": "success",
  "duration": "45m",
  "artifacts": ["deploy:prod-v2.3"]
}
```

**程序记忆扩展字段：**

```json
{
  "type": "procedural",
  "steps": ["run_tests", "canary_deploy", "full_deploy"],
  "preconditions": ["tests_passed", "approval_granted"],
  "tool_chain": ["ci.run", "k8s.canary", "k8s.rollout"],
  "success_rate": 0.92
}
```

### 3.11 原子事实与上层结构的关系

```
原子事实（最小断言）
    │
    ├── 聚合 → 实体卡片（某实体的画像摘要）
    │
    ├── 连接 → 记忆图谱（实体间关系网络）
    │
    └── 沉淀 → 程序记忆（可复用技能/SOP）
```

**原子事实的拆分质量直接决定上层聚合和图谱的准确性。**

---

## 4. Extension Adapter Layer（接入层）

### 4.1 检索注入：`agent/request` waterfall

```typescript
ctx.on('agent/request', async (request, next) => {
  const memories = await ctx.memory.recall({
    query: request.messages.at(-1)?.content,
    scope: ctx.scopeOf().tag,
    topK: ctx.memory.policy.retrieval.topK
  })

  if (memories.length > 0) {
    request.messages.unshift({
      role: 'system',
      content: renderMemoryBlock(memories)  // 渲染原子事实的 content
    })
  }

  return next(request)
})
```

### 4.2 记忆写入：`session/event` 观察者

```typescript
ctx.on('session/event', async (event) => {
  if (event.type === 'assistant/settlement') {
    await ctx.memory.extractAndRemember({
      content: event.content,
      scope: ctx.scopeOf().tag,
      source: { type: 'conversation', sessionId: event.sessionId }
    })
  }
})
```

### 4.3 工具注册：显式记忆管理

| 工具名              | 功能               | 对应 API                       |
| ------------------- | ------------------ | ------------------------------ |
| `memory_recall`     | 检索相关原子事实   | `recall(query, scope, topK)`   |
| `memory_remember`   | 显式写入原子事实   | `remember(fact, scope)`        |
| `memory_forget`     | 删除或归档原子事实 | `forget(factId, mode)`         |
| `memory_link`       | 建立事实间关系     | `link(fromId, toId, relation)` |
| `read_user_profile` | 读取用户画像详情   | `entity.getCard(scope)`        |

### 4.4 系统提示注入：`system-prompt.section`

```typescript
ctx.systemPrompt.section({
  name: 'memory-awareness',
  content: `You have persistent memory stored as atomic facts. 
            Use memory_recall to retrieve relevant facts, 
            and memory_remember to store important facts, preferences, or decisions.`
})
```

### 4.5 扩展点映射

| 记忆能力     | DSH 扩展点               | Cordis 机制      |
| ------------ | ------------------------ | ---------------- |
| 检索注入     | `agent/request`          | waterfall        |
| 记忆写入     | `session/event`          | emit（观察者）   |
| 显式工具     | `ctx.tools.register()`   | Service          |
| 系统提示     | `system-prompt.section`  | Service          |
| 压缩保护     | `agent/pre-step`         | waterfall        |
| 隐私拦截     | `tools/pre-execute`      | waterfall        |
| 记忆服务 API | `ctx.set('memory', ...)` | Service + inject |

---

## 5. Memory Service Layer（服务层）

```typescript
export class MemoryService extends Service {
  static inject = ['tools', 'sessions']

  async recall(query: RecallQuery): Promise<Memory[]>
  async remember(input: RememberInput): Promise<MemoryId>
  async forget(memoryId: string, mode: ForgettingMode): Promise<void>
  async consolidate(scope: string, strategy: string): Promise<void>
  async link(fromId: string, toId: string, relation: string): Promise<void>
  async extractAndRemember(input: ExtractInput): Promise<Fact[]>
}
```

### 5.1 Remember Engine：抽取 → 验证 → 存储 → 关联

```
输入：对话内容 / 工具结果 / 外部文档
  │
  ▼
① LLM 抽取（约束提示词，独立模型调用）
  │  规则：一个谓词一个事实、紧密属性内聚、自包含、标注 type/confidence/qualifiers
  ▼
② 程序化验证
  │  - 三元组完整性检查
  │  - semantic_key 去重（与已有事实比对）
  │  - 粒度异常检测（object 含多实体 / content 含多谓词）
  │  - 自包含性检查（LLM 判断脱离上下文能否理解）
  ▼
③ 存储（多后端写入）
  │  KV 主记录 + Vector embedding + Graph 边
  ▼
④ 关联与冲突消解
     - 相同 semantic_key：按 confidence / credibility / event_time 决定 supersede 或并存
     - 不同 semantic_key：建立图关系边
```

**抽取提示词核心约束：**

```text
从以下对话中抽取原子事实。规则：
1. 每条事实只包含一个 subject-predicate-object 三元组。
2. 同一实体的紧密属性（如语言及其版本）保留在同一条。
3. 不同实体、不同谓词的信息必须拆分为独立事实。
4. 每条事实必须自包含，脱离对话上下文也能理解。
5. 为每条事实标注：type、confidence（0-1）、qualifiers。

输出 JSON 数组，每条包含：
{ subject, predicate, object, qualifiers, content, type, confidence }
```

**验证失败的处置：**

| 失败类型          | 处置                   |
| ----------------- | ---------------------- |
| 三元组不完整      | 丢弃或标记为待人工审核 |
| semantic_key 重复 | 进入冲突消解流程       |
| 粒度异常          | 回退 LLM 重新拆分      |
| 自包含性不通过    | 回退补充上下文后重抽   |

### 5.2 Recall Engine：向量召回 → 图扩展 → 策略排序

```
query
  │
  ▼
① 向量召回：embedding → Vector Store top-K
  │
  ▼
② 过滤：scope / status=active / ttl 未过期 / privacy
  │
  ▼
③ 去重：按 semantic_key 合并同键不同版本，保留最高分
  │
  ▼
④ 图扩展：以命中事实的 entities 为种子，沿关系边扩展 1-2 跳
  │
  ▼
⑤ 策略排序：按 Profile 配置的 ranking 权重重新打分
  │
  ▼
返回 top-N 原子事实（渲染为 content 注入 Prompt）
```

### 5.3 Consolidate Engine：整合与遗忘

异步运行，操作对象是原子事实：

- **去重合并**：semantic_key 相同的多条事实，保留最高 confidence，其余标记 `status=archived`。
- **冲突解决**：按 Policy 决定 `latest_wins` / `mark_conflict` / `confidence_based`。
- **实体卡片聚合**：将同一 subject 的多条原子事实汇总为实体画像摘要。
- **衰减**：按 TTL 和 confidence 对事实降权，过期的标记 `status=expired`。
- **摘要压缩**：将多条细粒度事实聚合为高层摘要事实（保留溯源链接）。

### 5.4 Policy Engine：策略配置化

策略不硬编码，从 Agent Profile 读取。差异全部收敛到配置。

---

## 6. 执行模型（同步 / 异步 / 子 Agent）

### 6.1 核心结论

**不应该全部放在主会话同步执行，也不应该全部丢给平行子 Agent。** 按阶段切分：**上下文强依赖且低延迟的做同步快通道，重活和全局活做异步慢通道**，子 Agent 是例外而非默认。

### 6.2 逐阶段决策

| 阶段            | 上下文依赖 | 延迟敏感 | 需要全局视野 | 执行方式                       |
| --------------- | ---------- | -------- | ------------ | ------------------------------ |
| 事件捕获        | 高         | 低       | 无           | 同步（零成本，只投递事件）     |
| 快通道投递      | 高         | 高       | 无           | 同步（规则匹配 / 工具委托）    |
| 慢通道抽取      | 高         | 低       | 无           | 异步（携带上下文快照）         |
| 程序化验证      | 低         | 中       | 部分         | 异步（纯函数）                 |
| 自包含性检查    | 中         | 低       | 无           | 异步（LLM 批量判断）           |
| 存储写入        | 无         | 中       | 无           | 异步（多后端写入）             |
| 关联与建边      | 无         | 低       | 是           | 异步（图操作）                 |
| 冲突消解        | 无         | 低       | 强           | 异步（全量 semantic_key 比对） |
| 实体卡片聚合    | 无         | 低       | 强           | 后台定时                       |
| 摘要压缩 / 遗忘 | 无         | 低       | 强           | 后台定时                       |

### 6.3 主会话 LLM 的角色

**核心原则：主会话 LLM 不做抽取，只做对话和显式工具委托。**

| 角色         | 应该                                | 不应该           |
| ------------ | ----------------------------------- | ---------------- |
| 对话         | 正常回答用户                        | —                |
| 显式记忆指令 | 调用 `memory_remember` 工具（委托） | 自己拆分原子事实 |
| 隐式记忆     | 完全不感知                          | 每轮自我抽取     |
| 检索结果消费 | 使用注入的记忆                      | 参与记忆管理     |

**工具调用是“委托”，不是“抽取”**：

```typescript
// 主 LLM 只做这一步：决定"值得记住"并委托
{
  tool: "memory_remember",
  args: { content: "用户说他不吃香菜" }   // 原始内容，不是原子事实
}

// 工具处理函数在后台完成抽取
async function memory_remember({ content }) {
  const facts = await slowExtractor.extract(content)  // 后台独立 LLM 调用
  await store(facts)
}
```

**主会话 LLM 参与抽取的代价：**

| 损失       | 表现                                         |
| ---------- | -------------------------------------------- |
| 注意力分散 | 回答和抽取两个目标间分配注意力，回答质量下降 |
| Token 膨胀 | 抽取提示词、格式约束挤进主上下文             |
| 延迟叠加   | 每轮多一段生成，直接体现为用户等待           |
| 语气污染   | 一边自然对话一边输出 JSON，目标冲突          |

### 6.4 快通道的两种子模式

| 模式           | 主 LLM 参与 | 延迟 | 准确率 | 适用           |
| -------------- | ----------- | ---- | ------ | -------------- |
| **A 工具委托** | 仅委托      | 低   | 高     | 用户显式要求   |
| **B 规则匹配** | 无          | 极低 | 中     | 高频显式信号   |
| 慢通道         | 无          | 高   | 最高   | 隐式、复杂事实 |

**推荐组合：B 作为默认兜底，A 作为显式补充，慢通道处理其余。**

**模式 A：显式工具调用**

用户说“记住我不吃香菜”。主 LLM 调用 `memory_remember`，参数是原始内容。工具处理函数内部用独立小模型抽取 + 程序化验证 + 写入。

**模式 B：零 LLM 模式匹配**

系统在 `session/event` 层监听，用规则匹配显式记忆信号：

```
触发词："记住"、"以后都"、"我的偏好是"、"别再"
模式：明确的偏好陈述、数字、日期、专有名词
```

命中后直接投递到后台抽取队列，主 LLM 完全不感知。

### 6.5 完整执行流程图

```
┌─────────────────────────────────────────────────────────┐
│  主会话路径（同步，主 LLM 只做对话 + 工具委托）            │
│                                                          │
│  对话轮次 ──► 主 LLM 回答                                 │
│       │                                                  │
│       ├──► [模式A] 显式调用 memory_remember（委托）       │
│       │         └──► 投递原始内容到后台                    │
│       │                                                  │
│       └──► [模式B] session/event 规则匹配                 │
│                 └──► 命中则投递到后台                     │
│                                                          │
│  注意：主 LLM 从不执行抽取，只做委托或完全不参与            │
└────────────────────────────┬────────────────────────────┘
                             │ 投递（携带上下文快照）
                             ▼
┌─────────────────────────────────────────────────────────┐
│  后台抽取流水线（独立 LLM 调用 + 程序化验证）              │
│                                                          │
│  Queue ──► Slow Extractor（独立小模型）──► Validator     │
│              │                                           │
│              ▼                                           │
│         Storage + Conflict Resolver + Graph Linker       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│  后台定时任务                                             │
│  Entity Card Aggregator │ Summarizer │ Forgetter         │
└─────────────────────────────────────────────────────────┘

          ┌──────────────────────────────┐
          │  子 Agent（仅按需，例外路径）  │
          │  程序记忆归纳 / 复杂冲突仲裁   │
          └──────────────────────────────┘
```

### 6.6 为什么默认不用子 Agent

| 维度       | 子 Agent                | 轻量后台 Worker      |
| ---------- | ----------------------- | -------------------- |
| 上下文传递 | 需快照，有损            | 直接持有快照，无损   |
| 启动成本   | 高（新 session + 规划） | 低（函数调用）       |
| 并发协调   | 复杂                    | 简单（队列）         |
| 适用场景   | 多步推理、工具编排      | 单步抽取、验证、写入 |

**结论：**

- **抽取、验证、存储、建边** → 后台 Worker，不用 Agent。
- **冲突消解中的语义判断** → 单次 LLM 调用，不是 Agent。
- **程序记忆归纳（从多次操作抽象 SOP）** → 才值得用子 Agent。

---

## 7. Storage Layer（存储层）

### 7.1 一条原子事实的多后端分布

| 存储          | 存什么                             | 索引                                    |
| ------------- | ---------------------------------- | --------------------------------------- |
| KV/Relational | 全部字段（主记录）                 | `id`, `semantic_key`, `scope`, `status` |
| Vector Store  | `content` 的 embedding             | ANN 索引，按 `scope` 分区               |
| Graph Store   | `subject -[predicate]-> object` 边 | 实体 ID 索引，支持 1-2 跳扩展           |
| Object Store  | 原始来源（对话记录、文档）         | 按 `source.uri` 索引                    |

**写入时一次写四处，读取时按需路由。**

### 7.2 后端选型

| 存储   | 个人助理           | 研究 Agent   |
| ------ | ------------------ | ------------ |
| Vector | 本地嵌入 + hnswlib | 外部向量库   |
| Graph  | SQLite 关系表      | Neo4j / Kùzu |
| KV     | SQLite             | PostgreSQL   |
| Object | 本地文件系统       | 对象存储     |

---

## 8. soul.md 与 user.md 设计

### 8.1 职责边界

| 文件        | 本质                   | 变化频率 | 与记忆系统的关系                     |
| ----------- | ---------------------- | -------- | ------------------------------------ |
| **soul.md** | Agent 人格配置（静态） | 极低     | **不属于记忆**，是 Profile 的一部分  |
| **user.md** | 用户画像视图（动态）   | 中高     | **是实体卡片的渲染**，底层是原子事实 |

**核心判断：soul.md 是配置，user.md 是视图。**

### 8.2 soul.md：分层注入系统提示

**结构建议：**

```markdown
# Soul

## 核心人格（始终注入）
- 你是一位严谨但温暖的研究助理
- 你倾向于先给结论，再给依据
- 你不确定时会明确说"我不确定"，而不是编造

## 交互风格（始终注入）
- 默认简洁，用户要求详细时才展开
- 使用中文，除非用户切换语言

## 边界（始终注入）
- 不主动提及自己是 AI
- 不代替用户做最终决策

## 扩展设定（按需检索，不默认注入）
- 详细背景故事见 memory:scope=agent:soul#extended
```

**注入方式：**

```typescript
ctx.systemPrompt.section({
  name: 'agent-soul',
  content: await readSoulMd(),   // 作为独立段落
  priority: 'low'                // 不覆盖核心指令
})
```

**避免三个陷阱：**

1. **Token 膨胀** → 分层注入：核心人格常驻，扩展设定走检索。
2. **与系统提示冲突** → 作为独立 section，不覆盖核心指令。
3. **把 soul.md 当记忆** → 它是配置，不走记忆流水线。

### 8.3 user.md：实体卡片的渲染视图

**不做独立文件的原因：**

| 问题           | 说明                                      |
| -------------- | ----------------------------------------- |
| 双写冲突       | 用户改 user.md，系统也在改，谁赢？        |
| 失去原子性     | 一整块文本，无法独立更新单条偏好          |
| 无法溯源       | 某条偏好来自哪次对话？看不出来            |
| 与记忆系统脱节 | recall 检索原子事实，user.md 是另一套数据 |

**正确做法：**

```
底层：原子事实（Alice prefers_diet vegetarian, confidence=0.85, ...）
  │
  ▼ 聚合
实体卡片：user:alice 的画像（多条事实的结构化聚合）
  │
  ▼ 渲染
user.md：人类可读的 Markdown 视图
```

- **系统读取的是实体卡片**，不是 user.md。
- **user.md 是实体卡片的一种导出格式**，方便用户查看和编辑。
- **用户编辑 user.md 时**，系统解析变更，回写为原子事实的增删改。

### 8.4 双向同步机制

```
用户编辑 user.md
  │
  ▼
解析 Markdown → 提取变更（新增/修改/删除的条目）
  │
  ▼
与现有原子事实比对（semantic_key）
  │
  ├── 新增 → 创建新原子事实（source=user_edit, credibility=1.0）
  ├── 修改 → supersede 旧事实
  └── 删除 → 标记 status=archived
  │
  ▼
重新渲染 user.md（确保格式一致）
```

**反向：**

```
对话中抽取新原子事实
  │
  ▼
触发实体卡片聚合（异步）
  │
  ▼
重新渲染 user.md
  │
  ▼
（可选）通知用户："你的画像已更新"
```

**用户编辑的优先级最高**：`source=user_edit` 的 `credibility=1.0`，冲突时永远胜出。

### 8.5 user.md 的分层结构

```markdown
# User Profile: Alice

## 核心摘要（默认注入，200 token 内）
- 素食者，常出差
- 偏好简洁回答
- 母语中文，英语流利

## 详细偏好（按需查询）
### 饮食
- 素食，不吃香菜
- 出差时偏好工作日午餐简餐

### 工作
- 后端工程师，主要用 Go
- 项目使用 PostgreSQL + GORM
- 部署在阿里云 ACK

### 交互偏好
- 喜欢先结论后依据
- 不喜欢过度解释
```

### 8.6 按需查询的三种触发方式

| 方式             | 机制                                             | 适用                       |
| ---------------- | ------------------------------------------------ | -------------------------- |
| **工具调用**     | 模型主动调用 `read_user_profile`                 | 模型明确知道需要用户信息时 |
| **请求前置注入** | `agent/request` 检测到用户相关意图时自动注入摘要 | 高频场景，减少工具调用     |
| **系统提示提示** | 系统提示中告知模型有此能力                       | 让模型知道有这工具         |

**推荐：摘要前置 + 工具按需。** 摘要常驻（200 token 内），详情按需查询。

---

## 9. 插件包结构

```
dsh-memory/
├── package.json
├── src/
│   ├── index.ts              # 插件入口：apply(ctx)
│   ├── service.ts            # MemoryService 类
│   ├── atomic/
│   │   ├── schema.ts         # 原子事实类型定义
│   │   ├── extractor.ts      # LLM 抽取 + 提示词
│   │   ├── validator.ts      # 程序化验证
│   │   └── semantic-key.ts   # 语义键生成与去重
│   ├── engines/
│   │   ├── recall.ts         # Recall Engine
│   │   ├── remember.ts       # Remember Engine
│   │   └── consolidate.ts    # Consolidate Engine
│   ├── storage/
│   │   ├── vector.ts
│   │   ├── graph.ts
│   │   └── kv.ts
│   ├── policy/
│   │   ├── engine.ts
│   │   └── profiles.ts       # personal / research 预置
│   ├── profile/
│   │   ├── soul.ts           # 加载 soul.md，注入系统提示
│   │   └── user-view.ts      # 渲染/解析 user.md
│   ├── entities/
│   │   ├── card.ts           # 实体卡片聚合
│   │   └── renderer.ts       # 卡片 → user.md 渲染
│   ├── adapters/
│   │   ├── request.ts        # agent/request 拦截
│   │   ├── session.ts        # session/event 观察
│   │   └── tools.ts          # memory_* 工具注册
│   └── types.ts
└── docs/
```

---

## 10. 配置与 Profile

### 10.1 个人助理 Profile

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    profile: personal_assistant
    soul:
      path: '~/.dsh/soul.md'
      injectMode: 'core-only'
      extendedScope: 'agent:soul#extended'
    userProfile:
      viewPath: '~/.dsh/user.md'
      autoInject:
        enabled: true
        trigger: 'intent:user-related'
        summaryTokens: 200
      userEditPriority: 1.0
      syncMode: 'bidirectional'
    atomicFact:
      extraction:
        model: deepseek-v3
        maxFactsPerTurn: 8
        granularity: medium
      validation:
        requireSelfContained: true
        granularityCheck: true
    storage:
      vector: { backend: local, dim: 1536 }
      graph: { backend: sqlite }
      kv: { backend: sqlite, path: '~/.dsh/memory/kv.db' }
    policy:
      retrieval:
        sources: [semantic, episodic]
        topK: 5
        timeDecay: strong
        ranking: [recency, confidence]
      forgetting:
        defaultTTL: 30d
        sensitiveTTL: 7d
        conflictResolution: latest_wins
      privacy:
        encrypt: true
        scopeIsolation: strict
```

### 10.2 研究 Agent Profile

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    profile: research_agent
    soul:
      path: '~/.dsh/soul-research.md'
      injectMode: 'core-only'
    userProfile:
      viewPath: '~/.dsh/user.md'
      autoInject:
        enabled: false          # 研究场景用户画像权重低
    atomicFact:
      extraction:
        model: deepseek-v3
        maxFactsPerTurn: 20
        granularity: fine
      validation:
        requireSourceTrace: true
        requireSelfContained: true
    storage:
      vector: { backend: external, dim: 1536 }
      graph: { backend: neo4j }
      kv: { backend: postgres }
    policy:
      retrieval:
        sources: [project_semantic, knowledge_graph, episodic]
        graphExpansion: 2
        ranking: [source_credibility, relevance, recency]
      forgetting:
        defaultTTL: never
        versioning: true
        conflictResolution: mark_conflict
      privacy:
        shareWith: project_members
```

---

## 11. 评估指标体系

| 指标           | 定义                                 | 对应特性        |
| -------------- | ------------------------------------ | --------------- |
| 抽取准确率     | 抽取事实与人工标注一致比例           | 拆分粒度        |
| 原子性合规率   | 通过三条独立测试的比例               | 不可再分/自包含 |
| 去重准确率     | semantic_key 判重与人工一致率        | 语义键设计      |
| 检索命中率     | 相关事实被召回比例                   | 可独立检索      |
| 冲突处理正确率 | supersede / mark_conflict 决策正确率 | 版本化          |
| 遗忘精确率     | 删除操作无误伤比例                   | 独立遗忘        |
| 记忆保持力     | 多轮无关对话后仍能回忆               | 长期存储        |
| 回溯能力       | 随对话深度增加的有效回溯距离         | 检索质量        |
| 时间推理       | 理解事件时间顺序                     | qualifiers 设计 |
| 隐私合规       | 敏感信息未泄露比例                   | scope 隔离      |

**不同 Profile 权重：**

- 个人助理：隐私 > 偏好准确 > 时间推理
- 研究 Agent：来源可溯 > 冲突处理 > 回溯能力

---

## 12. 工程保障与边界问题

### 12.1 顺序性

同一 `scope` 的 supersede 链**必须串行**，否则并发写入会导致版本乱序。

```
方案：per-scope 单消费者队列，或乐观锁 + version 校验
```

### 12.2 幂等性

事件可能重放，抽取可能重复。`semantic_key` 去重是幂等的天然保障。

### 12.3 快慢通道冲突

```
慢通道发现同 semantic_key 的既有事实 → 不覆盖，而是 supersede
慢通道发现粒度更细 → 新建事实 + 将快通道事实标记为 coarse 版本
```

### 12.4 可观测性

异步流水线必须有全链路追踪：事件 ID → 抽取任务 → 验证结果 → 写入记录 → 冲突决策。

### 12.5 背压

队列水位过高时，慢通道降级为只抽取不验证，或按 scope 优先级丢弃低价值事件。

### 12.6 双向同步的并发编辑

用户编辑 user.md 与系统聚合同时发生时：

```
方案：渲染时加锁，或用户编辑优先，系统聚合延后
用户编辑的 credibility=1.0 保证冲突时胜出
```

---

## 13. 附录：与 DSH 扩展点映射

| 记忆能力         | DSH 扩展点                               | Cordis 机制        |
| ---------------- | ---------------------------------------- | ------------------ |
| 检索注入         | `agent/request`                          | waterfall          |
| 记忆写入（对话） | `session/event`                          | emit（观察者）     |
| 显式记忆工具     | `ctx.tools.register()`                   | Service            |
| 系统提示注入     | `system-prompt.section`                  | Service            |
| 压缩保护         | `agent/pre-step` / `agent/turn-stopping` | waterfall / serial |
| 隐私拦截         | `tools/pre-execute`                      | waterfall          |
| 记忆服务 API     | `ctx.set('memory', ...)`                 | Service + inject   |
| 存储后端         | 内部子插件                               | Service            |
| soul.md 注入     | `system-prompt.section`                  | Service            |
| user.md 渲染     | 内部 Service                             | Service            |

整个插件通过 Cordis 的 `ctx.effect()` 管理所有注册，插件卸载时自动清理所有副作用——包括服务、事件监听、工具和提示段落。

---

## 14. 总结

**核心设计要点：**

1. **原子事实是数据契约**：一切记忆降解为原子事实，实体卡片是聚合，图谱是连接，程序记忆是序列化。
2. **主会话 LLM 不做抽取**：只做对话和工具委托，抽取由后台独立 LLM 调用完成。
3. **分层异步执行**：同步只做低延迟投递，重活与全局操作在后台完成，子 Agent 是例外。
4. **混合存储**：KV 主记录 + 向量 + 图边 + 对象存储，一次写入多处索引。
5. **soul.md 是配置，user.md 是视图**：前者注入系统提示但只注入核心，后者是实体卡片的渲染，用户编辑回写为原子事实。
6. **策略配置化**：个人助理与研究 Agent 共用同一套代码，差异收敛到 Profile。
7. **主动遗忘**：衰减和淘汰机制与存储同等重要。

**下一步实现顺序：**

1. MemoryService + 原子事实类型定义
2. KV 存储 + 基础 remember/recall
3. `agent/request` 拦截 + 系统提示注入
4. `memory_*` 工具注册
5. 后台抽取流水线（异步 Worker）
6. 向量存储 + 混合检索
7. Consolidate Engine + 遗忘策略
8. soul.md 加载 + user.md 双向同步
9. 多 Profile 策略配置
10. 评估框架与可观测性