# 接口层落地要点（Implementation Notes）

本文件把代码骨架中 `placeholder` 注释的接口层实现路径展开为标准答案。**纯逻辑核心（`src/model`、`src/storage/store.ts`、`src/engines`、`src/service.ts`）是可直接运行的；以下说明如何把它们接到 DSH workspace 内各自真实 API 上，并补齐骨架中留白的部分。** 全部结论来自 DSH 源码实测（`D:\Apps\deepseek-harness`），非臆测。

---

## 1. 存储落地：`ctx.storageDomain`（替代骨架 `DshStore` 的 placeholder）

DSH 的领域层 KV 是 `ctx.storageDomain`（`packages/storage/storage-domain`，即 `ctx.storage.domain`）：

```ts
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'

const domain = ctx.storageDomain.open(defineDomain({
  name: 'dsh-memory',
  table: (t) => ({
    facts: t.object<AtomicFact>()   // zod schema，字段见 src/model/fact.ts
      .index('semantic_key').index('scope').index('status'),
    edges: t.object<FactEdge>().index('from').index('to'),
  }),
}))

const facts = domain.table('facts')   // KvTable: get/put/delete/entries/keys/update
await facts.put(fact.id, fact)
```

- 后端由枢纽 `ctx.storage` 管理：交付 `json`（dsh-storage-json）与 `sqlite`（dsh-storage-sqlite）两种，路由由 `backend`/`routes` 配置决定。个人助理默认 sqlite。
- 每次写链在持久化后发 `domain/changed` 事件，可作 UI「最近活动」信号。
- ⚠️ 不要用 `ctx.sessionPersistence` 存记忆事实——那是会话事件日志的句柄式持久化，不是任意 KV。

**把 `DshStore` 转成真实现**：把骨架中 `private facts` 的 placeholder 替换为上面 `domain.table('facts')`，并实现 `list/findActiveBySemanticKey/listVersions` 为对 `facts.entries()` 的过滤（或按索引）。`close()` 调 `domain.close()`。

---

## 2. 向量索引落地：自建（替代骨架 `DshVectorIndex`）

DSH **无内置 embedding/向量库**。方案 A（个人助理，默认）：

- embedding 存 `domain.table('vectors')`：`factId -> number[]`，key 按 scope 分桶以缩小扫描面。
- `search()`：进程内对桶内向量算余弦相似度 top-K（线性扫描在中千条规模足够）。
- `embed()`：经 `ctx.llm.stream` 调 embedding 能力；`ctx.llm` **没有** `chat()` 便捷方法——用 `stream` 取 `StreamChunk`，再以 `BlockAssembler` 折叠成 `ContentBlock[]`/向量：

```ts
const assembler = new BlockAssembler()
for await (const chunk of ctx.llm.stream({ provider, model, messages: [...], stream: true })) {
  assembler.push(chunk)
}
const blocks = assembler.full()
```

- 方案 B（研究 Agent，可选）：包装成 `VectorIndex` 接口，接入外部向量后端；引擎层不改。

---

## 3. 独立 LLM 抽取落地（`LlmExtractor`）

主会话 LLM 不做抽取（框架设计 §6.3）。后台抽取在 `ctx.jobs` 作业内用 `ctx.llm.stream` 完成：

```ts
// 抽取提示词（约束：一个谓词一个事实、属性内聚、自包含、标注 type/confidence/qualifiers）
const prompt = `从以下对话抽取原子事实，输出 JSON 数组，每条含
{ subject, predicate, object, qualifiers, content, type, confidence }。\n内容：${content}`
```

- 把返回的 JSON 解析为 `AtomicFactInput[]` 后再走 `rememberMany`（引擎：验证→语义键→冲突→存储→索引）。
- 排队：`session/event` 观察 `assistant/message`/`tool/result`/`turn/end`，**同步只投递**到按 scope 分片的内部队列；`session/flush`（parallel，被 await）是落库检查点，在这里 `ctx.jobs.start()` 提交后台抽取作业。

---

## 4. 预置工具与系统提示（`src/adapters/tools.ts` / `src/index.ts`）

骨架已按真实 `defineTool` 写齐（`memory_recall`/`memory_remember`/`memory_forget`/`read_user_profile`）。要点：

- 模型侧只见 `{name, description, parameters}`；`execute` 返回的规范 value 经 `output.schema` 校验后由 `render()` 投影为 `ContentBlock[]`。
- `ctx.systemPrompt.section({name, order, text})` 注入记忆意识；`ctx.systemPrompt.context({...})` 注入用户画像摘要（作为带来源的 user-role 快照，适合 RAG、可被 compaction 处理）。
- 隐私拦截：`ctx.on('tools/pre-execute', ...)` 返回 `{kind:'ask'|'deny'}`，或 `ctx.tools.guard(...)` 单调守卫（骨架已挂 `tools/pre-execute`）。

---

## 5. Browser 半接入（`src/client/index.ts` / `MemorySettingsSection.tsx`）

骨架已按真实 Slot 机制写好 `settings.section` 注入。补齐要点：

- **Remote**：Host 半继承 `TypertRemoteService` 并给方法加 `@Remote('name')`；Browser 半经 `dsh-api-remotes` 装配把 namespace 挂到 `ctx.remote.memory.<method>`（`@Remote` 见 `src/remote/index.ts` 契约）。
- **实时同步**：Host `this.ctx.emit('memory/event', {...})` → Browser `ctx.remote.$on('memory/event', fn)`；列表/概览的权威态用 `facts.query()`/`stats()` 可重拉（DSH 转发事件**不重放**，不能作为唯一真相源）。
- **HostObservable**：Host 暴露 `getSnapshot/subscribe` 裸源，经 slot `inject` 的 `hooks` 交给组件，renderer 转为 `useStats(selector)`。
- **组件不接 `ctx`**：只收 `PropsRuntime`/`InjectFace`/`PropsLocale`/`PropsRenderSlots` + 标准 hooks（骨架已示范）。
- **配置**：`ctx.settings.register('memory', schema, {base: profile, applies:'live'})`，`scope.watch()` 响应变更；Profile（personal/research）作为组合 base 层。

---

## 6. user.md 双向同步（`src/profile/*`）

- 底层是原子事实；`user.md` 是实体卡片（`user:<scope>`）的渲染视图（框架设计 §8.3）。
- 正向：对话抽取新事实 → 触发实体卡片聚合 → 重渲染 user.md。
- 反向：用户编辑 user.md → 解析变更（新增/修改/删除）→ 与现有事实按 `semantic_key` 比对 → 新建 / supersede / 归档；`source=user_edit` 的 `credibility=1.0` 冲突时永远胜出。
- 一致性：避免双写冲突——渲染时用 `settings` 的 `revision` 抵御并发编辑；用户编辑优先，系统聚合延后。

---

## 7. 可观测与背压

- 全链路：`ctx.logger('dsh-memory')` + 事件链（事件 id → jobs id → 冲突决策）写日志并推 `memory/event`。
- 顺序性：同 `agentScope` 内 `semantic_key` 演进串行（`ctx.jobs` 按 owner 准入/串行 + per-scope 队列）。
- 背压：抽取队列水位高时降级为「只抽取不验证」或按 scope 优先级丢弃低价值事件。
- 幂等：`semantic_key` 去重天然幂等，事件重放安全。
