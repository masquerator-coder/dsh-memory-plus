# DSH 上下文管理机制深度分析

> 分析对象：`D:\Apps\deepseek-harness`（DeepSeek Harness 源码）
> 结论基于 `docs/subsystems/*.md` 官方文档 + `packages/**/src/*.ts` 实际实现交叉验证。
> 官方子系统文档与源码经 `verify-*` 脚本做漂移校验（drift-check），可信度高。

---

## 0. 一句话总览

DSH 采用**事件溯源（event sourcing）**管理上下文：一次对话的全部内容都沉淀在一条 **append-only 的 `SessionEvent` 日志**里，模型真正“看见”的 message 历史是**从这条日志推导（derive）**出来的，而不是单独存一份。所有“管理”动作——写入、注入、压缩、溢出、检索——都是在这条日志的“surface（模型可见面）”上做文章。

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                        Session（core/session）                          │
  │   append-only SessionEvent 日志 = 对话事实来源（source of truth）        │
  │        │                                                               │
  │        │  deriveMessages()  /  SessionSurface                         │
  │        ▼                                                               │
  │  surface（模型可见的有序消息面）：system/user/assistant/tool-result     │
  └───────┬──────────────────┬───────────────────┬─────────────────────────┘
          │ 写（进入上下文）  │ 读（构造请求）    │ 管理（压缩/溢出/检索）
          ▼                  ▼                  ▼
   system-prompt 组装       agent-loop        compaction / spill /
   context/* 注入          deriveMessages     session-query
   用户 prompt / 模型输出                       token-meter 计量触发
```

---

## 1. 上下文的事实来源：`Session` 事件日志

**包**：`packages/core/session`（源码 `src/types.ts`、`src/surface.ts`）

- `Session` 是一条 **append-only 日志**，由带类型的 `SessionEvent` 组成，`seq` 从 0 连续递增。
- **模型的 message 历史是从日志推导的**，绝不单独存储——`Session.deriveMessages()` 遍历 surface 投影出 `Message[]`。重放（resume）/ fork 就是从同一批事件重新推导。
- 持久化只是把这同一条日志落盘（见 §6），没有第二种事件类型。

### 事件词汇表（`SessionEventMap`，可声明合并扩展）

| 事件 | 是否进模型上下文 | 作用 |
|---|---|---|
| `user/message` | ✅ surface | 用户 prompt、注入上下文、steering、goal 续轮 |
| `assistant/message` | ✅ surface | 模型输出（携带其原始 stream） |
| `tool/result` | ✅ surface | 工具结果 |
| `system/message` | ✅ surface（节点0） | 渲染后的系统提示词 |
| `turn/start` / `turn/end` | ❌ log-only | 一轮的开始/结束及结束原因 |
| `step/start` / `step/end` | ❌ log-only | 一步（一次模型调用+工具执行）|
| `assistant/attempt` | ❌ log-only | 未产出可见消息的失败/重试/取消尝试 |
| `tool/call` | ❌ log-only | 模型请求的某次工具调用 |
| `request/header` | ❌ log-only | 请求封装（provider/model/工具schema），用于重建请求 |
| `request/context` | ❌ log-only | 路由容量/系统提示更新模式 |
| `session/end-seed` | ❌ log-only | fork/重放种子边界 |
| `compaction/start·summary·end`（插件扩展） | ❌ log-only | 压缩事务的锁/摘要/收尾记录 |

关键设计：**事件日志与“模型可见面”分离**。只有 `SurfaceEventType`（上表 ✅ 四个）才能进入 surface；其余都是结构/回放元数据，消耗 `seq` 但不出现在模型面前。

### Surface：模型可见的有序面

- **`SurfaceOp`** 决定一个消息事件如何进入可见面：
  - `'append'`：追加到尾部（正常路径）。
  - `{ op: 'replace'; startSeq; endSeq }`：用本节点“遮盖/替换”一段表面范围——**这是 compaction 的唯一表面变更手段**。
- **`SessionSurface.nodes`** 给出当前按可见顺序排列的表面 `seq` 列表；`replaceGeneration` 单调递增，标识“发生了替换”（消费者据此区分纯追加与重写）。
- `deriveMessages()` 是缓存且深冻结的投影：每个 surface 节点只投影一次，surface 重写（replace）时重建。**这是 agent-loop 构造请求、token-meter 计量的共同依据。**

> 一个易混淆点：surface 会“遮盖”被替换的范围，因此它不是人类转录的正确来源——人类看到的聊天记录读的是**append 起点事件**（`isAppendSurfaceEvent`）。

---

## 2. 上下文如何“进入”日志（写入端）

模型每次看到的上下文由几部分拼成，全部落进日志成为可重放/可压缩的事件：

### 2.1 系统提示词组装 —— `core/system-prompt`
- 注册 `section`（静态/按上下文求值的提示段）、`context`（动态运行时上下文）、`tools`（工具 schema 提供者）、`variable`（插值变量），按 `order` 排序后 `assemble()` 拼装，支持 scoped（按 agent 作用域）。
- 组装结果渲染为 **`system/message` surface 节点 0**，作为**推导历史**发给模型（不是 request 字段）。
  - 提示词变化时“原地替换”节点0，或（`systemPromptUpdate: 'in-history'`）在缓存历史之后追加，以保 KV cache 复用。
- 系统提示中的**工具 schema** 也进入 `request/header`，每个请求都重新发送。

### 2.2 请求上下文插件 —— `context/` 组（都注入为 `user/message` 事件，持久、可压缩）
| 包 | 注入内容 |
|---|---|
| `context/agent-instructions` | `AGENTS.md`/`CLAUDE.md` 工作区指令，**首个请求前**基线注入；fs 工具改动文件后通过 `agent.inbox` 触发刷新 |
| `context/file-reference` + `-local` | `@file` 提及发现与路径补全（本地提供者）|
| `context/session-reference` | 提及其他会话时，把其只读快照作为上下文引入 |
| `context/time-context` | 当前时间/时区/每步耗时 |
| `context/tmux-context` | agent 所在 tmux 会话/窗口/窗格 |

这些内容都以 **user 角色**消息进入会话历史（`agent-instructions` 甚至会在 `pre-step` 瀑布里把指令夹到直接 prompt 之后、driver 追加的运行时上下文之前），因此**与普通对话一样**会持久化、重放、被 compaction 压缩。

### 2.3 其他注入途径
- `agent.inject()` 产生的**合成上下文**：文件变更通知、子目录 AGENTS.md、skill 内容、cron 通知、goal 续轮 —— 都以 `user/message` 落日志。
- 普通用户 prompt、模型输出、工具执行结果同理。

---

## 3. 计量与阈值：什么时候“需要管” —— `llm/token-meter`

**包**：`packages/llm/token-meter`，service = `ctx.tokenMeter`

- `measure(session, requestHeader)` 返回 `TokenMeasurement`：
  - `totalTokens`：当前**请求+响应压力**（非负）。
  - `surfaceTokens` / `nodes[]`：按表面顺序的每个节点定价（route 感知：有图像定价时按视觉 token + 文本计，否则用固定启发式 `estimateMessage`）。
  - `baseline`：是否可复用最近一次成功调用（同封装、同路由）的真实 usage 锚点，否则自己完整重算。
- **compaction 的所有决策（阈值判定、保留范围选择、收缩验证、替换定价）都以它为准**；`shadow-price` 协议让替换用启发式定价，保证 O(1) 投影折叠与自身 append 一致。
- 每个模型路由通过 adapter 声明自己的 `contextWindow`（`request/context` 事件记录），compaction 据此算阈值。

> 注意：`TokenMeter` 是服务端单一的 `ctx.tokenMeter`，compaction 只是它的消费者，不自己定价。

---

## 4. 上下文压缩（Compaction）：窗口逼近上限时

**包**：`packages/compaction/` 组
- `compaction`（Service Definition，`ctx.compaction`）+ `compaction-basic`（Provider，自动/手动实现）+ `command-compact`（`/compact` 命令）+ `compaction-tool-result-pruner`（`ctx.toolResultPruner` 可选修剪）。

### 4.1 两个触发路径（`CompactionTrigger`）
1. **`pressure`（正常压力）**：挂在 `agent/pre-step` 瀑布，在每个 step 构造请求**之前**检查。`measure.totalTokens >= contextWindow × thresholdRatio`（默认 0.8）才压缩。
2. **`context-overflow`（提供者确认的溢出）**：挂在 `agent/request-error`，当模型调用以 `CONTEXT_WINDOW_EXCEEDED_CODE`（请求超出上下文窗口）失败时触发恢复，**可以绕过常规阈值和保留尾巴策略，强制做一次有效的平衡缩减**，成功后返回 `{ kind: 'retry' }` 重试失败请求。有 `maxOverflowRetries` 上限。

手动路径：`/compact` 命令 → `compactNow(agent, signal)`，在**空闲会话**低于阈值时也做一次“有用缩减”（`retainTokens=0`），返回 `null` 若无可用范围。

### 4.2 压缩流程（`compaction-basic/region.ts`）
```
压力/溢出判定
  → 可选 toolResultPruner.pruneSession() 先修剪超大工具结果（见4.4）
  → 重新 measure
  → selectCompactableRange()：从表面第一个非系统节点起，保留一个
     “定价的近期尾巴”（retainRatio 默认0.16 / retainTokens），
     且永不拆开 assistant 的 tool-call/result 配对
  → 事务：append compaction/start（日志锁）【此后是异步点】
  → summarize()：拼出“缓存前缀”（系统提示+工具schema+该段消息），
     通过 ctx.llm.stream() 一次性调用 LLM 压缩（前缀复用对话本身，
     保 KV cache）
  → 校验：摘要 < 被覆盖内容的 token（必须更小），表面未变
  → commit：append compaction/summary + 一个替换式 user/message
     （surfaceOp: replace，覆盖[start,end]）→ shadow 旧范围
  → append compaction/end（释放锁）
```
- **锁机制**：`compaction/start` 先写，`compaction/end` 最后写；中间崩溃会留下“未匹配的 start”，可被检测为孤儿锁而非假成功。`session/end-seed` 边界用于区分“继承自上个生命周期的死锁”与“当前真正在压缩”。
- **稳定性校验**：自动压缩要求“整个表面未变”（`assertWholeSurfaceUnchanged`）；手动压缩只要求“选定段仍稳定”（`assertSelectedSpanStable`），允许压缩进行中其他位置有新内容。
- **收敛**：一次压缩后若仍超阈值，`compactionRetries` 内循环再压缩；仍不达标则报错（不假装成功）。

### 4.3 结果事件与可重建性
- `CompactionResult` 记录 `compactionId`、`start/summary/endSeq`、`shadowedRange`、`shadowedSeqs`、`shadowedTokenCount`、`summary`。摘要本体是一个带 `compactCheckpointSource(compactionId)` 来源的 `user/message`；消费者靠这个来源构造函数识别“这是压缩检查点”，与具体后端无关。
- 全部 `compaction/*` 事件 + 摘要都在日志里，**一次压缩（用了哪个 provider/model、压掉哪些 seq、多少 token）从日志+代码可完整重建**。
- `toolPairingBalancedBefore/After`：校验边界前后 tool-call/result 配对平衡，避免把工具调用和它的结果拆到摘要两侧。

### 4.4 工具结果修剪 —— `compaction-tool-result-pruner`
- `pruneSession(session)`：对当前表面里所有**超过预算**的 `tool/result` 做确定性的 head/middle/tail 修剪（按 Unicode 码点切片，避免切开代理对），保留富块顺序。
- 每个替换：保留除 `content` 外的完整事件数据、记录被 shadow 的原 seq、紧跟一个 `compaction/prune` 影子价事件（用 token meter 定价被 shadow 节点，方便纯消费者 O(1) 扣除）。
- 它是模型无关的确定性缩减，在**压缩之前**落地，可单独减少压力，也可在 context-overflow 时先剪枝再判定。

---

## 5. 溢出落盘（Spill）：超长内容外置，不撑爆上下文

**包**：`packages/spill/` —— `spill`（Service Definition，`ctx.spillStore`）+ `spill-local`（落盘实现）+ `spill-policy`（工具结果溢出策略）。

- **接口**：`SpillStore.saveText({owner, source, suggestedName, content}) → { locator, bytes, retrievalHint }`。原样保存全文，返回不透明 locator + 检索提示。
- **落地**（local）：写到 `<root>/session-<sha256(sessionId)>/<random>-<safeName>`，私有目录（0700）、排他独占写（`wx`+`0600`），防止符号链接重定向。`locator` 是路径，`retrievalHint` 提示模型用 `read`/`grep` 读它。
- **策略消费**（`spill-policy`）：把**超过 `maxInlineBytes`** 的纯文本工具最终结果，替换为“head/tail 预览 + spill 引用”，best-effort——若落盘失败则**保留原内联结果**，绝不把一次成功调用变失败。
- 与 compaction 的分工：compaction 是“把历史压成摘要以缩小上下文”；spill 是“把单个**超大内容**外置为文件引用，只留小预览”。

---

## 6. 持久化（Persistence）：让上下文跨崩溃/重启存活

**包**：`packages/session/session-persistence` + `session-persistence-jsonl`

- 抽象服务 `ctx.sessionPersistence`：`create/open/stat/list` 返回每会话的 `SessionHandle`（`read/append/flush/close`），**单写者锁**（一个 id 同时只有一个 write handle）。
- **flush 是可持久性屏障**：`append` 是 best-effort（可能缓冲），只有 `flush` 承诺“已落盘并对其进程可见”。agent 在认领下一轮前用它做顺序与错误观测点。
- **flush checkpoint 机制**：后端监听 `session/event`（同步通知）把事件路由进 write handle 的写回窗口，`flush` 取消等待并排空。
- **crash 恢复**：日志若断在一轮中途（有 `turn/start` 无 `turn/end`），**不截断**——resume 时读取物理有效日志，补上 `interruptedTurnClosers`（缺的 tool error、open step/end、合成 `turn/end { interrupted }`），作为普通批次追加，再发布 Session。
- JSONL 后端：每会话一条 append-only JSONL（默认 Zstandard 压缩帧 + 校验和），原子物化、批量 fsync、撕裂尾部在新 append 前截断。
- **fork 继承**：子会话通过 `isSeeded` + `inheritedEventCount` 记录继承前缀，spill locator 随种子日志继承而不重新拷贝。

---

## 7. 历史会话检索：不塞进上下文，而是按需取

**包**：`packages/session-query/`

- `ctx.sessionQuery`：跨会话的逻辑语料检索（关键词搜索、事件读取、血缘追踪、语义过滤、SQLite FTS）。
- 模型侧工具 `dsh-tool-session-query`（`session_search`/`session_event_search`/`session_trace`/`session_event_read` 等）：**只在模型需要回忆“之前会话”时调用**，把结果作为工具结果进入当前上下文。
- 跨会话授权保守：目标会话 `cwd` 必须与调用者完全一致，否则只允许读自己。
- 这不是被动管理，而是 DSH 控制上下文体积的“主动检索”端：**历史不预先全量注入，由模型按需查询**。

---

## 8. 三者的协同与对比（Compaction vs Spill vs Session-query）

| 维度 | Compaction（压缩） | Spill（溢出落盘） | Session-query（检索） |
|---|---|---|---|
| 动机 | 上下文窗口逼近/超限 | 单个内容超长 | 回忆跨会话历史 |
| 操作对象 | 一段历史消息范围 | 单个工具结果 | 其他会话日志 |
| 动作 | LLM 生成摘要，`replace` shadow | 落盘全文，留 locator+预览 | 模型主动查询，结果进上下文 |
| 是否改日志 | 是（append + replace） | 是（对工具结果替换） | 否（只读检索） |
| 不可逆性 | 摘要为提交，shadow 覆盖 | 原文可能被覆盖 | 无 |
| 顺序 | pre-step / request-error | compaction 之前 | 按需 |

协同关系（完整生命周期）：
1. **写入**：用户 prompt、system-prompt 组装、context/* 插件注入 → 全部落 `Session` 日志（surface）。
2. **计量**：每个 step 构造请求前，`token-meter` 度量压力。
3. **预防**：超大工具结果先被 `spill-policy` 外置为文件引用，或由 `toolResultPruner` 修剪。
4. **压缩**：压力达阈值 → `compaction-basic` 在 pre-step 自动压缩；请求溢出 → request-error 恢复压缩；用户可 `/compact` 手动压缩。
5. **持久化**：日志经 `session-persistence-jsonl` 落盘 + flush checkpoint + crash 修复。
6. **回忆**：模型通过 `session-query` 工具主动检索历史会话。
7. **重启**：resume 从持久化日志重放推导出上下文。

---

## 9. 关键源码索引

| 关注点 | 文件 |
|---|---|
| 事件日志类型/append | `packages/core/session/src/types.ts` |
| surface 投影/derive | `packages/core/session/src/surface.ts` |
| agent-loop 驱动（请求组装） | `packages/core/agent-loop/README.md`（`src/agent.ts`）|
| 系统提示组装 | `packages/core/system-prompt/src/index.ts` |
| 工作区指令注入 | `packages/context/agent-instructions/src/index.ts` |
| token 计量 | `packages/llm/token-meter/src/index.ts` |
| compaction 服务定义 | `packages/compaction/compaction/src/types.ts` |
| compaction 自动/手动后端 | `packages/compaction/compaction-basic/src/index.ts`、`region.ts` |
| 工具结果修剪 | `packages/compaction/compaction-tool-result-pruner/src/index.ts` |
| spill 服务定义 | `packages/spill/spill/src/index.ts` |
| 持久化 | `packages/session/session-persistence/src/index.ts`、`session-persistence-jsonl/src/storage.ts` |
| 会话检索 | `packages/session-query/` |

> 官方权威文档（与源码 drift-check）：`docs/subsystems/session.md`、`compaction.md`、`spill.md`、`persistence.md`、`token-meter.md`、`system-prompt.md`、`conversation.md`。
