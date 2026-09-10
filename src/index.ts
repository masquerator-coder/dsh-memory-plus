/**
 * Host 半入口：apply(ctx) 装配记忆服务并注册 DSH 扩展点。
 *
 * ⚠️ 本文件依赖 @deepseek-ai/* 运行时类型，需在 DSH workspace 内作为 workspace 包构建
 *  （放入 packages/extensions/dsh-memory 并加入根 tsconfig references）。纯逻辑核心
 *  （src/model、src/storage/store.ts、src/engines、src/service.ts）可在本目录独立
 *  编译验证：`pnpm exec tsc -p tsconfig.model.json`。
 *
 * 装配的 DSH 扩展点（见设计文档 §4）：
 *  - ctx.effect(): 统一副作用生命周期，卸载即逆序清理
 *  - ctx.provide('memory', ...): 暴露记忆服务
 *  - ctx.tools.register(defineTool(...)): 注册 memory_* 工具
 *  - ctx.systemPrompt.section/context(): 记忆意识提示 + 用户画像摘要
 *  - ctx.on('agent/pre-step'|'session/event'|'session/flush'|'tools/pre-execute'): 注入/观察
 *  - ctx.jobs / ctx.timer: 后台抽取与定时整合
 *  - ctx.llm.stream + BlockAssembler: 独立抽取调用
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings' // Context.settings 与 ctx.inject(['settings']) 的类型增强
import type {} from '@deepseek-ai/dsh-agent-default-model' // Context.agentDefaultModel 默认路由
import { z } from 'zod'

import { MemoryService } from './service.js'
import { DshStore } from './storage/kv.js'
import { DshVectorIndex } from './storage/vector.js'
import {
  readMemorySettings,
  MEMORY_SETTINGS_NAMESPACE,
  MemorySettingsSchema,
  DEFAULT_EXTRACTION_PROVIDER,
  DEFAULT_EXTRACTION_MODEL,
  type MemorySettings,
} from './settings.js'
import { rememberTool, recallTool, forgetTool, readUserProfileTool } from './adapters/tools.js'
import { lastUserText, scopeOf } from './adapters/util.js'
import type { Extractor } from './engines/remember.js'
import { consolidate } from './engines/consolidate.js'
import type { AtomicFactInput, FactSource, SpsObject } from './model/fact.js'

export const name = 'dsh-memory'
export const inject = [
  'tools', 'systemPrompt', 'storage', 'storageDomain', 'sessionQuery',
  'jobs', 'llm', 'logger', 'settings',
]

/**
 * 当前装配好的记忆服务（在 ctx.effect 内创建后缓存）。
 * 因 ctx.get('memory') 未声明为 Context 服务键，这里用模块级变量捕获，
 * 供 pre-step / 定时整合等挂载点读取（见 DSH context.get 的键约束）。
 */
let activeMemory: MemoryService | undefined

/** 抽象出脊：真正注入 DSH 存储/LLM 的组装点。 */
function assemble(ctx: Context): MemoryService {
  const store = new DshStore(ctx)          // ctx.storageDomain 封装
  const vector = new DshVectorIndex(ctx)   // 自建向量索引（方案 A）
  const extractor: Extractor = new LlmExtractor(ctx)
  return new MemoryService({ store, vector, extractor })
}

// —— LLM 抽取提示词 ——
// 抽取路由的默认 provider/model 来自 ./settings.js（可经 dsh-memory 设置覆盖）。

const EXTRACTION_SYSTEM_PROMPT = [
  'You decompose natural-language statements into atomic memory facts.',
  'Rules:',
  '- One fact per predicate; keep each fact self-contained and minimal.',
  '- Every fact is a subject-predicate-object triple with a natural-language `content`.',
  '- `subject`/`object` are { type, id, name? } references (e.g. type "user", id "user:alice").',
  '- Classify `type` as semantic (enduring knowledge), episodic (a specific past event), or procedural (how-to steps).',
  '- Set `confidence` in [0,1] reflecting how certain the source statement is.',
  '- Optionally attach `qualifiers`, `ttl`, `tags`, or `entities`.',
  'Return ONLY a JSON array. No prose, no code fences.',
].join('\n')

/**
 * 宽松的抽取事实输入校验（与模型 output 契约对应）。经 safeParse 后映射为
 * `AtomicFactInput`，缺 scope/source（由抽取器按当前调用补全）与非法的条目被丢弃。
 */
const extractionFactSchema = z.object({
  subject: z.object({ type: z.string(), id: z.string(), name: z.string().optional() }),
  predicate: z.string(),
  object: z.object({ type: z.string(), id: z.string(), name: z.string().optional() }),
  content: z.string(),
  type: z.enum(['semantic', 'episodic', 'procedural']),
  confidence: z.number().min(0).max(1),
  qualifiers: z.record(z.string(), z.unknown()).optional(),
  ttl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
})

/**
 * 抽取器：经 `ctx.llm.stream` + BlockAssembler 调用独立 LLM（主会话 LLM 不做抽取）。
 * 任何失败（无路由、网络、解析错误）都软失败为 `[]`，绝不让装配/写入崩溃。
 */
function normalizeSps(sps: { type: string; id: string; name?: string | undefined }): SpsObject {
  return {
    type: sps.type,
    id: sps.id,
    ...(sps.name !== undefined ? { name: sps.name } : {}),
  }
}

/**
 * 按路由模式解析抽取用的 provider/model。
 * - `reuse`：复用主会话配置的默认路由（`ctx.agentDefaultModel.currentSelection()`）；
 *   该服务未挂载或返回空时回退到独立配置。
 * - `independent`：用 `dsh-memory` 设置里的 provider/model（空串回退默认占位）。
 */
function resolveExtractionRoute(ctx: Context, settings: MemorySettings): { provider: string; model: string } {
  if (settings.routeMode === 'reuse') {
    const defaultModel = (ctx as unknown as {
      agentDefaultModel?: { currentSelection(): { provider: string; model: string } }
    }).agentDefaultModel
    if (defaultModel !== undefined) {
      const sel = defaultModel.currentSelection()
      if (sel.provider.length > 0 && sel.model.length > 0) {
        return { provider: sel.provider, model: sel.model }
      }
    }
  }
  return {
    provider: settings.provider.length > 0 ? settings.provider : DEFAULT_EXTRACTION_PROVIDER,
    model: settings.model.length > 0 ? settings.model : DEFAULT_EXTRACTION_MODEL,
  }
}

class LlmExtractor implements Extractor {
  private readonly logger: { warn(msg: unknown, ...rest: unknown[]): void }

  constructor(private ctx: Context) {
    // 独立 logger 便于在抽取上下文中单点记录（不复用宿主 apply 的 logger 实例）。
    this.logger = ctx.logger('dsh-memory.extractor')
  }

  /**
   * 把 `content` 拆为候选原子事实。scope 由调用方（service/queue）传入并写入每条事实。
   * 每次调用读取 `dsh-memory` 设置中的真实 provider/model（未配置则回退默认）。
   */
  async extract(content: string, scope: string): Promise<AtomicFactInput[]> {
    if (!content || content.trim().length === 0) return []
    const settings = readMemorySettings(this.ctx)
    const { provider, model } = resolveExtractionRoute(this.ctx, settings)
    const source: FactSource = {
      type: 'llm_inference',
      uri: `llm:${model}`,
      extracted_by: model,
      credibility: 0.6,
    }
    try {
      const userPrompt = [
        'Extract atomic memory facts from the following text. Return a JSON array.',
        '',
        'TEXT:',
        content,
      ].join('\n')
      const options: GenerateOptions = {
        provider,
        model,
        messages: [createUserMessage({
          content: [{ type: 'text', text: userPrompt }],
          source: { kind: 'plugin', plugin: 'dsh-memory' },
        })],
        system: EXTRACTION_SYSTEM_PROMPT,
        maxTokens: settings.extractionMaxTokens,
      }
      const assembler = new BlockAssembler()
      for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
      const text = assembler.blocks()
        .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return this.parseFacts(text, scope, source)
    } catch (err) {
      this.logger.warn('memory extraction failed (soft):', err)
      return []
    }
  }

  /** 解析模型输出的 JSON 数组，逐条 lint，非法条目丢弃。 */
  private parseFacts(raw: string, scope: string, source: FactSource): AtomicFactInput[] {
    if (!raw || raw.trim().length === 0) return []
    // 容忍模型把数组包在 ```json ... ``` 围栏里
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch (err) {
      this.logger.warn('memory extraction returned non-JSON, dropping:', err)
      return []
    }
    if (!Array.isArray(parsed)) return []
    const facts: AtomicFactInput[] = []
    for (const item of parsed) {
      const result = extractionFactSchema.safeParse(item)
      if (!result.success) continue
      const subject = normalizeSps(result.data.subject)
      const object = normalizeSps(result.data.object)
      facts.push({
        subject,
        predicate: result.data.predicate,
        object,
        content: result.data.content,
        type: result.data.type,
        confidence: result.data.confidence,
        scope,
        source,
        privacy: 'private',
        ...(result.data.qualifiers !== undefined ? { qualifiers: result.data.qualifiers } : {}),
        ...(result.data.ttl !== undefined ? { ttl: result.data.ttl } : {}),
        ...(result.data.tags !== undefined ? { tags: result.data.tags } : {}),
        ...(result.data.entities !== undefined ? { entities: result.data.entities } : {}),
      })
    }
    return facts
  }
}

export function apply(ctx: Context): void {
  const logger = ctx.logger('dsh-memory')

  // 0) 注册抽取路由等设置（settings 服务可选；存在时才注册命名空间）。
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(MEMORY_SETTINGS_NAMESPACE, MemorySettingsSchema)
  })

  ctx.effect(() => {
    const memory = assemble(ctx)
    activeMemory = memory

    const disposers = [
      // 1) 暴露记忆服务，供其他插件/工具注入
      ctx.provide('memory', memory),

      // 2) 记忆工具
      ctx.tools.register(rememberTool(memory)),
      ctx.tools.register(recallTool(memory)),
      ctx.tools.register(forgetTool(memory)),
      ctx.tools.register(readUserProfileTool(memory)),

      // 3) 系统提示：记忆意识
      ctx.systemPrompt.section({
        name: 'memory-awareness',
        order: 850,
        text: [
          'You have persistent memory modelled as atomic facts.',
          'Use memory_recall to retrieve relevant facts before answering.',
          'Use memory_remember to store important preferences, decisions, or facts you learn.',
        ].join('\n'),
      }),
    ]

    return () => {
      activeMemory = undefined
      disposers.forEach((d) => d())
    }
  }, 'dsh-memory: assemble services')

  // 4) 检索注入（RAG）—— agent/pre-step 追加检索段
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const memory = activeMemory
    if (!memory) return decision
    const facts = await memory.recall({
      query: lastUserText(messages),
      queryEmbedding: [], // 真实实现经向量索引生成 query embedding（见 DshVectorIndex）
      scope: scopeOf(agent),
      topK: 5,
    })
    if (facts.length === 0) return decision
    const context: UserMessage = createUserMessage({
      content: [{ type: 'text', text: renderMemoryBlock(facts) }],
      source: { kind: 'plugin', plugin: name, form: 'instructions' },
    })
    return { ...decision, messages: [...decision.messages, context] }
  })

  // 5) 记忆写入观察—— session/event 只投递，session/flush 异步落地
  ctx.on('session/event', (session, event) => {
    if (event.type === 'assistant/message' || event.type === 'tool/result') {
      enqueueExtraction(ctx, session.id, event)   // 同步只投递到内部队列
    }
  })
  ctx.on('session/flush', (session) => drainExtractionQueue(ctx, session.id))

  // 6) 隐私拦截—— 敏感记忆写入前 ask/deny
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'memory_remember' && isSensitive(exec.arguments)) {
      return { kind: 'ask', reason: '该内容可能包含敏感信息，请确认是否写入记忆' }
    }
    return next()
  })

  // 7) 后台定时整合与遗忘（cordis-plugin-timer：interval(callback, delay)）
  const timer = (ctx as { timer?: { interval(cb: () => void, ms: number): () => void } }).timer
  timer?.interval(() => {
    const memory = activeMemory
    if (memory) runConsolidate(ctx, memory).catch((err) => logger.warn('consolidate failed', err))
  }, 6 * 60 * 60 * 1000) // 每 6 小时

  logger.info('dsh-memory host half applied')
}

/** 把检索到的记忆事实渲染为注入上下文的文本块（供 pre-step 追加到 messages）。 */
function renderMemoryBlock(facts: Array<{ content: string; confidence: number }>): string {
  return [
    '<memory_context>',
    ...facts.map((f) => `- ${f.content} (conf ${f.confidence.toFixed(2)})`),
    '</memory_context>',
  ].join('\n')
}

// —— 记忆写入队列与后台落地 ——
// 队列按 scope 分片（FIFO 每片），session/event 只投递文本，session/flush 时出队后台抽取。
const extractionQueue = new Map<string, string[]>()

/** 由 sessionId 派生业务 scope（与 `scopeOf`/`user:<id>` 的风格保持一致）。 */
function scopeFromSession(sessionId: string): string {
  return `user:${sessionId}`
}

/** 从 assistant/message 或 tool/result 事件中宽容提取用户可见文本（绝不抛出）。 */
function eventText(event: unknown): string {
  if (typeof event !== 'object' || event === null) return ''
  const data = (event as { data?: { message?: { content?: unknown } } }).data
  const content = data?.message?.content
  if (!Array.isArray(content)) return ''
  const textParts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 0) textParts.push(b.text)
  }
  return textParts.join('\n')
}

function enqueueExtraction(ctx: Context, sessionId: string, event: unknown): void {
  const text = eventText(event)
  if (!text) return
  const scope = scopeFromSession(sessionId)
  const list = extractionQueue.get(scope)
  if (list) list.push(text)
  else extractionQueue.set(scope, [text])
  void ctx // ctx 保留以对接后续背压/配额策略
}

/** 逐条调用 MemoryService.remember（内部经注入的 LlmExtractor 做 LLM 抽取并持久化）。 */
async function runExtraction(
  ctx: Context,
  scope: string,
  texts: string[],
  sessionId: string,
): Promise<void> {
  const memory = activeMemory
  if (!memory) return
  const logger = ctx.logger('dsh-memory')
  for (const text of texts) {
    try {
      await memory.remember({
        content: text,
        scope,
        source: {
          type: 'conversation',
          uri: `session:${sessionId}`,
          extracted_by: 'llm-extractor',
          credibility: 0.8,
        },
      })
    } catch (err) {
      logger.warn('memory remember/extract failed:', err)
    }
  }
}

/**
 * session/flush 检查点：出队该 session 的待抽取文本并在后台落地。
 * 优先经 ctx.jobs.start 挂后台任务；缺 job controller 时优雅降级为 fire-and-forget。
 */
async function drainExtractionQueue(ctx: Context, sessionId: string): Promise<void> {
  const scope = scopeFromSession(sessionId)
  const batch = extractionQueue.get(scope)
  if (!batch || batch.length === 0) return
  extractionQueue.delete(scope)

  // 结构性防御：jobs 的 Context 增强可能不可见（见 timer 的同类处理），故不 import dsh-jobs 类型。
  const jobs = (ctx as {
    jobs?: {
      start(spec: { kind: string; label: string; run(): { cancel(): void; done: Promise<unknown> } }): unknown
    }
  }).jobs
  if (jobs !== undefined) {
    try {
      jobs.start({
        kind: 'memory',
        label: `extract ${batch.length} memory entr${batch.length === 1 ? 'y' : 'ies'} (${scope})`,
        run: () => {
          const done = runExtraction(ctx, scope, batch, sessionId).catch((err) => {
            ctx.logger('dsh-memory').warn('background extraction failed:', err)
          })
          return { cancel: () => {}, done }
        },
      })
      return
    } catch (err) {
      // 无 job controller 或 preflight 拒绝 → 降级为 fire-and-forget
      ctx.logger('dsh-memory').warn('ctx.jobs.start unavailable, falling back:', err)
    }
  }
  // 优雅降级：直接 fire-and-forget，捕获 rejection 防未处理异常
  void runExtraction(ctx, scope, batch, sessionId).catch((err) => {
    ctx.logger('dsh-memory').warn('fallback extraction failed:', err)
  })
}

/** 后台整合与遗忘：独立 DshStore 打开同一领域表，调用 consolidate 引擎。 */
async function runConsolidate(ctx: Context, _memory: MemoryService): Promise<void> {
  const logger = ctx.logger('dsh-memory')
  try {
    const store = new DshStore(ctx)
    const stats = await consolidate({ store })
    logger.info('consolidate complete', stats)
  } catch (err) {
    logger.warn('consolidate failed:', err)
  }
}

/** 简单敏感识别：电话/身份证/API-key/密钥关键词命中即敏感。保守、可配置。 */
const SENSITIVE_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'cn-phone', re: /\b\d{11}\b/ },          // 11 位手机号
  { label: 'cn-id', re: /\b\d{15}(\d{2}[\dXx])?\b/ }, // 15/18 位身份证
  { label: 'api-key', re: /(sk-[a-zA-Z0-9]{16,})/ },   // 常见 API key 前缀
  { label: 'secret-word', re: /(password|passwd|secret|token|api[_-]?key|credential)/i },
]

function isSensitive(args: unknown): boolean {
  const text = typeof args === 'string'
    ? args
    : (() => {
      try { return JSON.stringify(args) } catch { return '' }
    })()
  if (!text) return false
  return SENSITIVE_PATTERNS.some(({ re }) => re.test(text))
}
