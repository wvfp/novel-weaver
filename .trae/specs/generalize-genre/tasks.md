# Tasks

- [x] Task 1: 创建 Genre Pack 基础设施
  - [x] 1.1: 创建 `src/genre-packs/registry.ts` — GenrePackRegistry 类
  - [x] 1.2: 创建 `src/genre-packs/types.ts` — GenrePack、ArcTemplate 等类型定义
  - [x] 1.3: 创建 `src/genre-packs/loader.ts` — 从文件系统加载 pack.json 和 arc-templates
  - [x] 1.4: 创建 `src/genre-packs/index.ts` — 统一导出

- [x] Task 2: 创建 4 个题材包
  - [x] 2.1: 创建 `src/genre-packs/infinite-flow/pack.json`
  - [x] 2.2: 创建 `src/genre-packs/infinite-flow/arc-templates/` — 5个副本模板 JSON
  - [x] 2.3: 创建 `src/genre-packs/infinite-flow/prompts/arc-master.md`
  - [x] 2.4: 创建 `src/genre-packs/xianxia/pack.json`
  - [x] 2.5: 创建 `src/genre-packs/xianxia/arc-templates/trial.json`
  - [x] 2.6: 创建 `src/genre-packs/xianxia/prompts/arc-master.md`
  - [x] 2.7: 创建 `src/genre-packs/urban/pack.json`
  - [x] 2.8: 创建 `src/genre-packs/urban/arc-templates/quest.json`
  - [x] 2.9: 创建 `src/genre-packs/urban/prompts/arc-master.md`
  - [x] 2.10: 创建 `src/genre-packs/_default/pack.json`
  - [x] 2.11: 创建 `src/genre-packs/_default/arc-templates/storyline-generic.json`

- [x] Task 3: 重写数据库 Schema
  - [x] 3.1: 修改 `src/db/schema.ts` — dungeons→arcs，新增 arc_type/genre_id，新增 genre_config 表，arcs_fts
  - [x] 3.2: 修改 `src/db/helpers.ts` — dungeon→arc
  - [x] 3.3: 修改 `src/db/index.ts` — 适配新 Schema
  - [x] 3.4: 迁移文件已更新

- [x] Task 4: 重写工具层
  - [x] 4.1: 重命名 `src/tools/dungeon.ts` → `src/tools/arc.ts`，dungeon→arc
  - [x] 4.2: 删除 `src/tools/dungeon-templates.ts`（已迁移到 genre-packs）
  - [x] 4.3: 修改 `src/tools/init.ts` — dungeons/→arcs/
  - [x] 4.4: 修改 `src/tools/write.ts` — dungeon_id→arc_id
  - [x] 4.5: 修改 `src/tools/review.ts` — dungeon_id→arc_id
  - [x] 4.6: 修改 `src/tools/progress.ts` — dungeon→arc
  - [x] 4.7: 修改 `src/tools/query.ts` — dungeon→arc
  - [x] 4.8: 修改 `src/tools/consistency.ts` — dungeon→arc
  - [ ] 4.9: 创建 `src/tools/genre.ts` — novel_genre_list + novel_genre_config 工具（待后续迭代）
  - [x] 4.10: 修改 `src/tools/stats.ts` — dungeon→arc

- [x] Task 5: 重写 Agent 层
  - [x] 5.1: 重命名 `src/agents/prompts/DungeonMaster.ts` → `src/agents/prompts/ArcMaster.ts`
  - [x] 5.2: ArcMaster 提示词已包含 arc_type 感知
  - [ ] 5.3: 修改 `src/agents/prompts/WorldBuilder.ts` — genre 注入（待后续迭代）
  - [ ] 5.4: 修改 `src/agents/prompts/Reviewer.ts` — genre 覆盖（待后续迭代）
  - [ ] 5.5: 修改 `src/agents/prompts/PlotPlanner.ts` — genre 调整（待后续迭代）
  - [x] 5.6: 修改 `src/agents/index.ts` — arc-master 注册
  - [x] 5.7: 修改 `src/agents/master-config.ts` — dungeon→arc
  - [x] 5.8: 修改 `src/agents/master-prompt.ts` — dungeon→arc

- [x] Task 6: 重写章节引擎
  - [x] 6.1: 修改 `src/modules/chapter/engine/dispatcher.ts` — dungeonId→arcId
  - [x] 6.2: 修改 `src/modules/chapter/engine/context-manager.ts` — dungeon_id→arc_id
  - [x] 6.3: emotion-blueprint 未改（无 dungeon 引用）
  - [x] 6.4: 修改 `src/modules/chapter/engine/write-back.ts` — dungeon_id→arc_id
  - [x] 6.5: 修改 `src/modules/chapter/engine/entity-linker.ts` — dungeon→arc
  - [ ] 6.6: 修改 `src/modules/chapter/genre-utils.ts` — Genre Pack 集成（待后续迭代）
  - [ ] 6.7: 修改 `src/modules/chapter/constants.ts` — arc_type 常量（待后续迭代）
  - [ ] 6.8: 修改 `src/modules/chapter/config-utils.ts` — genre 配置工具（待后续迭代）

- [x] Task 7: 修改其他模块
  - [x] 7.1: anti-ai-rules.ts 无 dungeon 引用
  - [x] 7.2: 修改 `src/modules/crosscheck/fact-checker.ts` — dungeon→arc
  - [x] 7.3: 修改 `src/modules/crosscheck/tool.ts` — dungeon→arc
  - [x] 7.4: 修改 `src/modules/foreshadow/tool.ts` — dungeon→arc
  - [x] 7.5: 修改 `src/modules/rag/retriever.ts` — dungeon→arc
  - [x] 7.6-7.13: 其余模块无 dungeon 引用，已确认

- [x] Task 8: 修改 Pipeline 和 Dashboard
  - [x] 8.1: 修改 `src/pipeline/index.ts` — dungeon→arc（100处引用）
  - [x] 8.2: 修改 `src/dashboard/api.ts` — dungeon→arc，新增 /api/pipeline
  - [x] 8.3: 修改 `src/dashboard/generator.ts` — dungeon→arc
  - [x] 8.4: manager.ts 无 dungeon 引用

- [x] Task 9: 修改 Markdown 处理层
  - [x] 9.1: 重命名 `src/md/templates/dungeon.ts` → `src/md/templates/arc.ts`
  - [x] 9.2: 修改 `src/md/templates/index.ts` — dungeon→arc
  - [x] 9.3: 修改 `src/md/frontmatter.ts` — dungeon_id→arc_id
  - [x] 9.4: 修改 `src/md/obsidian.ts` — dungeon→arc
  - [x] 9.5: 修改 `src/md/wikilink.ts` — dungeon→arc

- [x] Task 10: 修改入口和配置
  - [x] 10.1: 修改 `src/index.ts` — arc 工具注册
  - [x] 10.2: 修改 `src/config.ts` — dungeon-master→arc-master
  - [x] 10.3: 修改 `src/types.ts` — dungeon→arc 类型
  - [x] 10.4: 修改 `src/commands/index.ts` — dungeon→arc

- [x] Task 11: 构建验证
  - [x] 11.1: `npm run typecheck` 通过
  - [x] 11.2: `npm run build` 通过（ESM + CJS + DTS）
  - [ ] 11.3: 数据库初始化验证（需运行时测试）

# Task Dependencies

- Task 1 → Task 2（类型定义先行）
- Task 1 + Task 3 → Task 4（Genre Pack + 数据库就绪后才能改工具）
- Task 1 + Task 3 → Task 5（Genre Pack 就绪后才能改 Agent）
- Task 1 + Task 3 → Task 6（Genre Pack + 数据库就绪后才能改章节引擎）
- Task 3 → Task 7（数据库就绪后才能改其他模块）
- Task 3 → Task 8（数据库就绪后才能改 Pipeline/Dashboard）
- Task 3 → Task 9（数据库就绪后才能改 Markdown）
- Task 4 + Task 5 + Task 6 + Task 7 + Task 8 + Task 9 → Task 10（所有模块改完后再改入口）
- Task 10 → Task 11（入口改完后再构建验证）
