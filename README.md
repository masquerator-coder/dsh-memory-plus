# dsh-memory

DeepSeek Harness 记忆系统插件（Host + Browser 双半）。基于原子事实模型为 DSH 提供跨会话持久记忆：抽取、召回、整合、遗忘，以及 soul.md / user.md，并在设置页注入「记忆」分区。

本包是对《整体框架设计》《UI 设计说明》《DSH 上下文管理机制》三份文档的**规范适配实现骨架**；设计依据见 `DeepSeek Harness 记忆系统插件 · DSH 插件规范适配设计.md`（同目录）。

## 结构

```
src/
├── model/           原子事实模型、语义键、验证（纯 TS，可独立编译）
├── storage/store.ts MemoryStore / VectorIndex 窄接口 + 内存实现（纯 TS）
├── engines/         Remember / Recall / Consolidate（纯 TS，依赖注入）
├── service.ts       MemoryService 组合门面（纯 TS）
├── index.ts         Host 半 apply(ctx)：装配 + DSH 扩展点注册（需 DSH workspace）
├── storage/         DSH 存储封装（kv.ts / vector.ts）
├── adapters/        tools.ts / session.ts / util.ts（需 DSH workspace）
├── remote/          MemoryRemote 契约（@Remote）
└── client/          Browser 半：settings.section 注入「记忆」分区
example/run.mjs      最小可运行闭环（抽取→验证→存储→召回→遗忘）
```

## 快速验证（纯逻辑核心，零 @deepseek-ai 依赖）

```bash
# 用 DSH 内置 tsc 编译纯逻辑核心到 lib-core/
& "D:/Apps/deepseek-harness/node_modules/.bin/tsc.cmd" -p tsconfig.model.json
# 运行最小闭环示例
node example/run.mjs
```

`example/run.mjs` 演示：mock 抽取一因果 → 验证 → 语义键去重 → 冲突 supersede 演进 → 向量召回最新版本 → 精确遗忘。全部通过即为成功。

## 在 DSH 内构建（完整接口层）

接口层（`src/index.ts`、`storage/{kv,vector}.ts`、`adapters/`、`remote/`、`client/`）依赖 `@deepseek-ai/*` 与 DSH 浏览器侧类型：

1. 将本包放入 DSH workspace：`packages/extensions/dsh-memory`。
2. 在 `--filter` 或根 `tsconfig` project references 中引入。
3. `pnpm install`（解析 `workspace:*` peerDeps）。
4. `pnpm --filter @dsh/dsh-memory build`（tsdown 或 tsc，产出 `lib/index.js` + `lib/client.js`）。

接口层的关键实现路径（placeholder 注释未展开处）见 `docs/implementation.md`。

## package.json 双半说明

- `exports["."]` → Host 半（node）：记忆服务、引擎、工具、事件注入。
- `exports["./client"]` → Browser 半：`settings.section` 注入，`@Remote` 调用 Host。
- `dsh.client { platform: 'web', inject: [...] }` 声明浏览器 bundle 装载。

## 许可

MIT
