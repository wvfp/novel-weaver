# Tasks

## 方向 4：质量保障（先行）

- [x] Task 1: Hook 单元测试
  - [x] 1.1: 创建 `src/hooks/messages-transform.test.ts` — 测试 DB 未初始化/有章节/无章节 3 个场景
  - [x] 1.2: 创建 `src/hooks/system-transform.test.ts` — 测试有锚点/antiAi 启用/无配置 3 个场景
  - [x] 1.3: 创建 `src/hooks/tool-execute-after.test.ts` — 测试写作工具/非写作工具 2 个场景

- [x] Task 2: Genre Pack 加载测试
  - [x] 2.1: 创建 `src/genre-packs/loader.test.ts` — 验证 4 个 pack.json 加载和 arcTemplates 解析

- [x] Task 3: DB 初始化测试
  - [x] 3.1: 创建 `src/db/index.test.ts` — 验证 schema 创建、表存在、FTS 索引

## 方向 1：novel-app 真正可用

- [x] Task 4: Chat 页面接入 OpenCode SDK
  - [x] 4.1: 创建 `packages/novel-app/src/lib/opencode-client.ts` — 封装 SDK 的 session/message/stream API
  - [x] 4.2: 重写 `packages/novel-app/src/pages/chat.tsx` — 真实对话界面，SSE 流式输出，工具调用卡片

- [x] Task 5: 首页接入 Dashboard API
  - [x] 5.1: 重写 `packages/novel-app/src/pages/home.tsx` — 从 /api/project 和 /api/pipeline 拉取真实数据，错误处理

- [x] Task 6: 编辑器接入章节 API
  - [x] 6.1: 重写 `packages/novel-app/src/pages/editor.tsx` — 从 /api/chapters/:id 拉取内容，预览模式

- [x] Task 7: 世界观/角色/篇章面板接入 API
  - [x] 7.1: 重写 `packages/novel-app/src/pages/world.tsx` — 从 /api/worlds、/api/characters、/api/arcs 拉取数据
  - [x] 7.2: 重写 `packages/novel-app/src/pages/review.tsx` — 从 /api/chapters 拉取审查数据

- [x] Task 8: 移动端响应式布局
  - [x] 8.1: 修改 `packages/novel-app/src/app.tsx` — 移动端汉堡菜单
  - [x] 8.2: 修改各页面 — 响应式断点适配

- [x] Task 9: Service Worker 注册
  - [x] 9.1: 修改 `packages/novel-app/src/entry.tsx` — 注册 SW
  - [x] 9.2: 更新 `packages/novel-app/public/sw.js` — 缓存策略优化

## 方向 2：Genre Pack 深度集成

- [x] Task 10: 新增 genre 工具
  - [x] 10.1: 创建 `src/tools/genre.ts` — novel_genre_list + novel_genre_config 工具
  - [x] 10.2: 修改 `src/index.ts` — 注册 2 个新工具

- [x] Task 11: Agent prompt 动态组合
  - [x] 11.1: 修改 `src/agents/prompts/WorldBuilder.ts` — 读取 genre pack 追加题材约束
  - [x] 11.2: 修改 `src/agents/prompts/Reviewer.ts` — 读取 genre pack 追加审查标准
  - [x] 11.3: 修改 `src/agents/prompts/PlotPlanner.ts` — 读取 genre pack 追加题材调整

- [x] Task 12: 章节引擎 Genre Pack 集成
  - [x] 12.1: 修改 `src/modules/chapter/genre-utils.ts` — 集成 GenrePackRegistry
  - [x] 12.2: 修改 `src/modules/chapter/constants.ts` — arc_type 常量和 genre 别名
  - [x] 12.3: 修改 `src/modules/chapter/config-utils.ts` — genre 配置工具
  - [x] 12.4: 修改 `src/modules/chapter/engine/dispatcher.ts` — 注入 genre writingRules

## 方向 3：插件深度化 Phase 2

- [x] Task 13: chat.message hook 意图检测
  - [x] 13.1: 创建 `src/hooks/intent-gate.ts` — 关键词检测器（write-next/review/continue/check）
  - [x] 13.2: 创建 `src/hooks/chat-message.ts` — 意图检测 + pipeline 上下文注入
  - [x] 13.3: 修改 `src/index.ts` — 注册 chat.message hook

- [x] Task 14: event hook 自动推进
  - [x] 14.1: 创建 `src/hooks/event.ts` — 监听工具完成事件，自动推进 pipeline
  - [x] 14.2: 修改 `src/index.ts` — 注册 event hook

## 构建验证

- [x] Task 15: 全量构建验证
  - [x] 15.1: novel-plugin `npm run typecheck` 通过
  - [x] 15.2: novel-plugin `npm run build` 通过（ESM + CJS + DTS）
  - [x] 15.3: novel-app `vite build` 通过（57KB JS + 15KB CSS）
  - [x] 15.4: novel-plugin 测试文件已排除 typecheck（tsconfig exclude），bun test 通过

# Task Dependencies

- Task 1, 2, 3 可并行（测试互不依赖） ✓
- Task 4 → Task 8（Chat 页面完成后做移动端适配） ✓
- Task 5, 6, 7 可并行（各页面独立） ✓
- Task 10 → Task 11（genre 工具先于 agent prompt 改造） ✓
- Task 10 → Task 12（genre 工具先于章节引擎集成） ✓
- Task 13, 14 可并行（两个 hook 互不依赖） ✓
- Task 1-3 和 Task 4-14 可并行（测试和功能开发互不阻塞） ✓
- Task 4-14 → Task 15（所有功能完成后最终验证） ✓
