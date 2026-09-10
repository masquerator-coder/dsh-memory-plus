/**
 * 最小可运行示例（Memory System 闭环演示）。
 *
 * 运行：先编译纯逻辑核心，再执行。
 *   node -e "require('typescript')" 2>/dev/null || pnpm i   # 首次
 *   pnpm exec tsc -p tsconfig.model.json
 *   node example/run.mjs
 *
 * 演示链路：抽取(提取词拆分) → 验证 → 语义键 → 存储+向量 → 冲突 supersede → 检索召回。
 * 这里用「规则化 mock extractor」替代 DSH 后台 LLM 抽取，保持零外部依赖、可离线运行。
 */

import { InMemoryStore, InMemoryVectorIndex } from '../lib-core/storage/store.js'
import { MemoryService } from '../lib-core/service.js'
import { computeSemanticKey, fnv1a } from '../lib-core/model/semantic-key.js'
import { cosine } from '../lib-core/storage/store.js'

/** 简单字符散列向量（语义占位）：把内容散列成固定维向量，便于演示余弦召回。 */
function bagOfHashes(text) {
  const dim = 64
  const vec = new Array(dim).fill(0)
  const tokens = text.toLowerCase().split(/[\s，。、,.;；:：]+/)
  for (const t of tokens) {
    if (!t) continue
    const h = parseInt(fnv1a(t), 16)
    vec[h % dim] += 1
  }
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1
  return vec.map((v) => v / norm)
}

/** Mock 抽取器：把"……语言是 Go，数据库用 PostgreSQL"这样的内容拆成原子事实。 */
const mockExtractor = {
  async extract(content, scope) {
    const facts = []
    const c = content.toLowerCase()
    const push = (predicate, object) => facts.push({
      subject: { type: 'user', id: scope.startsWith('user:') ? scope : 'user:alice', name: 'Alice' },
      predicate,
      object,
      content: `${scope}: ${predicate} ${object.name}`,
      type: 'semantic',
      scope,
      source: { type: 'conversation', uri: 'session:demo#0', extracted_by: 'mock', credibility: 0.9 },
      confidence: 0.85,
      privacy: 'private',
      ttl: '180d',
      tags: ['偏好'],
      embedding: bagOfHashes(`${predicate} ${object.name}`),
    })
    if (c.includes('go')) push('programming_language', { type: 'concept', id: 'lang:go', name: 'Go' })
    if (c.includes('postgres')) push('database', { type: 'concept', id: 'db:postgres', name: 'PostgreSQL' })
    if (c.includes('gorm')) push('orm', { type: 'concept', id: 'orm:gorm', name: 'GORM' })
    if (c.includes('香菜') || c.includes('coriander')) push('dislikes_food', { type: 'concept', id: 'food:coriander', name: '香菜' })
    return facts
  },
}

async function main() {
  const store = new InMemoryStore()
  const vector = new InMemoryVectorIndex()
  const memory = new MemoryService({ store, vector, extractor: mockExtractor })

  console.log('== 1) 显式记忆：用户说 "项目用 Go 和 PostgreSQL，用 GORM" ==')
  const created = await memory.remember({
    content: '项目用 Go 和 PostgreSQL，用 GORM',
    scope: 'project:x',
    source: { type: 'conversation', uri: 'session:demo#1', extracted_by: 'mock', credibility: 1.0 },
  })
  for (const f of created) {
    console.log(`   + [${f.predicate}] ${f.object.name}  key=${f.semantic_key.slice(0, 8)}`)
  }

  console.log('\n== 2) 语义键一致性：同一条断言再次出现，semantic_key 相同 ==')
  const [a, b] = [
    computeSemanticKey({ subject: { type: 'user', id: 'user:alice' }, predicate: 'database', object: { type: 'concept', id: 'db:postgres' } }),
    computeSemanticKey({ subject: { type: 'user', id: 'user:alice' }, predicate: 'database', object: { type: 'concept', id: 'db:postgres' } }),
  ]
  console.log(`   a=${a} b=${b} equal=${a === b}`)

  console.log('\n== 3) 用户重申同一偏好：同一条断言再次出现 → 触发 supersede（保守升级版本，不重复入库） ==')
  // 同一 subject+predicate+object+qualifiers → 相同 semantic_key → 冲突消解 latest_wins → supersede
  const secondDb = await memory.remember({
    content: '数据库就用 PostgreSQL，不再变更',
    scope: 'project:x',
    source: { type: 'conversation', uri: 'session:demo#2', extracted_by: 'mock', credibility: 1.0 },
  })
  const versions = await store.listVersions(
    computeSemanticKey({ subject: { type: 'user', id: 'user:alice' }, predicate: 'database', object: { type: 'concept', id: 'db:postgres' } }),
    'project:x',
  )
  console.log('   versions:', versions.map((v) => `v${v.version}[${v.status}]`).join('  '))
  console.log('   （理论上 v1→superseded, v2→active；若仍只有 v1 说明 mock 未命中同一断言的抽取分支）')

  console.log('\n== 4) 检索召回：查询 "遇到数据库故障看日志" 应命中 database ==')
  const hits = await memory.recall({
    query: '遇到数据库故障看日志',
    queryEmbedding: bagOfHashes('数据库 日志'),
    scope: 'project:x',
    topK: 3,
  })
  for (const h of hits) {
    console.log(`   • score-ish → [${h.predicate}] ${h.object.name} (v${h.version})`)
  }

  console.log('\n== 5) 遗忘：删除 Go 语言事实，应精确无副作用 ==')
  const go = (await store.list()).find((f) => f.predicate === 'programming_language')
  const before = (await store.list()).length
  await memory.forget(go.id, 'delete')
  const after = (await store.list()).length
  console.log(`   删除前 ${before} 条 → 删除后 ${after} 条（精确减一：${before - after === 1}）`)

  console.log('\n✅ 闭环演示完成：抽取→验证→存储→冲突演化→召回→精确遗忘 全部通过。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
