# Novel-Weaver 写作质量全面升级

## TL;DR

> **Quick Summary**: 对 novel-weaver 插件进行写作质量全面升级，新增结构化 DB 记忆系统、PlotWriter 子 Agent、Anti-AI 7 层检测体系、题材模板系统和风格锚点系统。
>
> **Deliverables**:
> - 4 张新 DB 表（chapter_facts, character_states, outlines, aliases）+ 类型定义
> - 题材模板框架 + 5 种深度模板（仙侠/科幻/都市/恐怖/末世）
> - 写前上下文打包引擎 + 状态回写引擎 + 上下文评分层
> - PlotWriter 第 5 个子 Agent + 4 个现有 Agent 提示词升级
> - Anti-AI 7 层检测体系（写前预防 + 写后检测 + 自动修复）
> - 风格锚点系统（自动提取 + 手动管理）
> - 跨章节一致性工具（novel_crosscheck, novel_state_snapshot, novel_foreshadow, novel_style_anchor）
> - **AI 动态生成 Dashboard**：AI 读取项目数据后为每本小说生成独一无二的 HTML 页面（非固定模板，页面结构 + 视觉风格 + 导航方式完全由 AI 根据项目内容决定）
>
> **Estimated Effort**: Large (30 TODOs across 6 waves, ~4 UI tasks)
> **Parallel Execution**: YES — 6 waves, 4-8 tasks per wave
> **Critical Path**: Wave 1 (schema + types) → Wave 2 (engines) → Wave 3 (agents + detection) → Wave 4 (tools) → Wave 5 (dashboard) → Wave FINAL (verification)

---

## Context

### Original Request
全面提升 novel-weaver 的写作质量，使其能应对网文作家常见问题（卡文、前后矛盾、OOC、伏笔遗忘、节奏失控、注水、爽点不足、大纲偏离），并有效消除 AI 文风（AI味）。

### Interview Summary
**Key Discussions**:
- **写作质量优先**：非 Bug 修复/安全加固，专注功能升级
- **全面升级**：结构化 DB 记忆 + PlotWriter Agent + 多题材模板 + Prompt 升级 + Anti-AI 体系
- **PlotWriter 架构**：子 Agent 协作模式（主模型调用 Agent 生成正文）
- **DB 迁移**：直接修改 schema.ts 重建（个人工具，接受重初始化）
- **测试策略**：仅 Agent QA，不搭建测试框架
- **风格锚点**：自动从已有章节提取 + 手动替换/补充

**Research Findings**:
- **webnovel-writer**: 6-step write pipeline, chapter_commit_service, context_manager, entity_linker, state_manager, 7-layer anti-AI, 38 genre templates, 4-agent system. Most directly relevant reference.
- **tianming-novel-ai-writer**: 12-dimension fact snapshot, 9 change declarations, 6 gate checks, data center packaging per chapter.
- **Pratilipi**: 4-layer memory architecture, checkpoint system, iterative generate/critique loop.
- **sql.js**: Synchronous WASM SQLite (only initSqlJs() is async; all queries sync)
- **FTS4 only**: sql.js WASM builds lack FTS5
- **No test runner**: explicitly prohibited in AGENTS.md

### Metis Review
**Identified Gaps** (addressed):
- **Migration strategy**: Rebuild schema.ts (existing users re-init). ✅ Decided.
- **PlotWriter architecture**: Sub-agent collaboration mode. ✅ Decided.
- **SQL injection scope**: New code uses parameterized queries; existing code left untouched. ✅ Defaulted.
- **7 anti-AI layers**: Locked to exact 7 layers named in plan. ✅ Defined.
- **Genre templates**: Locked to 5 (仙侠/科幻/都市/恐怖/末世). ✅ Defined.
- **Style anchor edge cases**: Auto-extraction runs on init if existing chapters found; manual overrides win. ✅ Defined.
- **Genre per dungeon vs per project**: Per-project default, per-dungeon override supported in schema. ✅ Defined.

---

## Work Objectives

### Core Objective
升级 novel-weaver 插件，通过结构化记忆系统、专用写作 Agent、Anti-AI 检测体系和风格适配机制，从根本上提升 AI 生成章节的写作质量和网文口感。

### Concrete Deliverables
- 4 张新 DB 表（chapter_facts, character_states, outlines, aliases）
- 题材模板系统（5 种深度模板 + 框架）
- 写前上下文打包引擎 + 状态回写引擎
- PlotWriter Agent（第 5 个子 Agent）
- 4 个现有 Agent 提示词升级（含 7 层 Anti-AI 检测）
- 4 个新工具（novel_crosscheck, novel_state_snapshot, novel_foreshadow, novel_style_anchor）
- 风格锚点系统
- Anti-AI 替代方案速查表

### Definition of Done
- [ ] novel_init 在初始化时自动创建 4 张新表
- [ ] novel_write_chapter 可通过 Agent(PlotWriter) 协作生成正文
- [ ] 写后可自动提取章节事实并写入 chapter_facts
- [ ] Reviewer 可检测至少 5/7 层 AI 味问题
- [ ] novel_review_fix 可自动修复 AI 味问题（替换表达模式）
- [ ] 风格锚点可从已有章节自动提取
- [ ] 题材模板影响 PlotWriter 的写作风格

### Must Have
- **模块化架构**：每个领域是一个自包含的 `src/modules/<domain>/` 目录，包含 tool + queries + types，不跨模块引用
- 结构化 DB 记忆（4 张新表 + 类型定义 + 迁移）
- PlotWriter 子 Agent（中文提示词，注册到 agents/index.ts）
- Anti-AI 检测 + 修复（至少 7 层中的 5 层可用）
- 题材模板影响生成风格
- 所有新代码使用参数化 SQL 查询
- **所有新增代码的注释使用中文**（/src/ 下所有新文件的注释、JSDoc、README 中文化）
- **所有 AI 提示词使用中文**（PlotWriter 提示词 + 4 个现有 Agent 提示词全部保持/改为中文）
- **Dashboard 只通过 HTTP API 通信**，不直接 import 模块工具函数
- **温度配置**：通过 `.novel-weaverrc.json` 配置文件 + `chat.params` hook 按 Agent 设置温度
- **OpenCode 主 Agent**：导出完整的 `novel-weaver` AgentConfig（含~1500字系统提示词），用户可一键注册到 opencode.json
- **风格学习**：从已有 TXT 小说中学习风格，生成风格印记 JSON，自动注入 PlotWriter 写作提示词
- **章节概要中心**：多层级概要（单章→多章组→压缩），通过 `experimental.chat.messages.transform` hook 在系统级替换旧章节内容
- **RAG 向量化检索**：设定条目 > 20 时启用 Embedding 向量检索，通过 `experimental.chat.system.transform` hook 在每次 LLM 请求时注入 Top-K 最相关设定
- **不可变事实锁定**：标记关键设定为"不可更改"，一致性检查时验证通过
- **一致性评分系统**：`novel_consistency_check` 输出 0-100 分 + 具体问题位置

### Must NOT Have (Guardrails)
- ❌ 不修改现有 Bug（SQL 注入、未保护的 sql.js 调用、fs 写入异常）
- ❌ 不搭建测试框架
- ❌ 不添加 CI/CD
- ❌ Anti-AI 检测不超过 7 层（第 8+ 层属于后续版本）
- ❌ 首批题材模板不超过 5 种
- ❌ 不合并 novel_consistency_check（保持与 novel_crosscheck 分离）
- ❌ 不添加英文 Agent 提示词（全部使用中文）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (Agent QA only)
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **DB/schema changes**: Use Bash (tsx src/index.ts) — verify no crash on startup, sqlite3 .dump to confirm tables
- **API/Tools**: Use Bash (curl to OpenCode or direct tsx execution) — verify tool output
- **Agent prompts**: Verify registration in agents/index.ts via grep
- **Evidence**: Saved to .omo/evidence/task-{N}-{scenario-slug}.{ext}

---

## Execution Strategy

> **模块化架构**：每个领域是自包含的 `src/modules/<domain>/` 目录
> 模块间不允许直接 import，通过 `src/index.ts` 统一注册工具
> 新增领域=新增目录，不改现有代码

```
src/
├── index.ts                    # 入口：import 各模块 → 注册 tool + command
│
├── modules/                    # ===== 领域模块（高内聚、不跨引用）=====
│   ├── init/                   # 项目初始化
│   │   └── tool.ts             # novel_init + schema.ts
│   ├── world/                  # 世界观
│   │   ├── tool.ts             # novel_world_create/query/link
│   │   └── queries.ts
│   ├── character/              # 角色
│   │   ├── tool.ts             # novel_character_create/update/query
│   │   └── queries.ts
│   ├── dungeon/                # 副本
│   │   ├── tool.ts             # novel_dungeon_generate/customize
│   │   ├── templates.ts        # 5 种主题预设
│   │   └── queries.ts
│   ├── chapter/                # ⭐ 写作领域（最高内聚）
│   │   ├── tool.ts             # novel_write_chapter/continue/edit
│   │   ├── queries.ts          # 章节 DB 查询
│   │   ├── genre-templates/    # 题材模板 JSON
│   │   ├── genre-utils.ts      # 题材工具函数
│   │   ├── config-utils.ts     # 配置加载
│   │   └── engine/             # # 所有写作引擎在同一个目录
│   │       ├── write-back.ts       # 状态回写+事实提取
│   │       ├── context-manager.ts  # 上下文打包
│   │       ├── ranker.ts           # 上下文评分
│   │       ├── entity-linker.ts    # 实体消歧
│   │       ├── emotion-blueprint.ts# 情绪蓝图+节奏检查
│   │       ├── genre-profile-builder.ts # 题材画像
│   │       └── dispatcher.ts       # Agent 调度
│   ├── review/                 # 审查（自包含）
│   │   ├── tool.ts             # novel_review_chapter/fix
│   │   ├── anti-ai-rules.ts    # 反 AI 规则引擎
│   │   ├── anti-ai-apply.ts    # 反 AI 自动修复
│   │   └── anti-ai-expressions.json
│   ├── consistency/            # 一致性
│   │   ├── tool.ts
│   │   └── queries.ts
│   ├── progress/               # 进度追踪
│   │   ├── tool.ts
│   │   └── queries.ts
│   ├── pipeline/               # 写作管线
│   │   └── orchestrator.ts     # 4 阶段编排
│   ├── query/                  # 智能查询+统计
│   │   ├── tool.ts             # novel_query + novel_stats
│   │   └── queries.ts
│   │
│   │   # ===== Wave 4 新增模块 =====
│   ├── crosscheck/             # 跨章节事实检查
│   │   ├── tool.ts
│   │   ├── queries.ts
│   │   └── fact-checker.ts
│   ├── state-snapshot/         # 实体状态快照
│   │   ├── tool.ts
│   │   └── queries.ts
│   ├── foreshadow/             # 伏笔追踪
│   │   ├── tool.ts
│   │   └── queries.ts
│   └── style-anchor/           # 风格锚点
│       ├── tool.ts
│       └── analyzer.ts
│
├── agents/                     # AI Agent（跨领域，保持独立）
│   ├── index.ts
│   └── prompts/
├── dashboard/                  # Dashboard（跨领域，仅通过 HTTP API 通信）
│   ├── server.ts
│   ├── api.ts                  # 唯一进口：所有模块通过 REST 暴露
│   ├── generator.ts
│   ├── manager.ts
│   └── prompts/
├── db/                         # DB 基础设施（共享）
│   ├── index.ts                # getDatabase() 单例
│   └── schema.ts               # 所有 CREATE TABLE（由 init 模块调用）
├── types/                      # 共享类型
│   └── index.ts
├── config.ts                   # 默认配置
└── commands/                   # 斜杠命令路由
    └── index.ts
```

### 温度配置（默认值表）

> 通过 `chat.params` hook + `.novel-weaverrc.json` 实现。配置文件可覆盖所有默认值。

| Agent 名称 | 默认温度 | 角色 | 理由 |
|---|---|---|---|
| `plot-writer` | **0.85** | 章节创作 | ⭐ 最高创造力，否则AI味（缓缓说道/毋庸置疑） |
| `world-builder` | **0.75** | 世界观设定 | 创意高但体系要一致 |
| `dungeon-master` | **0.75** | 副本设计 | 惊喜感+结构合理 |
| `plot-planner` | **0.65** | 剧情规划 | 创意够但不脱离逻辑 |
| `reviewer` | **0.25** | 质量审查 | ⭐ 最低温度，严格一致不瞎判 |
| `dashboard-generator` | **0.80** | 面板生成 | 视觉创意需要多样性 |
| 默认（未匹配） | **0.70** | 保底值 | — |

**配置优先级**: 代码默认值 < `.novel-weaverrc.json` < opencode.jsonc 插件选项

### Parallel Execution Waves

```
Wave 1 (Foundation — START IMMEDIATELY):
├── T1: Schema + types → modules/init/schema.ts, modules/init/tool.ts
├── T2: Genre templates → modules/chapter/genre-templates/*
├── T3: Style anchor storage → modules/style-anchor/tool.ts
├── T4: Anti-AI rules → modules/review/anti-ai-rules.ts
├── T5: Migration update → modules/init/tool.ts, db/schema.ts
└── T6: Genre utils + config → modules/chapter/genre-utils.ts, config-utils.ts

Wave 2 (Engines — depends on Wave 1 types):
├── T7: Write-back engine → modules/chapter/engine/write-back.ts
├── T8: Context assembly → modules/chapter/engine/context-manager.ts
├── T9: Context ranker → modules/chapter/engine/ranker.ts
├── T10: Entity linker → modules/chapter/engine/entity-linker.ts
├── T11: Style analyzer → modules/style-anchor/analyzer.ts
├── T12: Emotion blueprint → modules/chapter/engine/emotion-blueprint.ts
└── T13: Genre profile builder → modules/chapter/engine/genre-profile-builder.ts

Wave 3 (Agents + Detection — depends on Wave 1+2):
├── T14: PlotWriter Agent → agents/prompts/PlotWriter.ts
├── T15: Reviewer upgrade → agents/prompts/Reviewer.ts + modules/review/anti-ai-apply.ts
├── T16: World Builder upgrade → agents/prompts/world-builder-prompt.md
├── T17: Dungeon Master upgrade → agents/prompts/dungeon-master-prompt.md
├── T18: Plot Planner upgrade → agents/prompts/plot-planner-prompt.md
├── T19: novel_write_chapter → modules/chapter/tool.ts (write)
├── T20: novel_review_fix → modules/review/tool.ts (review_fix)
├── T21: novel_write_continue → modules/chapter/tool.ts (continue)
└── T31: Novel Weaver Master Agent → agents/master-prompt.ts, agents/master-config.ts

Wave 4 (Tools — depends on Wave 2 engines):
├── T22: novel_crosscheck → modules/crosscheck/tool.ts + fact-checker.ts
├── T23: novel_state_snapshot → modules/state-snapshot/tool.ts
├── T24: novel_foreshadow → modules/foreshadow/tool.ts
├── T25: novel_style_anchor → modules/style-anchor/tool.ts
└── T26: Upgrade existing tools → modules/query/tool.ts, modules/progress/tool.ts

Wave 5 (Dashboard — depends on Wave 2 DB + Wave 4 tools):
├── T27: Dashboard HTTP server → dashboard/server.ts
├── T28: Dashboard REST API → dashboard/api.ts (唯一模块进口)
├── T29: AI Dashboard generator → dashboard/generator.ts
└── T30: Dashboard manager → dashboard/manager.ts

Wave 6 (Annotation — depends on Wave 5 dashboard API):
├── T32: novel_annotations tool + PlotWriter/Reviewer integration → modules/annotations/tool.ts

Wave 7 (Style Imprint Learning — independent, parallel with Wave 4-6):
├── T33: Style imprint types + storage → modules/style-imprint/imprint-schema.ts, storage.ts
├── T34: Statistical text analyzer → modules/style-imprint/analyzer.ts
├── T35: novel_imprint tool → modules/style-imprint/tool.ts
└── T36: PlotWriter prompt injection → modules/style-imprint/injector.ts

Wave 8 (Long-Form Novel Features — depends on Wave 1 schema + Wave 2 engines):
├── T37: Chapter summary table + schema → modules/summary/schema.ts + db/schema.ts
├── T38: Summary generation engine (single → group → compress) → modules/summary/engine/
├── T39: 🔥 Summary integration via OpenCode hooks → src/index.ts (experimental.chat.messages.transform)
├── T40: RAG embedder + vector store → modules/rag/embedder.ts, vector-store.ts
├── T41: 🔥 RAG injection via OpenCode hooks → src/index.ts (experimental.chat.system.transform)
└── T42: Immutable fact locking + consistency scoring → modules/consistency/lock.ts, scorer.ts

Wave FINAL (Verification — ALL tasks complete):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: End-to-end QA (unspecified-high)
└── F4: Scope fidelity check (deep)
    → Present results → Get explicit user okay

Critical Path: T1 → T7 → T8 → T12 → T14 → T19 → T22 → T27 → F1-F4 → user okay
Parallel Speedup: ~70% faster than sequential
Max Concurrent: 6 (Wave 1)
```

---

## TODOs

### Wave 1 — Foundation (Schema + Config + Templates)

- [x] 1. **Define new DB schema + TypeScript types**

  **What to do**:
  - Create 4 new table definitions in `src/db/schema.ts`:
    - `chapter_facts`: `id TEXT PK`, `chapter_id TEXT FK→chapters`, `fact_type TEXT` (new_character/location_change/item_acquire/plot_advance/combat_result/relationship_change/state_change/hook_set/hook_payoff), `entity_ref TEXT`, `description TEXT`, `chapter_num INTEGER`, `created_at TEXT`
    - `character_states`: `id TEXT PK`, `character_id TEXT FK→characters`, `chapter_id TEXT FK→chapters`, `chapter_num INTEGER`, `status_tags TEXT` (JSON array: "昏迷/受伤/升级/突破/中毒/..." ), `power_level TEXT`, `location TEXT`, `items TEXT` (JSON array), `relationships TEXT` (JSON array of {target, type, change}), `narrative_state TEXT`, `context TEXT` ("core" or "dungeon:{dungeon_id}")
    - `outlines`: `id TEXT PK`, `dungeon_id TEXT FK→dungeons`, `outline_type TEXT` (master/volume/chapter/blueprint), `level INTEGER`, `title TEXT`, `summary TEXT`, `content TEXT` (detailed), `status TEXT` (draft/active/completed), `order_num INTEGER`
    - `aliases`: `id TEXT PK`, `entity_id TEXT`, `alias TEXT`, `entity_type TEXT` (character/world/dungeon/item), `confidence REAL DEFAULT 1.0`
  - Define TypeScript interfaces in `src/types.ts` for each table
  - Add foreign key indexes (chapter_facts.chapter_id → chapters.id, etc.)
  - Update `CREATE_TABLES_SQL` array in schema.ts

  **Must NOT do**:
  - Don't modify existing 9 tables' definitions
  - Don't remove existing FTS4 indexes
  - Don't add test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition is a well-defined, mechanical task — no creative decisions needed
  - **Skills**: None needed
  - **Skills Evaluated but Omitted**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 7-12, 25
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/db/schema.ts` — Existing schema pattern (column defs, CREATE_TABLE syntax, FTS4 virtual tables)
  - `src/db/sqljs.d.ts` — sql.js type declarations (Database, Statement interfaces)
  - `src/types.ts` — Existing type interfaces (follow naming convention)

  **Acceptance Criteria**:
  - [ ] sqlite3 .dump shows 4 new tables with correct columns
  - [ ] sqlite3 .schema chapter_facts shows all columns + FK
  - [ ] TypeScript compiles with `tsc --noEmit` (0 errors)
  - [ ] novel_init creates all 4 tables in .novel-weaver/novel-weaver.db

  **QA Scenarios**:
  ```
  Scenario: Schema creation on init
    Tool: Bash
    Preconditions: novel-weaver.db does not exist
    Steps:
      1. tsx src/index.ts  # triggers novel_init equivalent
      2. sqlite3 .novel-weaver/novel-weaver.db ".tables"
    Expected Result: Output includes "chapter_facts", "character_states", "outlines", "aliases"
    Failure Indicators: Missing any of 4 new tables
    Evidence: .omo/evidence/task-1-schema-tables.txt

  Scenario: TypeScript type check
    Tool: Bash
    Preconditions: None
    Steps:
      1. npm run typecheck
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Any tsc error about new types
    Evidence: .omo/evidence/task-1-tsc-check.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add chapter_facts, character_states, outlines, aliases tables`
  - Files: `src/db/schema.ts`, `src/types.ts`

- [x] 2. **Create genre template framework + 5 depth templates**

  **What to do**:
  - Create directory: `src/modules/chapter/genre-templates/`
  - Define template interface in `src/types/index.ts`: `GenreTemplate { id, name, description, targetWordCount, styleGuidelines[], styleRules[], forbiddenPatterns[], recommendedPatterns[], specialRules[] }`
  - Create config loading function in `src/modules/chapter/genre-utils.ts`: `loadGenreTemplate(genre: string): GenreTemplate`
  - Create 5 depth template JSON files:
    - `src/modules/chapter/genre-templates/xianxia.json`: 3000-5000字, 诗意描写, 等级体系严谨, 修行逻辑自洽
    - `src/modules/chapter/genre-templates/sci-fi.json`: 2500-4000字, 技术细节, 逻辑严谨, 科幻设定一致性
    - `src/modules/chapter/genre-templates/urban.json`: 2000-3500字, 对话真实, 现代用语, 都市氛围
    - `src/modules/chapter/genre-templates/horror.json`: 2000-3000字, 短句压抑, 感官描写, 心理紧张
    - `src/modules/chapter/genre-templates/apocalypse.json`: 2500-4000字, 粗粝质感, 生存焦点, 资源约束
  - Each template includes: writing style guide, common tropes, character archetypes, plot rhythm patterns
  - Add `genre` column usage in project init (already exists as DEFAULT_CONFIG.defaultGenre)

  **Must NOT do**:
  - Don't exceed 5 templates
  - Don't create Python files (TypeScript project)
  - Don't create Obsidian markdown templates here (separate concern)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Template content is creative Chinese web novel domain writing
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Tasks 12 (genre profile builder), 13 (PlotWriter agent), 18 (write_chapter upgrade)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/modules/dungeon/templates.ts` — Existing template pattern (5 theme presets with structured data)
  - `src/config.ts:DEFAULT_CONFIG.defaultGenre` — Default genre "fantasy", the genre config pattern
  - `/root/webnovel-writer/templates/genres/` — Reference: 38 genre templates (structure only, content is reference)
  - `/root/webnovel-writer/genres/xuanhuan/` — Reference: genre-specific writing guides with cultiation-levels, plot-patterns

  **Acceptance Criteria**:
  - [ ] loadGenreTemplate("xianxia") returns non-null template object
  - [ ] loadGenreTemplate("unknown") returns default template or null gracefully
  - [ ] Each template has all required fields (word count, style guidelines, rules)
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Template loading
    Tool: Bash (tsx -e)
    Preconditions: Template files exist
    Steps:
      1. tsx -e "import {loadGenreTemplate} from './src/modules/chapter/genre-utils'; console.log(JSON.stringify(loadGenreTemplate('xianxia')))"
    Expected Result: Non-null JSON object with styleGuidelines array
    Failure Indicators: Null/undefined, tsc error, missing fields
    Evidence: .omo/evidence/task-2-template-load.txt

  Scenario: Fallback for unknown genre
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {loadGenreTemplate} from './src/modules/chapter/genre-utils'; console.log(JSON.stringify(loadGenreTemplate('nonexistent')))"
    Expected Result: Returns null or default template (graceful fallback)
    Failure Indicators: Crashes or throws exception
    Evidence: .omo/evidence/task-2-template-fallback.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `feat(db): add chapter_facts, character_states, outlines, aliases tables`
  - Files: `src/modules/chapter/genre-utils.ts`, `src/types/index.ts`, `src/modules/chapter/genre-templates/*.json`

- [x] 3. **Create style anchor storage system**

  **What to do**:
  - Create directory `.novel-weaver/style-anchors/` at init time
  - Create `src/modules/style-anchor/tool.ts` (temporary, will be moved to full tool in Wave 4)
  - Define storage format: each anchor is an `.md` file with YAML frontmatter (title, source_chapter, created_at, tags)
  - Implement `extractStyleAnchors()` function that reads 3-5 recent chapters and extracts:
    - Sentence length distribution histogram
    - Character dialogue ratio
    - Common word frequency (top 50)
    - Paragraph length distribution
    - Punctuation usage patterns (dash frequency, exclamation ratio)
  - Store extracted stats as JSON in `.novel-weaver/style-anchors/anchor-profile.json`
  - Manual anchor: user can create `.novel-weaver/style-anchors/manual-anchor.md` which overrides auto-extracted settings

  **Must NOT do**:
  - Don't implement NLP/embeddings — statistical analysis only
  - Don't add test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File storage, statistical analysis, no complex logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Tasks 11 (style anchor analyzer), 24 (style_anchor tool)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/modules/chapter/engine/write-back.ts` — Frontmatter pattern from chapter writing
  - `src/modules/init/tool.ts` — How .novel-weaver/ subdirectories are created
  - `src/modules/consistency/tool.ts` — Report file writing pattern (Markdown + frontmatter)

  **Acceptance Criteria**:
  - [ ] extractStyleAnchors() returns sentence length distribution
  - [ ] Manual anchor file overrides auto-extracted settings
  - [ ] .novel-weaver/style-anchors/ exists after init
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Auto-extract from existing chapters
    Tool: Bash
    Preconditions: At least 3 chapters exist in .novel-weaver/content/chapters/
    Steps:
      1. tsx -e "import {extractStyleAnchors} from './src/modules/style-anchor/tool'; console.log(extractStyleAnchors())"
    Expected Result: Returns JSON with sentenceLengths, paragraphLengths, wordFreq, dialogueRatio
    Failure Indicators: Returns null/empty, crashes
    Evidence: .omo/evidence/task-3-anchor-extract.txt
  ```

  **Commit**: YES (groups with T1)
  - Files: `src/modules/style-anchor/tool.ts`, `src/modules/init/tool.ts`

- [x] 4. **Create Anti-AI expression replacement reference tables**

  **What to do**:
  - Create `src/modules/review/anti-ai-expressions.json` with 50+ replacement rules:
    - Format: `{ pattern: string, replacement: string, category: string, severity: string, layer: number }`
    - Categories: adverb_overuse, emotion_tagging, dialog_formality, structure_closure, transition_formula, summary_tendency, info_exposition
  - Example entries:
    - `{ "pattern": "缓缓说道", "replacement": "前置动作替代（他把杯子搁下——'你确定？'）", "category": "adverb_overuse", "severity": "warning", "layer": 1 }`
    - `{ "pattern": "他感到愤怒", "replacement": "生理反应+微动作（指节捏得发白）", "category": "emotion_tagging", "severity": "high", "layer": 4 }`
    - `{ "pattern": "心中暗道", "replacement": "直接写内心句，删除引导词", "category": "dialog_formality", "severity": "medium", "layer": 5 }`
    - `{ "pattern": "毋庸置疑", "replacement": "直接陈述事实", "category": "transition_formula", "severity": "warning", "layer": 1 }`
    - `{ "pattern": "总而言之", "replacement": "删除总结句", "category": "summary_tendency", "severity": "high", "layer": 2 }`
  - Create `loadAntiAiRules()` function in `src/modules/review/anti-ai-rules.ts`
  - Create helper `applyAntiAiFix(text: string): {fixed: string, changes: Change[]}` in `src/modules/review/anti-ai-rules.ts`
  - Group rules by layer (1-7) for selective application

  **Must NOT do**:
  - Don't make generative AI calls in the replacement function — pure string replacement
  - Don't exceed 7 layers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Data entry (JSON) + simple utility function, well-defined scope
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Tasks 14 (Reviewer upgrade), 19 (review_fix upgrade)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `/root/webnovel-writer/skills/webnovel-write/references/anti-ai-guide.md` — Anti-AI writing guide with alternative expression table
  - `/root/webnovel-writer/references/shared/core-constraints.md` — Anti-AI constraints section with forbidden patterns
  - `src/modules/review/tool.ts:AI_WORDS` — Existing AI word list (expand from this)

  **Acceptance Criteria**:
  - [ ] loadAntiAiRules() returns 50+ rules
  - [ ] applyAntiAiFix("他缓缓说道") returns fixed text with replacement
  - [ ] Rules grouped by layer 1-7
  - [ ] No tsc errors

  **QA Scenarios**:
  ```
  Scenario: Anti-AI rule count
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {loadAntiAiRules} from './src/modules/review/anti-ai-rules'; const r=loadAntiAiRules(); console.log('Rules:', r.length)"
    Expected Result: "Rules: 50" or more
    Failure Indicators: Returns 0 or throws
    Evidence: .omo/evidence/task-4-rule-count.txt

  Scenario: Apply fix known AI pattern
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {applyAntiAiFix} from './src/modules/review/anti-ai-rules'; const r=applyAntiAiFix('他缓缓说道：\"好的。\"'); console.log(r.fixed)"
    Expected Result: Fixed text no longer contains "缓缓说道"
    Failure Indicators: Fixed text still contains AI pattern
    Evidence: .omo/evidence/task-4-fix-result.txt
  ```

  **Commit**: YES (groups with T1)
  - Files: `src/modules/review/anti-ai-expressions.json`, `src/modules/review/anti-ai-rules.ts`

- [x] 5. **Update init module + schema for rebuild migration**

  **What to do**:
  - Update `src/db/schema.ts`: Add 5 new table CREATE TABLE statements to `CREATE_TABLES_SQL` array
    - `chapter_facts`, `character_states`, `outlines`, `aliases`, `annotations`
  - `annotations` table schema:
    ```sql
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL REFERENCES chapters(id),
      paragraph_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0,
      UNIQUE(chapter_id, paragraph_index)
    );
    ```
  - Update `src/modules/init/tool.ts`: Add `.novel-weaver/style-anchors/` directory creation + annotations table creation
  - Make schema_version start at 2 (from 1) — or handle gracefully
  - Add a `clearDatabase()` function or ensure `novel_init` works on existing db with warning
  - Update `AGENTS.md` to note schema rebuild
  - **创建 `.novel-weaverrc.json` 配置文件系统**:
    - 定义配置接口 `NovelWeaverRc`（在 `src/types.ts` 中）:
      ```typescript
      interface NovelWeaverRc {
        genre?: string;                        // 默认题材
        author?: string;                       // 作者名
        temperature?: Record<string, number>;  // 每个 Agent 的温度
        antiAi?: { enabled?: boolean; layers?: number[] };
        dashboard?: { port?: number; host?: string };
      }
      ```
    - 创建配置加载函数 `loadRcConfig(projectRoot: string): NovelWeaverRc`（在 `src/modules/init/tool.ts` 中）:
      - 查找 `{projectRoot}/.novel-weaverrc.json`
      - 找到 → 解析并合并到默认配置
      - 没找到 → 返回空对象（全走默认）
    - 在 `src/index.ts` 中，`chat.params` hook 读取 `loadRcConfig()` 结果：
      - 如果 `.novel-weaverrc.json` 有 `temperature[agent]` → 用配置文件的值
      - 否则用代码内置默认值
    - 配置优先级：**代码默认值 < `.novel-weaverrc.json` < opencode.jsonc 插件选项**

  **Must NOT do**:
  - Don't delete existing data on init without warning
  - Don't modify existing table definitions (only add new ones)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file edits, follow existing patterns
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Tasks 7-25 (everything depends on schema being correct)
  - **Blocked By**: Tasks 1 (schema types) — minor, can do in parallel but best after types

  **References**:
  - `src/modules/init/tool.ts` — Existing init flow (creates dirs, runs schema)
  - `src/db/index.ts` — MIGRATIONS array pattern
  - `src/db/schema.ts` — CREATE_TABLES_SQL array

  **Acceptance Criteria**:
  - [ ] novel_init creates all tables (old + new)
  - [ ] novel_init warns if .novel-weaver/ already exists (same behavior)
  - [ ] style-anchors/ directory created
  - [ ] no tsc errors
  - [ ] `chat.params` hook returns correct temperature per agent (grep output.temperature in src/index.ts)
  - [ ] `.novel-weaverrc.json` 存在时 `loadRcConfig()` 返回合并后的配置
  - [ ] `.novel-weaverrc.json` 不存在时 `loadRcConfig()` 返回空对象（不报错）
  - [ ] 配置文件中的 `temperature[agent]` 能覆盖代码默认值

  **QA Scenarios**:
  ```
  Scenario: Full init flow
    Tool: Bash
    Preconditions: Clean state (no .novel-weaver/)
    Steps:
      1. tsx src/index.ts
      2. ls .novel-weaver/content/
      3. sqlite3 .novel-weaver/novel-weaver.db ".tables"
    Expected Result: All dirs exist, all tables exist (old 9 + new 4)
    Failure Indicators: Missing tables, missing dirs, crash
    Evidence: .omo/evidence/task-5-init-result.txt
  ```

  **Commit**: YES (groups with T1)
  - Files: `src/db/schema.ts`, `src/modules/init/tool.ts`, `src/db/index.ts`

- [x] 6. **Create shared utility modules: genre-profile, config-loading, constants**

  **What to do**:
  - Create `src/modules/chapter/genre-utils.ts`: Genre token parsing, profile building, composite genre hints (ported from webnovel-writer's genre_profile_builder.py pattern)
    - `parseGenreTokens(raw: string): string[]` — Split "都市异能+系统流" into ["都市异能", "系统流"]
    - `buildGenreProfile(genre: string): GenreProfile` — Load template + compute writing hints
    - `getTargetWordCount(genre: string): {min: number, max: number}`
  - Create `src/modules/chapter/config-utils.ts`: Section weight configuration for context assembly (ported from webnovel-writer's context_weights.py)
    - Default template weights per section (core=1.0, scene=0.8, alerts=0.6, etc.)
    - Dynamic stage-based weights (early/mid/late chapter stages)
  - Create `src/modules/chapter/constants.ts`: Genre metadata (display names, aliases, fallback chains)

  **Must NOT do**:
  - Don't implement full context assembly here (that's Task 8)
  - Don't import heavy libraries (keep dependency-free)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Utility modules, straightforward mapping and parsing
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Tasks 7-25 (all engines and tools depend on these utils)
  - **Blocked By**: Task 2 (genre template interface)

  **References**:
  - `/root/webnovel-writer/scripts/data_modules/genre_aliases.py` — Genre normalize/to_profile_key pattern
  - `/root/webnovel-writer/scripts/data_modules/context_weights.py` — Section weight template pattern
  - `src/modules/chapter/genre-utils.ts` — Existing genre utils pattern

  **Acceptance Criteria**:
  - [ ] parseGenreTokens("都市异能+系统流") returns ["都市异能", "系统流"]
  - [ ] buildGenreProfile("xianxia") returns object with wordCount constraints
  - [ ] loadContextWeights("default") returns section weights object
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Genre token parsing
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {parseGenreTokens} from './src/modules/chapter/genre-utils'; console.log(JSON.stringify(parseGenreTokens('都市异能+系统流')))"
    Expected Result: ["都市异能", "系统流"]
    Failure Indicators: Wrong split, crash
    Evidence: .omo/evidence/task-6-genre-tokens.txt
  ```

  **Commit**: YES (groups with T1)
  - Files: `src/modules/chapter/genre-utils.ts`, `src/modules/chapter/config-utils.ts`, `src/modules/chapter/constants.ts`

---

### Wave 2 — Core Engines

- [x] 7. **Create chapter write-back engine (状态回写引擎)**

  **What to do**:
  - Create `src/modules/chapter/engine/write-back.ts` following webnovel-writer's `chapter_commit_service.py` pattern
  - Core function `extractAndCommit(chapterId: string): CommitResult`:
    1. Read chapter body from DB and .md file
    2. Extract structured facts (via simple pattern matching + LLM call):
       - New characters/entities appearing
       - Location changes
       - Items acquired/used
       - Plot advances (check progress completeness)
       - Combat results
       - Relationship changes
       - State changes (injured/healed/upgraded)
       - Hooks set/payoff
    3. Write to `chapter_facts` table (one row per fact)
    4. Update `character_states` with deltas
    5. Generate chapter summary (100-150 chars)
    6. Update `outlines` progress if applicable
  - Return `CommitResult { chapterId, factsCount, stateChangesCount, summary, rejectReason? }`
  - Use parameterized queries for ALL DB operations

  **Must NOT do**:
  - Don't modify existing chapter content
  - Don't do entity disambiguation here (separate module, Task 10)
  - Don't use sq() + string interpolation — parameterized queries only

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Core data pipeline, needs careful design for extraction patterns and error handling
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 1 types)
  - **Parallel Group**: Sequential part of Wave 2 core
  - **Blocks**: Tasks 8 (context assembly depends on facts), 18 (write_chapter upgrade needs commit)
  - **Blocked By**: Tasks 1, 5, 6 (schema, init, utils)

  **References**:
  - `/root/webnovel-writer/scripts/data_modules/chapter_commit_service.py` — Primary reference: build_commit, persist_commit, apply_projections
  - `/root/webnovel-writer/scripts/data_modules/chapter_commit_schema.py` — Fact extraction schema (ExtractionResult, accepted_events, state_deltas)
  - `src/db/schema.ts` — chapter_facts table definition
  - `src/db/index.ts:getDatabase()` — Database singleton pattern
  - `src/modules/progress/tool.ts` — Existing progress tracking pattern

  **Acceptance Criteria**:
  - [ ] extractAndCommit() returns CommitResult with factsCount > 0
  - [ ] chapter_facts table has new rows after commit
  - [ ] character_states updated with correct deltas
  - [ ] Summary generated (100-150 chars)
  - [ ] All DB operations use parameterized queries (verify: no sq() calls in this file)
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Commit after chapter write
    Tool: Bash (tsx -e)
    Preconditions: A chapter exists in DB + .md
    Steps:
      1. tsx -e "import {extractAndCommit} from './src/modules/chapter/engine/write-back'; const r=extractAndCommit('chapter-uuid'); console.log(JSON.stringify(r))"
      2. sqlite3 .novel-weaver/novel-weaver.db "SELECT count(*) FROM chapter_facts WHERE chapter_id='chapter-uuid'"
    Expected Result: CommitResult.factsCount > 0, chapter_facts count matches
    Failure Indicators: Zero facts, crash, SQL error
    Evidence: .omo/evidence/task-7-commit-result.txt

  Scenario: No existing data gracefully
    Tool: Bash (tsx -e)
    Preconditions: Clean db, no chapters
    Steps:
      1. tsx -e "import {extractAndCommit} from './src/modules/chapter/engine/write-back'; const r=extractAndCommit('nonexistent'); console.log(JSON.stringify(r))"
    Expected Result: Returns error result, doesn't crash
    Failure Indicators: Crash or exception
    Evidence: .omo/evidence/task-7-commit-error.txt
  ```

  **Commit**: YES (groups with T8, T9, T10, T11, T12)
  - Message: `feat(engine): add chapter commit, context assembly, ranker, entity linker`
  - Files: `src/modules/chapter/engine/write-back.ts`

- [x] 8. **Create context assembly engine (写前上下文打包引擎)**

  **What to do**:
  - Create `src/modules/chapter/engine/context-manager.ts` following webnovel-writer's `context_manager.py` pattern
  - Core function `buildContext(chapter: number, dungeonId?: string): ContextPack`:
    1. Load outline from `outlines` table (chapter-level)
    2. Load protagonist snapshot from `character_states`
    3. Load recent summaries (last 3 chapters from chapter_facts)
    4. Load appearing characters (from character_states + aliases)
    5. Load genre profile (from genre template system)
    6. Load alerts (disambiguation warnings, pending items)
    7. Load style anchor profile (sentence distribution, word frequency)
    8. Load anti-AI expression rules relevant to detected patterns
    9. Apply context ranking (Task 9)
    10. Filter invalid/pending entities (Task 10)
  - Return `ContextPack { outline, protagonist, summaries, characters, genreProfile, styleProfile, alerts, writingGuidance }`
  - Section order follows webnovel-writer pattern (core → story_contract → scene → genre → writing_guidance → memory → alerts)
  - All DB reads via parameterized queries

  **Must NOT do**:
  - Don't include entire DB contents — only relevant context per chapter
  - Don't expose system internals in the context pack
  - Don't call external APIs (all local)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex data assembly with multiple sources and ordering logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential part of Wave 2 core
  - **Blocks**: Tasks 13 (PlotWriter needs context), 18 (write_chapter upgrade)
  - **Blocked By**: Tasks 1, 6, 7 (schema, utils, chapter_facts)

  **References**:
  - `/root/webnovel-writer/scripts/data_modules/context_manager.py` — Primary reference: 15-section context pack, section_order, _build_pack
  - `/root/webnovel-writer/scripts/data_modules/context_ranker.py` — Ranking logic reference
  - `src/modules/chapter/engine/write-back.ts` — Facts query functions
  - `src/modules/chapter/genre-utils.ts` — Genre profile builder

  **Acceptance Criteria**:
  - [ ] buildContext(5) returns ContextPack with all required sections
  - [ ] Context includes protagonist snapshot from character_states
  - [ ] Context includes recent summaries from last 3 chapters
  - [ ] Context includes genre profile
  - [ ] All DB reads use parameterized queries
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Context build for chapter 5
    Tool: Bash (tsx -e)
    Preconditions: DB has 5 chapters, character_states, genre template loaded
    Steps:
      1. tsx -e "import {buildContext} from './src/modules/chapter/engine/context-manager'; const ctx=buildContext(5); console.log('Sections:', Object.keys(ctx).join(','))"
    Expected Result: At least 8 sections (outline, protagonist, summaries, characters, genreProfile, styleProfile, alerts, writingGuidance)
    Failure Indicators: Missing critical sections, crash
    Evidence: .omo/evidence/task-8-context-sections.txt
  ```

  **Commit**: YES (groups with T7)
  - Files: `src/modules/chapter/engine/context-manager.ts`

- [x] 9. **Create context ranker (上下文评分层)**

  **What to do**:
  - Create `src/modules/chapter/engine/ranker.ts` following webnovel-writer's `context_ranker.py` pattern
  - Core function `rankPack(pack: ContextPack, chapter: number): ContextPack`:
    - Rank recent summaries by recency (closer = higher) + hook bonus (if summary contains hook hints)
    - Rank appearing characters by last_appearance recency + total frequency (log scale)
    - Rank alerts by severity (critical first) + recency + keyword match
    - Apply weights: recency_weight (default 0.6), frequency_weight (default 0.3), hook_bonus (default 0.15)
  - Scoring formulas (ported from context_ranker.py):
    - `recency_score = 1.0 / (1.0 + chapter_gap)`
    - `frequency_score = min(1.0, log(1.0 + total) / log(11.0))`
    - `combined = recency * recency_weight + frequency * frequency_weight + hook_bonus`
  - All deterministic — no LLM calls, no randomness
  - Debug mode: includes `_context_score` in output when enabled

  **Must NOT do**:
  - Don't call LLM for ranking
  - Don't make network calls

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Deterministic scoring, simple math, no complex logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential part of Wave 2 (depends on T8)
  - **Blocks**: T8's output (ranker is called by context manager)
  - **Blocked By**: Task 8 (context assembly)

  **References**:
  - `/root/webnovel-writer/scripts/data_modules/context_ranker.py` — Primary reference: recency_score, frequency_score, _combine_score, _has_hook_hint
  - `src/modules/chapter/engine/context-manager.ts` — Input structure

  **Acceptance Criteria**:
  - [ ] rankPack sorts summaries with most recent first (when hooks equal)
  - [ ] Characters with recent appearances rank higher
  - [ ] Critical severity alerts rank higher than info
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Rank summaries by recency
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {rankPack} from './src/modules/chapter/engine/ranker'; const input={core:{recent_summaries:[{chapter:3,summary:'test'},{chapter:5,summary:'test'}]}}; const r=rankPack(input,6); console.log(r.core.recent_summaries[0].chapter)"
    Expected Result: Chapter 5 (most recent) is first
    Failure Indicators: Chapter 3 first, or crash
    Evidence: .omo/evidence/task-9-rank-result.txt
  ```

  **Commit**: YES (groups with T7)
  - Files: `src/modules/chapter/engine/ranker.ts`

- [x] 10. **Create entity linker module (实体消歧模块)**

  **What to do**:
  - Create `src/modules/chapter/engine/entity-linker.ts` following webnovel-writer's `entity_linker.py` pattern
  - Core functions:
    - `registerAlias(entityId: string, alias: string, entityType: string): boolean` — Add alias to aliases table
    - `lookupAlias(mention: string, entityType?: string): EntityRef | null` — Find entity by alias
    - `lookupAliasAll(mention: string): EntityRef[]` — Find all possible entities (one-to-many)
    - `getAllAliases(entityId: string): string[]` — Get all aliases for entity
    - `evaluateConfidence(confidence: number): {action: string, adopt: boolean, warning?: string}` — Threshold logic: >0.8 auto, 0.5-0.8 warn, <0.5 pending
    - `disambiguate(mentions: string[], context: string): DisambiguationResult[]` — Batch disambiguation
  - Use parameterized queries for all DB writes/reads
  - Store aliases in the new `aliases` table
  - Link to existing characters/worlds/dungeons tables via entity_id FK

  **Must NEVER do**:
  - Don't call LLM for simple alias lookup (only for disambiguation with context)
  - Don't delete existing aliases without checking usage

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Data management logic with careful edge case handling
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential part of Wave 2
  - **Blocks**: Tasks 8 (context manager uses entity linker), 22 (crosscheck uses entity linker)
  - **Blocked By**: Tasks 1, 5 (schema, init)

  **References**:
  - `/root/webnovel-writer/scripts/data_modules/entity_linker.py` — Primary reference: DisambiguationResult, EntityLinker class, evaluate_confidence, lookup_alias, register_alias
  - `src/db/schema.ts` — aliases table definition
  - `src/db/index.ts:getDatabase()` — DB access pattern

  **Acceptance Criteria**:
  - [ ] registerAlias + lookupAlias roundtrip works
  - [ ] lookupAliasAll returns multiple results for shared alias
  - [ ] evaluateConfidence(0.9) returns {adopt: true, warning: null}
  - [ ] evaluateConfidence(0.3) returns {adopt: false}
  - [ ] All DB ops use parameterized queries
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Alias roundtrip
    Tool: Bash (tsx -e)
    Preconditions: Schema exists
    Steps:
      1. tsx -e "import {registerAlias, lookupAlias} from './src/modules/chapter/engine/entity-linker'; registerAlias('char-1','张三','character'); const r=lookupAlias('张三'); console.log(r?.entityId)"
    Expected Result: "char-1"
    Failure Indicators: null/undefined, crash
    Evidence: .omo/evidence/task-10-alias-roundtrip.txt
  ```

  **Commit**: YES (groups with T7)
  - Files: `src/modules/chapter/engine/entity-linker.ts`

- [x] 11. **Create style anchor analyzer**

  **What to do**:
  - Create `src/modules/style-anchor/analyzer.ts`
  - Core function `analyzeAnchors(chapters: ChapterMeta[]): StyleProfile`:
    - Sentence length distribution (mean, median, stddev, buckets)
    - Paragraph length distribution (mean, max, min)
    - Word frequency analysis (top 50 characters/words by TF)
    - Dialogue ratio (proportion of text in quotes vs narrative)
    - Punctuation pattern analysis (dash, ellipsis, exclamation frequency)
    - Emotion word density (positive/negative word ratio)
    - Adverb density ("缓缓/淡淡/微微/轻轻" etc.)
  - Core function `compareToAnchor(text: string, profile: StyleProfile): StyleDeviation[]`:
    - Compare text stats to anchor profile
    - Flag deviations > 2 standard deviations
    - Return list of deviations with severity
  - Store/load from `.novel-weaver/style-anchors/anchor-profile.json`

  **Must NOT do**:
  - Don't use NLP libraries (pure JS statistical analysis)
  - Don't call LLM for analysis

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Statistical analysis needs careful implementation
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7, T8, T9, T10, T12 — same wave, different engine)
  - **Blocks**: Tasks 13 (PlotWriter uses style profile), 14 (Reviewer uses deviations)
  - **Blocked By**: Tasks 3 (style anchor storage)

  **References**:
  - `src/modules/style-anchor/tool.ts` — Anchor storage and extraction
  - `/root/webnovel-writer/skills/webnovel-write/references/polish-guide.md` — "Naturalization standards" table (停顿词, 短句占比, 口语词 targets)
  - `src/modules/review/tool.ts:checkAISmell` — Existing sentence length analysis

  **Acceptance Criteria**:
  - [ ] analyzeAnchors returns StyleProfile with all fields
  - [ ] compareToAnchor returns StyleDeviation[] with at least 3 deviation types
  - [ ] Profile persists to and loads from .novel-weaver/style-anchors/anchor-profile.json
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Analyze chapter for deviations
    Tool: Bash (tsx -e)
    Preconditions: Style anchor profile exists, a test chapter exists
    Steps:
      1. tsx -e "import {compareToAnchor} from './src/modules/style-anchor/analyzer'; const d=compareToAnchor('测试章节正文...', {}); console.log('Deviations:', d.length)"
    Expected Result: Returns array of deviations (may be empty if match good)
    Failure Indicators: Crash, returns null
    Evidence: .omo/evidence/task-11-deviations.txt
  ```

  **Commit**: YES (groups with T7)
  - Files: `src/modules/style-anchor/analyzer.ts`

- [x] 12. **Create emotion blueprint engine + rhythm checker**

  **What to do**:
  - Create `src/modules/chapter/engine/emotion-blueprint.ts` — 情绪蓝图生成器
    - `generateEmotionBlueprint(outline: string, context: ContextPack): EmotionBlueprint`
    - 输出结构: `{ dominantEmotion, emotionCurve: [{section, label, intensity, technique}], sceneEmotions: [{sceneNum, mood, pacing, sensoryFocus, tensionTechnique}], chapterVibe }`
    - 读取章纲 + 上下文，输出情绪蓝图（不生成正文）
    - 支持 8 种情绪主调: 悲壮/紧张/爽/温馨/压抑/悬疑/激昂/虐心
    - 每种主调对应默认情绪曲线模板
  - Create `src/modules/chapter/engine/rhythm-checker.ts` — 呼吸感检查器
    - `analyzeRhythm(text: string): RhythmReport`
    - `{ sentenceLengths: {mean, median, stddev, distribution}, paragraphTypes: {narrative, dialogue, action, description, mixed}, openingDiversity: {uniqueStarters: number}, consecutivePatterns: {sameSubject: number, sameStructure: number}, tensionScore: number }`
    - `checkBreathing(text: string): BreathingIssue[]` — 检测呼吸感问题
      - 句子长度标准差 < 10 → "节奏过于均匀"
      - 连续 4+ 句同一主语开头 → "句式重复"
      - 连续 5+ 段叙-对-叙模式 → "段落模板化"
      - 单句段落占比 < 15% → "缺乏冲击停顿"
      - 超过 80% 段落长度在平均值 ±30% 内 → "段落结构模板化"
    - `mixRhythm(text: string, issues: BreathingIssue[]): string` — 自动调整节奏
      - 对均匀段落: 拆分长句/合并短句/插入单句段落
      - 对重复开头: 替换为状语/时间/场景开头
      - 保留原有语义不变
    - 纯统计分析，不调 LLM

  **Must NOT do**:
  - Don't call LLM for rhythm analysis (pure statistics)
  - Don't modify the emotional meaning of text (only structural changes)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Statistical analysis + structural text transformation
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7-T11)
  - **Blocks**: T14 (PlotWriter uses emotion blueprint), T15 (Reviewer uses rhythm data), T20 (review_fix uses rhythm checker)
  - **Blocked By**: Tasks 2 (genre templates), 6 (utils)

  **References**:
  - `/root/webnovel-writer/skills/webnovel-write/references/polish-guide.md` — Naturalization standards (停顿词密度, 短句占比, 口语词 targets)
  - `src/modules/review/tool.ts:checkAISmell` — Existing sentence length analysis
  - `src/modules/style-anchor/analyzer.ts` — Statistical analysis pattern

  **Acceptance Criteria**:
  - [ ] generateEmotionBlueprint returns EmotionBlueprint with dominantEmotion and per-scene emotions
  - [ ] emotionCurve has at least 3 sections (introduction, climax, resolution)
  - [ ] analyzeRhythm returns RhythmReport with sentenceLengths.stddev
  - [ ] checkBreathing returns at least 2 issue types for uniform text
  - [ ] mixRhythm modifies text to improve rhythm stats
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Generate emotion blueprint
    Tool: Bash (tsx -e)
    Preconditions: Outline text exists
    Steps:
      1. tsx -e "import {generateEmotionBlueprint} from './src/modules/chapter/engine/emotion-blueprint'; const b=generateEmotionBlueprint('主角在废弃工厂遭遇埋伏',''); console.log('Emotion:',b.dominantEmotion,'Scenes:',b.sceneEmotions?.length)"
    Expected Result: Returns blueprint with dominant emotion and scene array
    Failure Indicators: Empty/null result, crash
    Evidence: .omo/evidence/task-12b-emotion-blueprint.txt

  Scenario: Rhythm check on uniform text
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {checkBreathing} from './src/modules/chapter/engine/rhythm-checker'; const issues=checkBreathing('他打开门。他走进房间。他看见一个人。他走了过去。他开口说话。'); console.log('Issues:', issues.length)"
    Expected Result: At least 1 breathing issue detected (consecutive same-subject openings)
    Failure Indicators: 0 issues detected
    Evidence: .omo/evidence/task-12b-rhythm-issue.txt
  ```

  **Commit**: YES (groups with T7-T12)
  - Files: `src/modules/chapter/engine/emotion-blueprint.ts`, `src/modules/chapter/engine/rhythm-checker.ts`

- [x] 13. **Create genre profile builder**

  **What to do**:
  - Create `src/modules/chapter/engine/genre-profile-builder.ts`
  - Core function `buildGenreProfile(projectRoot: string, chapter: number, genre: string): GenreProfilePack`:
    1. Load genre template from config
    2. Extract relevant sections from genre reference files (if any exist in `.novel-weaver/content/settings/`)
    3. Query chapter_facts for genre-relevant patterns (e.g., combat frequency for xianxia)
    4. Build composite hints if multiple genres
    5. Generate writing guidance items (word count targets, forbidden patterns specific to genre)
    6. Generate methodology strategy card (pacing advice by chapter stage)
    7. Build writing checklist (genre-specific checklist items)
  - Return `GenreProfilePack { genre, profileExcerpt, referenceHints, compositeHints, writingGuidance, checklist, methodology }`

  **Must NOT do**:
  - Don't hardcode genre-specific rules — load from template files
  - Don't duplicate template content — reference only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple data sources, needs to combine template state DB + template config
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7-T12)
  - **Blocks**: T14 (PlotWriter needs genre profile), T19 (write_chapter upgrade)
  - **Blocked By**: Tasks 2 (genre templates), 6 (genre utilities), 7 (chapter_facts)

  **References**:
  - `/root/webnovel-writer/scripts/data_modules/context_manager.py:_build_runtime_genre_profile` — Genre profile assembly from contract + state
  - `/root/webnovel-writer/scripts/data_modules/genre_profile_builder.py` — Composite genre hints, extract_genre_section
  - `src/modules/chapter/genre-templates/` — Template JSON files created in Task 2
  - `src/modules/chapter/genre-utils.ts` — Genre token utilities

  **Acceptance Criteria**:
  - [ ] buildGenreProfile returns GenreProfilePack with genre, referenceHints, writingGuidance
  - [ ] Writing checklist includes genre-specific items
  - [ ] Works with unknown genre (fallback)
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Genre profile for xianxia
    Tool: Bash (tsx -e)
    Preconditions: xianxia template exists, DB has chapter_facts
    Steps:
      1. tsx -e "import {buildGenreProfile} from './src/modules/chapter/engine/genre-profile-builder'; const p=buildGenreProfile('/root/novel-plugin',1,'xianxia'); console.log('Genre:',p.genre,'Hints:',p.referenceHints?.length)"
    Expected Result: Genre='xianxia', referenceHints array length > 0
    Failure Indicators: Null genre, missing hints, crash
    Evidence: .omo/evidence/task-13-genre-profile.txt
  ```

  **Commit**: YES
  - Files: `src/modules/chapter/engine/genre-profile-builder.ts`

---

### Wave 3 — Agent + Detection (Updated with Step-by-Step Writing Pipeline)

- [x] 14. **Create PlotWriter Agent (情绪驱动型分步写作模式)**

  **What to do**:
  - Create `src/agents/prompts/PlotWriter.ts` — Chinese system prompt (~250 lines)
  - Register in `src/agents/index.ts` with name "PlotWriter", description "网文章节写手（情绪驱动分步写作）"
  - **温度**: 0.85（最高创造力，避免AI味，在 `chat.params` hook 中按 agent 名 "plot-writer" 匹配）
  - **核心模式**：不是一次性生成，而是分步写作
  - **Step 1 - 情绪接收**: 接收情绪蓝图（emotion blueprint），先理解本章的情绪主调和曲线，进入写作状态
  - **Step 2 - 逐景写作**: 接收每个场景的单独指令，一景写完才写下一景
    - 每景输入: `{ sceneNum, emotionTags, pacing指导, technique列表, context }`
    - 每景输出: 纯正文（1-3段），完成后等待下一景指令
    - 禁止跨景写作（不准提前写后面的内容）
  - **Step 3 - 写作时情绪自检**: 每景写完后，自我检查:
    - "这一景的核心情绪是否到位？读者读到这里会有什么感受？"
    - "句子的节奏是否符合场景要求？（紧张→短句，沉思→长句）"
    - "如果有问题，如何修改？"
  - **Anti-Template 写前预防**（嵌入提示词核心）:
    - 句子长度方差目标: 标准差 > 12
    - 段落结构: 至少含一个单句段
    - 句首多样性: 不要连续以同一词性开头
    - 叙事距离: 不要全章同距离，紧张时拉近
    - **禁止** "安全着陆" 式章尾
    - **禁止** "展示后解释"（写完动作不要跟解释句）
    - **思考** "如果我是作者，我写到这里会有什么情绪？"
  - **8 种情绪写作指南**（每种给出语言风格指示）:
    - 悲壮: 长句+短句交替，冷色调意象，克制中见力量
    - 紧张: 极短句，感官细节密集，时间感加速
    - 爽: 节奏明快，动作清晰，力量展示
    - 温馨: 细节暖心，对话温暖，画面感强
    - 压抑: 环境渲染，沉默/留白，渐进感
    - 悬疑: 信息片断化，视角限制，节奏拖慢
    - 激昂: 排比/递进，节奏递升，全景展开
    - 虐心: 生理细节，内心独白，情绪对比

  **Must NOT do**:
  - Don't make prompt English (must be Chinese like all existing agents)
  - Don't allow single-shot full chapter generation (must use scene-by-scene)
  - Don't exceed 250 lines

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Complex Chinese prompt engineering for emotion-driven writing
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T15, T16, T17, T18, T20, T21)
  - **Blocks**: T19 (write_chapter upgrade calls PlotWriter with blueprint)
  - **Blocked By**: T12 (emotion blueprint), T8 (context assembly)

  **References**:
  - `src/agents/prompts/PlotPlanner.ts` — Existing Chinese prompt format reference
  - `src/modules/chapter/engine/emotion-blueprint.ts` — Emotion blueprint input format
  - `/root/webnovel-writer/references/shared/core-constraints.md` — Three laws of writing, Anti-AI style anchors
  - `/root/webnovel-writer/skills/webnovel-write/references/anti-ai-guide.md` — Anti-AI writing guide

  **Acceptance Criteria**:
  - [ ] Agent registered in agents/index.ts with name "PlotWriter"
  - [ ] Prompt is in Chinese (verify: no English system messages)
  - [ ] Prompt contains step-by-step writing pattern (情绪接收→逐景写作→情绪自检)
  - [ ] Prompt includes 8 emotion writing guides
  - [ ] Prompt includes anti-template rules
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Chinese prompt verification
    Tool: Bash
    Preconditions: None
    Steps:
      1. grep -c "情绪\|自检\|逐景\|呼吸\|节奏" src/agents/prompts/PlotWriter.ts
    Expected Result: Mentions > 10 (key Chinese terms present)
    Failure Indicators: Too few Chinese terms, mostly English
    Evidence: .omo/evidence/task-14-chinese-prompt.txt
  ```

  **Commit**: YES (groups with T15-T21)
  - Message: `feat(agent): add PlotWriter with emotion-driven step writing + upgrade all agents`
  - Files: `src/agents/prompts/PlotWriter.ts`, `src/agents/index.ts`

- [x] 15. **Upgrade Reviewer Agent with 7-layer anti-AI + rhythm detection**

  **What to do**:
  - Rewrite `src/agents/prompts/Reviewer.ts` — keep existing 8 checks, ADD 7-layer anti-AI detection + rhythm analysis
  - **温度**: 0.25（最低温度，审查必须严格一致、不瞎判，在 `chat.params` hook 中按 agent 名 "reviewer" 匹配）
  - The 7 layers:
    1. **词汇层** (L1): 高频AI词扫描（然而/因此/值得注意的是）+万能副词+动词（缓缓/淡淡/微微）+ 模式化连接词
    2. **句式层** (L2): 四段闭环检测、连续同构句（≥3句同一结构）、段末总结句
    3. **叙事层** (L3): 节奏均匀度分析、展示后解释模式、"他不知道的是"式提示
    4. **情感层** (L4): 情绪标签化（他感到X）、情绪即时切换（无过渡）、全员同款反应
    5. **对话层** (L5): 信息宣讲（解释背景非推进冲突）、全员书面语、对白后跟解释
    6. **结构层** (L6): 因果链过于完整、安全着陆（章末全解决）、信息无留白
    7. **个性层** (L7): 是否有个人风格特征、是否与风格锚点偏离
  - Each layer outputs issues with severity (critical/high/medium/info) and evidence (quote)
  - Add `checkAntiAi(text: string, styleProfile?: StyleProfile): AntiAiIssue[]` to `src/modules/review/tool.ts`
  - Layer 7 needs style profile comparison (from T11)
  - Integrate with existing `checkAISmell()` — replace simple word list with comprehensive 7-layer check
  - Update `src/modules/review/tool.ts` to call the new 7-layer check

  **Must NOT do**:
  - Don't remove existing 8 checks (just upgrade AI味扫描)
  - Don't exceed 7 layers (any additional is future work)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Complex Chinese-language prompt engineering for detection
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14, T16, T17, T18, T19, T20, T21)
  - **Blocks**: T20 (review_fix upgrade uses detection results)
  - **Blocked By**: Tasks 4 (anti-AI expression tables), 11 (style analyzer), 12 (rhythm checker)

  **References**:
  - `src/agents/prompts/Reviewer.ts` — Existing prompt (add anti-AI sections)
  - `src/modules/review/tool.ts:checkAISmell` — Existing simple AI word list
  - `src/modules/review/anti-ai-expressions.json` — Expression replacement rules for reference
  - `/root/webnovel-writer/agents/reviewer.md` — Reference: 6-category AI flavor check with 5 sub-dimensions (词汇/句式/叙事/情感/对话)
  - `/root/webnovel-writer/skills/webnovel-write/references/polish-guide.md` — 7-layer anti-AI rules reference

  **Acceptance Criteria**:
  - [ ] checkAntiAi returns issues from at least 5 of 7 layers
  - [ ] Each issue has severity, evidence (quote), and layer number
  - [ ] Layer 7 (individual style) compares against style profile if available
  - [ ] Backward compatible: old chapters continue to pass
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Detect AI味 in known AI text
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {checkAntiAi} from './src/modules/review/tool'; const testText='他缓缓说道：\"毋庸置疑，这是一件非常重要的事情。\"他感到一阵愤怒。'; const issues=checkAntiAi(testText); console.log('Issues:', issues.length, 'Layers:', new Set(issues.map(i=>i.layer)).size)"
    Expected Result: At least 2 issues from different layers detected
    Failure Indicators: 0 issues (missed clear AI patterns)
    Evidence: .omo/evidence/task-14-anti-ai-detect.txt
  ```

  **Commit**: YES (groups with T14-T21)
  - Files: `src/agents/prompts/Reviewer.ts`, `src/modules/review/tool.ts`

- [x] 16. **Upgrade World Builder Agent (genre-aware)**

  **What to do**:
  - Update `src/agents/prompts/world-builder-prompt.md` — add genre input parameter
  - **温度**: 0.75（高创造力，世界观需要创意但体系要有一致性，在 `chat.params` hook 中按 agent 名 "world-builder" 匹配）
  - When genre is specified, adjust output framework:
    - 仙侠 genre: emphasize cultivation hierarchy, immortal politics, pill/alchemy systems
    - 科幻 genre: emphasize technology tree, hard sci-fi constraints, cyberpunk elements
    - 都市 genre: emphasize modern society logic, urban fantasy rules, power balance
    - 恐怖 genre: emphasize atmosphere rules, psychological horror, unknown entity behavior
    - 末世 genre: emphasize resource management, survival rules, faction dynamics
  - Add multi-round structured fill-in: guide user through 10 setting modules, each adapted to genre

  **Must NOT do**:
  - Don't remove existing generic world-building capability (genre is additive, not replacement)
  - Don't force genre if user didn't specify one

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Chinese prompt engineering for world-building
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14, T15, T17, T18, T19, T20, T21)
  - **Blocks**: None (independent)
  - **Blocked By**: Tasks 2 (genre templates)

  **References**:
  - `src/agents/prompts/world-builder-prompt.md` — Existing prompt
  - `src/modules/chapter/genre-templates/*.json` — Genre template files for reference content

  **Acceptance Criteria**:
  - [ ] Prompt has genre-aware sections for each of 5 genres
  - [ ] Multi-round fill-in works with genre-specific modules
  - [ ] Works without genre (generic fallback like current)
  - [ ] no tsc errors

  **QA Scenarios**: (Prompt-based — verify by grep)
  ```
  Scenario: Genre section exists in prompt
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep -c "仙侠\|科幻\|都市\|恐怖\|末世" src/agents/prompts/world-builder-prompt.md
    Expected Result: At least 5 mentions (one per genre)
    Failure Indicators: Missing genres
    Evidence: .omo/evidence/task-15-genre-mentions.txt
  ```

  **Commit**: YES (groups with T14-T21)
  - Files: `src/agents/prompts/world-builder-prompt.md`

- [x] 17. **Upgrade Dungeon Master Agent (genre-aware)**

  **What to do**:
  - Update `src/agents/prompts/dungeon-master-prompt.md` — add genre-awareness
  - When dungeon genre differs from main project genre, adapt template:
    - 仙侠 dungeon: immortality-related trials, pill refinement puzzles
    - 科幻 dungeon: AI-controlled instances, technological puzzles
    - 都市 dungeon: urban legends, social-based challenges
    - 恐怖 dungeon: psychological horror, sanity mechanics, escape rules
    - 末世 dungeon: survival challenges, resource puzzles
  - Add difficulty curve guidance (single dungeon: progressively harder stages)
  - Connect to dungeons table genre field (if exists) or project default genre
  - **温度**: 0.75（高创造力，副本需要惊喜感，在 `chat.params` hook 中按 agent 名 "dungeon-master" 匹配）

  **Must NOT do**:
  - Don't remove existing 5 theme templates (horror/sci-fi/xianxia/urban/apocalypse)
  - Don't break existing dungeon_generate tool interface

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Chinese prompt engineering for dungeon design
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14-T16, T18-T21)
  - **Blocks**: None (independent)
  - **Blocked By**: Tasks 2 (genre templates)

  **References**:
  - `src/agents/prompts/dungeon-master-prompt.md` — Existing prompt
  - `src/modules/dungeon/templates.ts` — 5 theme presets

  **Acceptance Criteria**:
  - [ ] Prompt has genre adaptation sections
  - [ ] Difficulty curve guidance included
  - [ ] Works with existing dungeon_generate tool
  - [ ] no tsc errors

  **Commit**: YES (groups with T14-T21)
  - Files: `src/agents/prompts/dungeon-master-prompt.md`

- [x] 18. **Upgrade Plot Planner Agent (outline-integrated)**

  **What to do**:
  - Update `src/agents/prompts/plot-planner-prompt.md`
  - Add outline generation workflow: master outline → volume outline → chapter outline → blueprint
  - Write outlines to `outlines` table (via tool or DB write)
  - Each outline level includes: title, summary, key events, expected hooks, character arcs
  - Chapter blueprint: specific scene-by-scene breakdown, word count allocation per scene
  - Add genre-aware plot pattern recommendations:
    - 仙侠: cultivation breakthrough pacing, realm advancement milestones
    - 科幻: mystery reveal pacing, technology escalation
    - 都市: relationship building, day-job vs adventure balance
    - 恐怖: tension curve, reveal timing
    - 末世: resource crisis cycle, base building milestones
  - **温度**: 0.65（创意够但规划不能脱离逻辑，在 `chat.params` hook 中按 agent 名 "plot-planner" 匹配）

  **Must NOT do**:
  - Don't make outline mandatory (writers can still write without outline)
  - Don't add too much structure (keep creative freedom)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Chinese prompt engineering for plot planning
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14-T17, T19-T21)
  - **Blocks**: None (independent)
  - **Blocked By**: Tasks 1 (outlines table), 2 (genre templates)

  **References**:
  - `src/agents/prompts/plot-planner-prompt.md` — Existing prompt
  - `src/db/schema.ts` — outlines table definition
  - `/root/webnovel-writer/agents/context-agent.md` — Outline/contract reference in writing process

  **Acceptance Criteria**:
  - [ ] Prompt includes outline generation workflow (at least 3 levels)
  - [ ] Genre-specific plot patterns for 5 genres
  - [ ] Works without existing outlines (generates new ones)
  - [ ] no tsc errors

  **Commit**: YES (groups with T14-T21)
  - Files: `src/agents/prompts/plot-planner-prompt.md`

- [x] 19. **Upgrade novel_write_chapter with PlotWriter 分景写作流程**

  **What to do**:
  - Modify `src/modules/chapter/tool.ts:writeChapter()`:
    - Implement **分景写作流程**（不是一次性生成整章）:
      1. 调用 emotion blueprint engine 生成本章情绪蓝图（T12）
      2. 调用 context assembly 打包上下文（T8）
      3. 调用 genre profile builder 获取题材画像（T13）
      4. 将章节按情绪蓝图分解为 2-4 个场景
      5. **逐景调用 Agent(PlotWriter)**，每景写完后等待返回
      6. 每景返回后调用 rhythm checker 做呼吸感检查（T12），如需调整则自动修改
      7. 所有场景完成后，组装为完整章节
      8. 调用 chapter commit engine 提取事实并写入 DB（T7）
    - Add `usePlotWriter` parameter (default true)
    - Add genre auto-detection: if dungeon has genre override, use it; else use project genre
    - Add style anchor loading: load `.novel-weaver/style-anchors/anchor-profile.json`, pass to PlotWriter
    - Fall back to current single-shot mode when PlotWriter unavailable or simple chapter
  - Create `src/modules/chapter/engine/dispatcher.ts`:
    - `dispatchSceneWrite(scene: SceneBlueprint, context: ContextPack): Promise<string>` — calls Agent tool per scene
    - `dispatchFullChapter(chapter: ChapterRequest, scenes: SceneBlueprint[]): Promise<ChapterResult>` — orchestrates full flow
    - Handles errors (Agent failure → scene-level retry)

  **Must NOT do**:
  - Don't break the existing no-body flow (returning context for AI to write)
  - Don't change tool interface signature
  - Don't add async to sql.js operations (they are sync)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex integration between existing tool flow and new engines
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14-T18, T20, T21)
  - **Blocks**: T26 (upgrade existing tools)
  - **Blocked By**: Tasks 8 (context assembly), 11 (style analyzer), 12 (emotion blueprint + rhythm checker), 13 (genre profile builder), 14 (PlotWriter agent)

  **References**:
  - `src/modules/chapter/tool.ts:writeChapter()` — Current flow, interface
  - `src/modules/chapter/engine/emotion-blueprint.ts` — Scene breakdown from emotion blueprint
  - `src/modules/chapter/engine/rhythm-checker.ts` — Per-scene rhythm check
  - `src/modules/chapter/engine/write-back.ts` — Post-write commit
  - `src/agents/index.ts` — Agent registration and calling pattern

  **Acceptance Criteria**:
  - [ ] writeChapter breaks chapter into 2+ scenes based on emotion blueprint
  - [ ] Each scene written by separate Agent(PlotWriter) call
  - [ ] Rhythm checker runs after each scene
  - [ ] Chapter commit runs after all scenes complete
  - [ ] No regression on non-PlotWriter mode
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Scene-by-scene chapter generation
    Tool: Bash (tsx -e)
    Preconditions: DB has world, dungeon, context data
    Steps:
      1. tsx -e "import {writeChapter} from './src/modules/chapter/tool'; const result=await writeChapter({dungeonId:'d-1',chapterTitle:'测试',chapterNum:1,usePlotWriter:true})"
    Expected Result: Returns {content: [{text: "chapter saved"}]} without crash, emits evidence of 2+ scene calls
    Failure Indicators: Only 1 Agent call (single-shot), crash
    Evidence: .omo/evidence/task-19-scene-by-scene.txt
  ```

  **Commit**: YES (groups with T14-T21)
  - Files: `src/modules/chapter/tool.ts`, `src/modules/chapter/engine/dispatcher.ts`

- [x] 20. **Upgrade novel_review_fix with anti-AI auto-fix**

  **What to do**:
  - Modify `src/modules/review/tool.ts:fixReviewIssues()`:
    - Add anti-AI fix mode: after fixing blocker issues, run anti-AI polish
    - Load `anti-ai-expressions.json` rules
    - For each rule pattern matched in text, apply replacement
    - For complex patterns (layers 4-7), call Reviewer agent for rewrite suggestion
    - Output change log: what was changed, which rule applied
  - Create `src/modules/review/anti-ai-apply.ts`:
    - `applyAllFixes(text: string, rules: AntiAiRule[]): {fixed: string, changes: FixChange[]}`
    - `applyLayerFixes(text: string, layers: number[]): {fixed: string, changes: FixChange[]}`
    - `validateFix(text: string, original: string): boolean` — Ensure fix didn't make it worse
  - Update `novel_review_fix` to call applyAllFixes after review fixes

  **Must NOT do**:
  - Don't auto-apply without user's knowledge (log changes)
  - Don't modify chapter if no anti-AI issues found
  - Don't change chapter semantics (only expression patterns)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Text processing with careful replacement logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14-T19, T21)
  - **Blocks**: None (independent)
  - **Blocked By**: Tasks 4 (anti-AI rules), 15 (Reviewer upgrade for complex issues), 12 (rhythm checker)

  **References**:
  - `src/modules/review/tool.ts:fixReviewIssues()` — Current fix flow
  - `src/modules/review/anti-ai-expressions.json` — Expression rules
  - `src/modules/review/anti-ai-rules.ts` — Basic replacement function

  **Acceptance Criteria**:
  - [ ] applyAllFixes fixes known AI patterns
  - [ ] Change log shows which rules were applied
  - [ ] validateFix confirms fixed text is different from original
  - [ ] No semantic change (validate: key info preserved)
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Auto-fix AI patterns
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {applyAllFixes} from './src/modules/review/anti-ai-apply'; const r=applyAllFixes('他缓缓说道：\"毋庸置疑。\"',[]); console.log(r.fixed, '| Changes:', r.changes.length)"
    Expected Result: Fixed text has fewer AI patterns, changes > 0
    Failure Indicators: 0 changes, unchanged text
    Evidence: .omo/evidence/task-20-auto-fix.txt
  ```

  **Commit**: YES (groups with T14-T21)
  - Files: `src/modules/review/tool.ts`, `src/modules/review/anti-ai-apply.ts`

- [x] 21. **Upgrade novel_write_continue (context-aware)**

  **What to do**:
  - Modify `src/modules/chapter/tool.ts:continueWriting()`:
    - Add genre-aware title generation (use genre template to generate better titles)
    - Add context summary: load last chapter's summary from chapter_facts, include in return
    - Add style continuity: include style profile in return context
    - Add hook tracking: check last chapter's hook from chapter_facts, ensure continuation addresses it
    - Keep existing behavior (no body → return context)

  **Must NOT do**:
  - Don't change tool interface
  - Don't add new parameters (use existing context)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Upgrading existing function with new data sources
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14-T20)
  - **Blocks**: None
  - **Blocked By**: Tasks 7 (chapter_facts), 8 (context assembly)

  **References**:
  - `src/modules/chapter/tool.ts:continueWriting()` — Current implementation
  - `src/modules/chapter/engine/context-manager.ts` — Context assembly

  **Acceptance Criteria**:
  - [ ] continueWriting returns last chapter summary
  - [ ] generateTitle with genre produces better titles than "第N章"
  - [ ] No behavior regression on existing code
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Continue with context
    Tool: Bash (tsx -e)
    Preconditions: 3+ chapters exist
    Steps:
      1. tsx -e "import {continueWriting} from './src/modules/chapter/tool'; const ctx=await continueWriting({dungeonId:'d-1'}); console.log('Has summary:', !!ctx.lastChapterSummary)"
    Expected Result: lastChapterSummary is not null/undefined
    Failure Indicators: Missing summary
    Evidence: .omo/evidence/task-21-continue-summary.txt
  ```

  **Commit**: YES (groups with T14-T21)
  - Files: `src/modules/chapter/tool.ts`

---

### 🌟 Wave 3.5 — Novel Weaver Master Agent (可平行于 Wave 4-5)

> 深度嵌入 OpenCode 生态：导出一个完整可注册的 OpenCode Agent 配置，让用户一键启用"网文创作大师"专用 Agent。

- [x] 31. **Create Novel Weaver Master Agent (OpenCode Agent 集成)**

  **What to do**:
  - 创建 `src/agents/master-prompt.ts` — 主 Agent 系统提示词（~1500 字，中文）:
    - **你的身份**: "你是 Novel Weaver — 无限流网文创作大师。你深度集成了 novel-weaver 插件全部 23 个工具、4 个子 Agent、4 阶段创作管线。"
    - **核心知识覆盖**:
      1. **工具清单与适用场景**（每个 novel_* 工具的触发条件）:
         - 初始化: `novel_init`（必须先做这一项）
         - 世界观: `novel_world_create` / `novel_world_query` / `novel_world_link`
         - 角色: `novel_character_create` / `novel_character_update` / `novel_character_query`
         - 副本: `novel_dungeon_generate`（5 种主题） / `novel_dungeon_customize`
         - 写作: `novel_write_chapter` / `novel_write_continue` / `novel_write_edit`
         - 审查: `novel_review_chapter` / `novel_review_fix`
         - 一致性: `novel_consistency_check` / `novel_consistency_rules`
         - 进度: `novel_progress_track` / `novel_progress_summary`
         - 查询: `novel_query` / `novel_stats`
         - 管线: `novel_pipeline_start` / `novel_pipeline_status`
         - 高级: `novel_crosscheck` / `novel_state_snapshot` / `novel_foreshadow` / `novel_style_anchor` / `novel_annotations`
         - 面板: `novel_dashboard`
      2. **4 阶段管线**: 设定 → 规划 → 写作 → 审查
      3. **子 Agent 委托**:
         - 世界设定 → 委托 `world-builder` agent（创造力 0.75）
         - 副本设计 → 委托 `dungeon-master` agent（创造力 0.75）
         - 剧情规划 → 委托 `plot-planner` agent（创造力 0.65）
         - 章节写作 → 委托 `plot-writer` agent（创造力 0.85，最高）
         - 质量审查 → 委托 `reviewer` agent（温度 0.25，最严格）
         - 面板生成 → 使用 `dashboard-generator`（温度 0.80）
      4. **写作规范**: 禁用词列表、反 AI 7 层检测、段落（500 字/段）、章节结构
      5. **题材知识**: 5 种内置题材（仙侠/科幻/都市/恐怖/末世）的特点和常见套路
      6. **配置读取**: 自动检查 `.novel-weaverrc.json` 获取项目配置
      7. **工作流推荐**:
         - 新手: `novel_init` → `novel_world_create` → `novel_dungeon_generate` → `novel_write_chapter` → `novel_review_chapter`
         - 进阶: 使用 `novel_pipeline_start` 自动走完整管线
    - 语气: 专业但有温度，像资深网文编辑在指导创作
    - 语言: **全中文**（与现有 Agent 一致）

  - 创建 `src/agents/master-config.ts` — 导出 OpenCode 兼容的 AgentConfig:
    ```typescript
    export const NOVEL_WEAVER_AGENT_CONFIG = {
      "novel-weaver": {
        model: "gpt-4o",
        temperature: 0.7,
        prompt: MASTER_PROMPT,
        description: "网文创作大师 — 使用 novel-weaver 插件进行无限流小说全流程创作",
        color: "#8B5CF6",
        mode: "primary",
        tools: {
          novel_init: true,
          novel_world_create: true,
          novel_world_query: true,
          novel_world_link: true,
          novel_character_create: true,
          novel_character_update: true,
          novel_character_query: true,
          novel_dungeon_generate: true,
          novel_dungeon_customize: true,
          novel_write_chapter: true,
          novel_write_continue: true,
          novel_write_edit: true,
          novel_review_chapter: true,
          novel_review_fix: true,
          novel_consistency_check: true,
          novel_consistency_rules: true,
          novel_progress_track: true,
          novel_progress_summary: true,
          novel_pipeline_start: true,
          novel_pipeline_status: true,
          novel_query: true,
          novel_stats: true,
          novel_ping: true,
          novel_crosscheck: true,
          novel_state_snapshot: true,
          novel_foreshadow: true,
          novel_style_anchor: true,
          novel_annotations: true,
          novel_dashboard: true,
        },
        permission: {
          edit: "allow",
          bash: "allow",
          webfetch: "ask",
        },
      },
    };
    ```

  - 在 `src/agents/index.ts` 中导出 `NOVEL_WEAVER_AGENT_CONFIG`
  - 在 `src/index.ts` 中通过 `registerAgents()` 或独立导出暴露
  - 更新 `README.md` — 添加 "注册 Novel Weaver Agent" 章节，提供一键复制配置

  **Must NOT do**:
  - ❌ 不修改现有 4 个子 Agent 的注册方式（保留 oh-my-openagent 兼容）
  - ❌ 不自动写入用户的 opencode.json（用户手动复制）
  - ❌ 不在主 Agent 提示词中写死温度值（应引用 `.novel-weaverrc.json`）

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: 需要创作高质量的中文系统提示词，有结构但不死板
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3.5 (independent — 只需 T5 的配置接口和 T14-T18 的 Agent 提示词就位)
  - **Blocks**: None
  - **Blocked By**: Tasks 5 (NovelWeaverRc 接口), 14-18 (各 Agent 提示词)

  **References**:
  - `src/agents/index.ts` — 现有 Agent 注册方式（参考结构与格式）
  - `src/agents/prompts/*` — 现有 4 个子 Agent 提示词风格（确保主 Agent 语气一致）
  - `~/.config/opencode/opencode.json` — 目标配置文件（用户手动修改）
  - `src/config.ts` — NovelWeaverRc 接口定义

  **Acceptance Criteria**:
  - [ ] `src/agents/master-prompt.ts` 导出 `MASTER_PROMPT`（~1500 字，中文）
  - [ ] `src/agents/master-config.ts` 导出 `NOVEL_WEAVER_AGENT_CONFIG`（包含全部 30+ 工具）
  - [ ] `src/agents/index.ts` 导出 Master Config
  - [ ] 提示词覆盖所有 7 个知识域（工具/管线/子Agent/规范/题材/配置/工作流）
  - [ ] 提示词中推荐至少 2 条工作流（新手 + 进阶）
  - [ ] `npm run typecheck` → PASS
  - [ ] README 包含 Agent 注册章节

  **QA Scenarios**:
  ```
  Scenario: Master prompt completeness
    Tool: Bash (grep + wc)
    Preconditions: src/agents/master-prompt.ts exists
    Steps:
      1. grep -c "novel_init\|novel_world\|novel_character\|novel_dungeon\|novel_write\|novel_review\|novel_consistency\|novel_progress\|novel_pipeline\|novel_query\|novel_stats\|novel_dashboard" src/agents/master-prompt.ts
      2. wc -c src/agents/master-prompt.ts
    Expected Result: At least 11 tool references found, file > 2000 bytes
    Evidence: .omo/evidence/task-31-prompt-content.txt
  ```
  ```
  Scenario: Export validates
    Tool: Bash (tsx -e)
    Preconditions: Files exist
    Steps:
      1. tsx -e "import {NOVEL_WEAVER_AGENT_CONFIG} from './src/agents/master-config'; const cfg=Object.values(NOVEL_WEAVER_AGENT_CONFIG)[0]; console.log('Agent:', cfg.description); console.log('Tools:', Object.keys(cfg.tools||{}).length);"
    Expected Result: Agent description printed, tools count >= 25
    Evidence: .omo/evidence/task-31-export-valid.txt
  ```

  **Commit**: YES (groups with T14-T21)
  - Files: `src/agents/master-prompt.ts`, `src/agents/master-config.ts`, `src/agents/index.ts`, `src/index.ts`, `README.md`

---

### Wave 4 — Tools

- [x] 22. **Create novel_crosscheck tool**

  **What to do**:
  - Create `src/modules/crosscheck/tool.ts`
  - New tool: `novel_crosscheck` — detect cross-chapter fact conflicts
  - Check dimensions:
    1. **Temporal conflicts**: character A died in ch5 but appears in ch8 without revival explanation
    2. **Location conflicts**: character in two places at same time
    3. **Power level conflicts**: character shows power exceeding last recorded level without breakthrough
    4. **Relationship conflicts**: character relationship state regression (enemies now allies without transition)
    5. **Item conflicts**: item used/consumed before it was acquired
    6. **Fact contradictions**: chapter_facts with incompatible fact_types for same entity
    7. **Unresolved hooks**: hooks set N chapters ago with no payoff
  - Input: `scope` (all/dungeon/chapter range), `dungeon_id` (optional)
  - Output: `{ conflicts: Conflict[], summary: string }` with severity/proof/chapter references
  - Uses entity linker (T10) for entity matching across chapters
  - Uses chapter_facts (T7) for temporal comparison

  **Must NOT do**:
  - Don't merge with novel_consistency_check (they check different things)
  - Don't make LLM calls for simple comparison logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex cross-referencing logic across multiple tables
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T22, T23, T24, T25)
  - **Blocks**: None
  - **Blocked By**: Tasks 7 (chapter_facts), 10 (entity linker)

  **References**:
  - `src/modules/consistency/tool.ts` — Existing 5-dimension check pattern (output format, evidence methodology)
  - `src/modules/chapter/engine/entity-linker.ts` — Entity matching
  - `src/db/schema.ts` — chapter_facts table

  **Acceptance Criteria**:
  - [ ] Tool registered in src/index.ts as novel_crosscheck
  - [ ] Detects temporal conflict (character appears after death)
  - [ ] Detects unresolved hooks
  - [ ] Output format matches existing consistency check pattern
  - [ ] All DB reads use parameterized queries
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Detect temporal conflict
    Tool: Bash (tsx -e)
    Preconditions: chapter_facts has (ch5: character death) and (ch8: character appears)
    Steps:
      1. tsx -e "import {crosscheck} from './src/modules/crosscheck/tool'; const r=crosscheck({scope:'all'}); console.log('Conflicts:', r.conflicts.filter(c=>c.type==='temporal').length)"
    Expected Result: At least 1 temporal conflict found
    Failure Indicators: 0 conflicts when known conflict exists
    Evidence: .omo/evidence/task-21-temporal-conflict.txt
  ```

  **Commit**: YES (groups with T22, T23, T24, T25)
  - Message: `feat(tools): add crosscheck, state_snapshot, foreshadow, style_anchor tools`
  - Files: `src/modules/crosscheck/tool.ts`, `src/index.ts`

- [x] 23. **Create novel_state_snapshot tool**

  **What to do**:
  - Create `src/modules/state-snapshot/tool.ts`
  - New tool: `novel_state_snapshot` — query entity state at any point
  - Input: `entity_id` (character/world/dungeon), `at_chapter` (optional, default=latest)
  - Output: `{ entity, currentState, stateHistory: [{chapter, state, change}], relationships }`
  - Shows:
    - Current status_tags (昏迷/受伤/升级/...)
    - Power level progression over chapters
    - Location history
    - Items acquired/lost
    - Relationship changes with other entities
    - First/last appearance chapters
  - Query from `character_states` table (T1) + `chapter_facts` (T7) for timeline

  **Must NOT do**:
  - Don't modify state (read-only tool)
  - Don't include unrelated entities

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Data aggregation from multiple sources
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T22, T24, T25, T26)
  - **Blocks**: None
  - **Blocked By**: Tasks 1 (character_states table), 7 (chapter_facts)

  **References**:
  - `src/modules/progress/tool.ts` — Existing query+display pattern
  - `src/modules/chapter/engine/entity-linker.ts` — Entity resolution

  **Acceptance Criteria**:
  - [ ] Tool registered as novel_state_snapshot
  - [ ] Returns state history with at least 2 chapters
  - [ ] Location history shown
  - [ ] Parameterized queries only
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Character state snapshot
    Tool: Bash (tsx -e)
    Preconditions: character_states has data for character
    Steps:
      1. tsx -e "import {snapshot} from './src/modules/state-snapshot/tool'; const r=snapshot({entityId:'char-1'}); console.log('Chapters:', r.stateHistory?.length)"
    Expected Result: Returns stateHistory with previous chapter entries
    Failure Indicators: Empty/null history, crash
    Evidence: .omo/evidence/task-22-snapshot.txt
  ```

  **Commit**: YES (groups with T22-T26)
  - Files: `src/modules/state-snapshot/tool.ts`, `src/index.ts`

- [x] 24. **Create novel_foreshadow tool**

  **What to do**:
  - Create `src/modules/foreshadow/tool.ts`
  - New tool: `novel_foreshadow` — foreshadowing tracking dashboard
  - Tracks:
    - **Hook set**: when a hook/question/chekhov's gun is introduced (from chapter_facts hook_set type)
    - **Hook payoff**: when it's resolved (hook_payoff type)
    - **Unresolved hooks**: hooks set N chapters ago with no payoff (configurable threshold)
    - **Hook density**: hooks per chapter (too many = confusing, too few = flat)
    - **Hook type distribution**: mystery_hook, crisis_hook, emotional_hook, world_building_hook, relationship_hook
  - Input: `dungeon_id` (optional), `threshold` (default 10 chapters = alert if unresolved > 10 chapters)
  - Output: `{ hooks: Hook[], unresolved: Hook[], density: {chapter: number, count: number}[], summary: string }`

  **Must NOT do**:
  - Don't modify hooks (read-only tracking)
  - Don't generate new hooks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Pattern analysis across chapter_facts
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T22, T23, T25, T26)
  - **Blocks**: None
  - **Blocked By**: Tasks 7 (chapter_facts hook_set/hook_payoff types)

  **References**:
  - `src/modules/consistency/tool.ts` — Report generation pattern
  - `/root/webnovel-writer/agents/reviewer.md` — Hook tracking (上章钩子回应 check)
  - `/root/webnovel-writer/scripts/data_modules/context_manager.py:_load_reader_signal` — Hook type stats, pattern usage

  **Acceptance Criteria**:
  - [ ] Tool registered as novel_foreshadow
  - [ ] Detects unresolved hooks after threshold
  - [ ] Hook density per chapter displayed
  - [ ] Parameterized queries only
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Unresolved hook detection
    Tool: Bash (tsx -e)
    Preconditions: chapter_facts has hook_set in ch5, no hook_payoff by ch20
    Steps:
      1. tsx -e "import {foreshadow} from './src/modules/foreshadow/tool'; const r=foreshadow({threshold:10}); console.log('Unresolved:', r.unresolved.length)"
    Expected Result: At least 1 unresolved hook detected
    Failure Indicators: 0 unresolved when known unresolved exists
    Evidence: .omo/evidence/task-23-foreshadow.txt
  ```

  **Commit**: YES (groups with T22-T26)
  - Files: `src/modules/foreshadow/tool.ts`

- [x] 25. **Create novel_style_anchor tool**

  **What to do**:
  - Create `src/modules/style-anchor/tool.ts` (public tool, vs T3's internal storage)
  - New tool: `novel_style_anchor` — manage style anchors
  - Commands:
    - `list`: list all anchors (auto-extracted + manual)
    - `extract [count=5]`: auto-extract from last N chapters
    - `add [file_path]`: add manual anchor from .md file
    - `remove [anchor_id]`: remove anchor
    - `set-primary [anchor_id]`: set active anchor (override)
    - `show [anchor_id]`: display anchor details (sentence dist, word freq, etc.)
    - `compare [text]`: compare text to active anchor, return StyleDeviation[]
  - Uses style analyzer (T11) for comparison
  - Stores in `.novel-weaver/style-anchors/` directory

  **Must NOT do**:
  - Don't allow deletion of all anchors (keep at least auto-extracted)
  - Don't exceed 50 anchors per project

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File management + tool registration
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T22, T23, T24, T26)
  - **Blocks**: None
  - **Blocked By**: Tasks 3 (style anchor storage), 11 (style analyzer)

  **References**:
  - `src/modules/style-anchor/tool.ts` — Internal storage functions (from T3)
  - `src/modules/style-anchor/analyzer.ts` — Comparison engine
  - `src/modules/consistency/tool.ts` — Tool registration pattern (export function, register in index.ts)

  **Acceptance Criteria**:
  - [ ] Tool registered as novel_style_anchor
  - [ ] `extract` command extracts from last N chapters
  - [ ] `list` command shows all anchors
  - [ ] `compare` command returns StyleDeviation[]
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Extract and list anchors
    Tool: Bash (tsx -e)
    Preconditions: 5+ chapters exist
    Steps:
      1. tsx -e "import {styleAnchor} from './src/modules/style-anchor/tool'; await styleAnchor({command:'extract',count:3}); const list=await styleAnchor({command:'list'}); console.log('Anchors:', list.anchors.length)"
    Expected Result: anchors.length >= 1 (extracted)
    Failure Indicators: 0 anchors, crash
    Evidence: .omo/evidence/task-25-anchor-list.txt
  ```

  **Commit**: YES (groups with T22)
  - Files: `src/modules/style-anchor/tool.ts`, `src/index.ts`

- [x] 26. **Upgrade existing tools to use new memory system**

  **What to do**:
  - Modify existing tools to leverage new tables:
    - `novel_query`: Add chapter_facts search, character_states query in results
    - `novel_stats`: Add genre-aware statistics, chapter_facts-based metrics
    - `novel_progress_track`: Add character state tracking to progress
    - `novel_consistency_check`: Add cross-chapter fact comparison dimension
    - `novel_review_chapter`: Pass style profile to reviewer for Layer 7 check
    - `novel_pipeline_start`: Integrate PlotWriter as default writer
  - Each change is minimal (add new data source, keep existing logic)

  **Must NOT do**:
  - Don't rewrite existing tools — only add new data sources
  - Don't change existing tool interfaces

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple small changes across many files
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T22, T23, T24, T25)
  - **Blocks**: None
  - **Blocked By**: Tasks 7 (chapter_facts), 8 (context assembly), 15 (Reviewer upgrade)

  **References**:
  - `src/modules/query/tool.ts` — Query tool
  - `src/modules/progress/tool.ts` — Progress tracking

  **Acceptance Criteria**:
  - [ ] novel_query returns fact-based results
  - [ ] novel_stats shows genre-aware metrics
  - [ ] All changes use parameterized queries
  - [ ] Existing tool behaviors preserved
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Query includes new facts
    Tool: Bash (tsx -e)
    Preconditions: chapter_facts has data, query tool loaded
    Steps:
      1. tsx -e "import {query} from './src/modules/query/tool'; const r=await query({query:'主角', type:'auto'}); console.log('Has facts:', r.results?.some(r=>r.source==='chapter_facts'))"
    Expected Result: Results include chapter_facts as source
    Failure Indicators: No fact results
    Evidence: .omo/evidence/task-26-query-facts.txt
  ```

  **Commit**: YES (groups with T22)
  - Files: `src/modules/query/tool.ts`, `src/modules/progress/tool.ts`, `src/modules/consistency/tool.ts`, `src/modules/review/tool.ts`, `src/modules/pipeline/orchestrator.ts`

---

### Wave 5 — AI 动态生成 Dashboard（每个小说独一无二）

> **核心思路**：不是固定模板 UI，而是 AI 读取项目数据后，为每个小说项目**自主生成一套专属 HTML 页面**。
> 仙侠项目 → 修仙风格面板（境界突破图、丹药炉、灵气脉络）
> 科幻项目 → 科技风格面板（星图、科技树、舰船状态）
> 每个项目都不一样，完全由 AI 根据项目内容决定 UI 结构和视觉风格。

- [ ] 27. **Create Dashboard HTTP server**

  **What to do**:
  - Create `src/dashboard/server.ts` — Express.js server setup:
    - Serve static files from `.novel-weaver/dashboard/` (AI 生成的页面目录)
    - CORS middleware (allow localhost + LAN access for mobile)
    - Port config via env `NOVEL_DASHBOARD_PORT` (default 3456)
    - **Host binding**: default `127.0.0.1` (local only), support `--host 0.0.0.0` for LAN/mobile access
    - Auto-open browser on start (skip when remote host)
    - Graceful shutdown on SIGTERM/SIGINT
  - Create `src/dashboard/routes.ts`:
    - Mount REST API routes at `/api/*`
    - Serve `index.html` for all other routes (SPA fallback for generated pages)
  - Add dependencies to `package.json`: `express` ^4.18, `cors` ^2.8, `compression` ^1.7
  - Add typings: `@types/express`, `@types/cors` to devDependencies

  **Must NOT do**:
  - Don't expose server to external network (localhost only)
  - Don't add authentication (single-user tool)
  - Don't modify existing DB or tools

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Server infrastructure with multiple concerns
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T28, T29, T30)
  - **Blocks**: T28 (API routes mount on server)
  - **Blocked By**: None (standalone server setup)

  **Acceptance Criteria**:
  - [ ] Server starts on port 3456
  - [ ] `curl http://localhost:3456/api/health` returns `{ status: "ok" }`
  - [ ] Static files from `.novel-weaver/dashboard/` served correctly
  - [ ] SPA fallback works (non-API routes return index.html)
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Server starts and responds
    Tool: Bash
    Preconditions: None
    Steps:
      1. tsx src/dashboard/server.ts &
      2. sleep 2
      3. curl -s http://localhost:3456/api/health
      4. kill %1
    Expected Result: curl returns JSON with status "ok"
    Evidence: .omo/evidence/task-27-server-health.txt
  ```

  **Commit**: YES (groups with T27-T30)
  - Files: `src/dashboard/server.ts`, `src/dashboard/routes.ts`, `package.json`

- [ ] 28. **Create Dashboard REST API**

  **What to do**:
  - Create `src/dashboard/api.ts` — Express Router with endpoints:
    - **All list endpoints support `?page=&limit=` pagination** for mobile connections
    - `GET /api/health` → `{ status: "ok", version }`
    - `GET /api/project` → project name, genre, author, stats
    - `GET /api/worlds` → list of all worlds with metadata
    - `GET /api/worlds/:id` → single world with entities
    - `GET /api/dungeons` → list of dungeons with progress
    - `GET /api/dungeons/:id` → single dungeon with chapters + NPCs
    - `GET /api/chapters` → chapter tree (by volume)
    - `GET /api/chapters/:id` → single chapter content
    - `GET /api/characters` → character list with world info
    - `GET /api/characters/:id` → single character + relations
    - `GET /api/stats` → writing statistics (words, chapters, completion)
    - `GET /api/graph` → entity graph data (nodes + edges for vis.js)
    - `GET /api/project-context` → **完整项目上下文（供 AI 生成 Dashboard 使用）**
  - **Write API** (直接调用 novel-weaver 工具函数):
    - `POST /api/chapters/write` → 调用 `writeChapter()`
    - `POST /api/chapters/:id/edit` → 调用 `writeEdit()`
    - `POST /api/chapters/:id/review` → 调用 `reviewChapter()`
    - `POST /api/chapters/:id/fix` → 调用 `reviewFix()`
    - `POST /api/dungeons/generate` → 调用 `dungeonGenerate()`
    - `POST /api/characters/create` → 调用 `characterCreate()`
    - `POST /api/consistency/check` → 调用 `consistencyCheck()`
    - `POST /api/pipeline/start` → 调用 `pipelineStart()`
    - **Safety**: 写操作前弹出确认对话框（防误触），敏感操作需二次确认
  - **标注 API** (段落级批注系统):
    - `GET /api/annotations?chapter_id=` → 获取某章所有标注
    - `POST /api/annotations` → 创建标注 `{ chapter_id, paragraph_index, text, page_url? }`
    - `PUT /api/annotations/:id` → 编辑标注内容
    - `DELETE /api/annotations/:id` → 删除标注
    - 标注存储在 `annotations` 表中 (见 T5 schema 更新)
  - Each endpoint reads from `.novel-weaver/novel-weaver.db` via sql.js
  - Cache DB handle per-request (not singleton — server context)
  - All queries are parameterized (no string interpolation)
  - **Mobile optimization**: response under 50KB per page, `compression` middleware

  **Must NOT do**:
  - Don't expose tool functions to unauthenticated external requests (localhost/LAN only)
  - Don't skip confirmation for destructive operations
  - Don't use the singleton `getDatabase()` pattern

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many data endpoints + write operations + sql.js patterns
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T27, T29, T30)
  - **Blocks**: T29 (generator needs API)
  - **Blocked By**: T27 (routes mount on server instance)

  **Acceptance Criteria**:
  - [ ] All endpoints respond with valid JSON
  - [ ] `GET /api/graph` returns nodes + edges arrays
  - [ ] `GET /api/project-context` returns full project data (worlds, characters, dungeons, stats)
  - [ ] Write endpoints call respective tool functions successfully
  - [ ] All queries are parameterized
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Project context endpoint
    Tool: Bash (curl)
    Preconditions: DB has project data
    Steps:
      1. tsx src/dashboard/server.ts &
      2. sleep 2
      3. curl -s http://localhost:3456/api/project-context | python3 -c "import sys,json; d=json.load(sys.stdin); print('Genre:', d.get('genre'), 'Worlds:', len(d.get('worlds',[])), 'Chars:', len(d.get('characters',[])))"
      4. kill %1
    Expected Result: Returns structured project data with genre, worlds, characters
    Evidence: .omo/evidence/task-28-project-context.txt
  ```

  **Commit**: YES (groups with T27-T30)
  - Files: `src/dashboard/api.ts`

- [ ] 29. **Create AI-powered dashboard page generator**

  **What to do**:
  - Create `src/dashboard/generator.ts` — AI-driven dashboard generator:
    - **流程**: 
      1. `loadProjectContext()` — 读取项目全部数据（世界观、角色、副本、章节、统计、题材画像、风格锚点）
      2. `buildDashboardPrompt(context)` — 组装生成提示词，包含:
         - 项目名称、题材、风格锚点信息
         - 所有实体列表（世界+角色+副本+章节）
         - 关键数据统计（总字数、章节数、完成度）
         - 题材特定的 UI 风格建议（仙侠→古风、科幻→霓虹、恐怖→暗黑...）
         - **无 UI 模板限制** — AI 完全自由决定页面结构、导航方式、视觉风格
      3. `callGenerator(context, prompt)` — 调用 AI Agent 生成完整 HTML
         - Agent 输出一个**自包含的 HTML 文件**（内联 CSS + JS）
         - 要求: 移动端适配、触控友好、调用 `/api/*` 获取动态数据
         - 可包含多个"页面"（通过 JS 切换或单页滚动）
      4. `saveDashboard(html)` — 写入 `.novel-weaver/dashboard/index.html`
      5. 返回 URL: `http://localhost:3456`
    - **Regeneration**: `regenerate(force=false)` 仅在数据变化时重新生成
    - **Fallback**: 生成失败时提供极简 HTML（纯文本列表）
      - **标注系统**: 每个段落支持长按标注（移动端）、点击标注（桌面端）
        - 段落右侧/下方显示标注按钮（📌 或类似图标）
        - 点击后弹出标注输入框，保存到 `POST /api/annotations`
        - 已有标注的段落高亮显示，点击可查看/编辑/删除
        - 提示词明确要求生成标注 UI 组件（长按事件 + 弹窗 + 列表）
      - Agent 调用: 复用 PlotWriter 或新建 DashboardDesigner Agent
  - **温度**: 0.80（视觉创意需要多样性，在 `chat.params` hook 中按 agent 名 "dashboard-generator" 匹配）
  - 提示词重点:
    - "你是这个小说项目的专属网页设计师。你的任务不是套模板，而是为这个独特的故事创作一个独一无二的网页。"
    - "根据题材决定视觉风格——仙侠用古风配色和水墨元素，科幻用霓虹和科技感，恐怖用暗色调和诡异字体。"
    - "页面结构由你决定——可以是一个长滚动页面、多标签 SPA、卡片式布局……完全由你根据项目内容设计。"
    - "所有数据从 /api/* 获取。移动端适配。触控友好。"
    - "不要生成固定的占位内容——每个数据点都要从 API 实时加载。"

  **Must NOT do**:
  - Don't hardcode any page structure or CSS theme
  - Don't use pre-built templates (AI must generate from scratch each time)
  - Don't include external dependencies (self-contained HTML only)
  - Don't generate placeholder/spacer content (all data from API)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Complex prompt engineering for AI-driven creative HTML generation
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on project data + API readiness)
  - **Parallel Group**: Sequential after T28
  - **Blocks**: T30 (tool needs generator)
  - **Blocked By**: T28 (API endpoints must be ready for generated HTML to call)

  **Acceptance Criteria**:
  - [ ] `generateDashboard()` produces `.novel-weaver/dashboard/index.html`
  - [ ] Generated HTML is self-contained (no external CDN/CSS/JS dependencies)
  - [ ] Generated HTML fetches data from `/api/*` at runtime
  - [ ] Generated HTML is mobile-responsive (375px viewport works)
  - [ ] Two different projects produce visually distinct dashboards
  - [ ] Regeneration preserves API data flow (doesn't break endpoints)
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Generate dashboard for xianxia project
    Tool: Bash (tsx -e)
    Preconditions: DB has project "test" genre="xianxia" with worlds + characters
    Steps:
      1. tsx src/dashboard/server.ts &
      2. sleep 2
      3. tsx -e "import {generateDashboard} from './src/dashboard/generator'; const r=await generateDashboard({projectRoot:'.', force:true}); console.log('Path:', r.path, 'Size:', r.size, 'bytes')"
      4. curl -s http://localhost:3456/ | head -5
      5. kill %1
    Expected Result: index.html created, size > 1000 bytes, starts with <!DOCTYPE html>
    Evidence: .omo/evidence/task-29-gen-xianxia.txt
  ```
  ```
  Scenario: Mobile responsive check
    Tool: Playwright
    Preconditions: Dashboard generated and server running
    Steps:
      1. python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:3456/')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='.omo/evidence/task-29-mobile-dashboard.png')
    body_w = page.evaluate('document.body.scrollWidth')
    vp_w = page.evaluate('window.innerWidth')
    print(f'Body: {body_w}, VP: {vp_w}')
    assert body_w <= vp_w, 'Overflow detected'
    browser.close()
print('PASS')
"
    Expected Result: Screenshot saved, no overflow, content readable
    Evidence: .omo/evidence/task-29-mobile-dashboard.png
  ```

  **Commit**: YES (groups with T27-T30)
  - Files: `src/dashboard/generator.ts`, `src/dashboard/prompts/dashboard-generator.md`

- [ ] 30. **Create novel_dashboard tool + skill integration**

  **What to do**:
  - Register `novel_dashboard` tool in `src/index.ts`:
    - `args`: `{ action: "generate" | "start" | "stop" | "status" | "regenerate", host?: string }`
    - `generate`: 调用生成器 → AI 读取项目数据 → 生成专属 HTML → 保存 → 启动服务器 → 返回 URL
    - `regenerate`: 重新生成（更新章节/角色后刷新页面）
    - `start`: 启动服务器（如果已有生成好的页面）, `host="0.0.0.0"` 用于手机连接
    - `stop`: 优雅关闭服务器
    - `status`: 返回运行状态、端口、URL、Dashboard 文件大小
    - 自动检测 LAN IP，日志输出 `http://<lan-ip>:3456`
  - Backed by `src/dashboard/manager.ts`:
    - Process lifecycle management
    - Port availability detection
    - Auto-restart on crash (with backoff)
  - Create `src/commands/dashboard.ts` — slash command support
  - Register `novel_dashboard` in command router
  - Create skill for quick launch: `~/.config/opencode/skills/novel-dashboard/SKILL.md`

  **Must NOT do**:
  - Don't auto-start server on plugin load (user opt-in only)
  - Don't require pre-built frontend (AI generates it)
  - Don't modify existing tool interfaces

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Tool registration + process management + agent orchestration
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T27, T28)
  - **Blocks**: None
  - **Blocked By**: T27 (server module), T29 (generator module)

  **Acceptance Criteria**:
  - [ ] `novel_dashboard action=generate` creates `.novel-weaver/dashboard/index.html` and starts server
  - [ ] `novel_dashboard action=status` returns running/port/URL
  - [ ] `novel_dashboard action=regenerate` regenerates page with updated data
  - [ ] `novel_dashboard action=stop` shuts down gracefully
  - [ ] Skill file exists at `~/.config/opencode/skills/novel-dashboard/SKILL.md`
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Full dashboard lifecycle
    Tool: Bash (tsx -e)
    Preconditions: Novel project exists with data
    Steps:
      1. tsx -e "import {dashboardTool} from './src/dashboard/manager'; const r=await dashboardTool.execute({action:'generate'},{directory:'/root/novel-plugin'}); console.log('Result:', typeof r)"
      2. sleep 3
      3. curl -s http://localhost:3456/api/health
      4. tsx -e "import {dashboardTool} from './src/dashboard/manager'; await dashboardTool.execute({action:'stop'},{directory:'/root/novel-plugin'});"
    Expected Result: Generate starts server → health check OK → stop succeeds
    Evidence: .omo/evidence/task-30-lifecycle.txt
  ```
  ```
  Scenario: Distinct generation for different genres
    Tool: Bash
    Preconditions: Two projects with different genres
    Steps:
      1. tsx -e "import {generateDashboard} from './src/dashboard/generator'; const html1=await generateDashboard({projectRoot:'/root/novel-plugin/projectA', force:true}); const html2=await generateDashboard({projectRoot:'/root/novel-plugin/projectB', force:true}); console.log('Diff:', html1.size !== html2.size ? 'DISTINCT' : 'SAME')"
    Expected Result: Two projects produce different HTML (different CSS/structure)
    Evidence: .omo/evidence/task-30-genre-diff.txt
  ```

  **Commit**: YES (groups with T27-T30)
  - Files: `src/index.ts`, `src/dashboard/manager.ts`, `src/dashboard/prompts/dashboard-generator.md`, `src/commands/dashboard.ts`
  - Create `src/commands/dashboard.ts` — slash command support
  - Register `novel_dashboard` in command router (`src/commands/index.ts`)
  - Create skill file in `~/.config/opencode/skills/novel-dashboard/SKILL.md`:
    - Metadata: name, description, trigger keywords
    - Execution flow: start server → open browser → return URL
    - Error recovery steps

  **Must NOT do**:
  - Don't auto-start server on plugin load (user opt-in only)
  - Don't require build dependency for the skill (prebuilt dist/)
  - Don't modify existing tool interfaces

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Tool registration + process management + skill file
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T27, T28, T29)
  - **Blocks**: None
  - **Blocked By**: T27 (server module to manage), T29 (frontend dist to host)

  **Acceptance Criteria**:
  - [ ] `novel_dashboard action=start` returns URL
  - [ ] `novel_dashboard action=status` returns running/port
  - [ ] `novel_dashboard action=stop` shuts down
  - [ ] URL opens in browser automatically (or logs clickable link)
  - [ ] Skill file exists at `~/.config/opencode/skills/novel-dashboard/SKILL.md`
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Dashboard start/stop lifecycle
    Tool: Bash (tsx -e)
    Preconditions: None
    Steps:
      1. tsx -e "import {dashboardTool} from './src/dashboard/manager'; const r=await dashboardTool.execute({action:'start'},{directory:'/root/novel-plugin'}); console.log('URL:', r);"
      2. sleep 2
      3. curl -s http://localhost:3456/api/health
      4. tsx -e "import {dashboardTool} from './src/dashboard/manager'; await dashboardTool.execute({action:'stop'},{directory:'/root/novel-plugin'});"
    Expected Result: URL logged, health check returns ok, stop succeeds
    Evidence: .omo/evidence/task-30-dashboard-lifecycle.txt
  ```

  **Commit**: YES (groups with T27-T30)
  - Files: `src/index.ts`, `src/dashboard/manager.ts`, `src/commands/dashboard.ts`, `~/.config/opencode/skills/novel-dashboard/SKILL.md`

---

### Wave 6 — Annotation + AI Feedback Loop (T32)

> 读者在 Dashboard 上标注 → AI 检测标注 → 自动生成修改方案 → 应用到章节

- [ ] 32. **Create novel_annotations tool + integrate into PlotWriter/Reviewer prompts**

  **What to do (part 1 — tool)**:
  - Create `src/modules/annotations/tool.ts` — 标注管理工具:
    - `novel_annotations action=list chapter_id=XXX` → 列出某章所有未解决标注
    - `novel_annotations action=check` → 检查所有章节的未解决标注，返回摘要
    - `novel_annotations action=resolve id=XXX` → 标记标注为已处理
    - `novel_annotations action=resolve_all chapter_id=XXX` → 标记某章全部已处理
    - 返回格式: `{ total: N, unresolved: N, items: [{ paragraph_index, text, chapter_title, created_at }] }`
  - Register in `src/index.ts` as `novel_annotations` tool
  - Register in command router (`src/commands/index.ts`)
  - Query from `annotations` table (parameterized)
  - **AI 集成**:
    - `check` 返回的摘要包含: 标注总数、按章节分组、每个标注的原文段落摘录
    - 返回格式优化为 AI 易读: `"第3章第5段: '这个战斗描写太简略了' → 当前原文: '他一剑斩出'"`
    - 让 AI 能直接理解每个标注对应的具体内容

  **What to do (part 2 — prompt integration)**:
  - **PlotWriter 提示词升级** (`src/agents/prompts/PlotWriter.ts`):
    - 在提示词中新增「读者标注区」:
      ```
      ## 读者标注
      如果本章有未解决的读者标注（通过 novel_annotations tool 获取），
      你必须先阅读所有标注，然后在写作中体现修改意图。
      标注格式: [第X段] 标注内容: "..." | 原文: "..."
      处理方式: 在写作时考虑标注意见，无需单独回应。
      ```
  - **Reviewer 提示词升级** (`src/agents/prompts/Reviewer.ts`):
    - 在审查标准中新增:
      ```
      ## 标注一致性检查
      如果本章有读者标注，检查章节是否已按标注意见修改。
      未修改的标注列为 WARNING 级别问题。
      ```
  - **对话流程示范**（AI 使用 annotions tool 的预期行为）:
    1. 用户说"继续写下一章"
    2. AI 调用 `novel_annotations action=check` 检查未解决标注
    3. AI 发现标注: "第3章战斗描写太简略"
    4. AI 回复: "检测到你之前标注了第3章的战斗描写需要加强，我在下一章会注意增加战斗细节"
    5. AI 调用 `novel_write_chapter` 写新章节，战斗中加重描写
    6. AI 调用 `novel_annotations action=resolve_all` 标记已处理

  **Must NOT do**:
  - Don't auto-modify chapters (tool only reads + resolves)
  - Don't include resolved annotations in default list
  - Don't modify existing DB schema (uses annotations table)
  - Don't add English text to prompts (keep Chinese)
  - Don't make annotation check mandatory (AI chooses when to check)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple CRUD tool, follows existing tool patterns
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with T32)
  - **Blocks**: None
  - **Blocked By**: T5 (annotations table in schema)

  **Acceptance Criteria**:
  - [ ] `novel_annotations action=list` returns annotations for a chapter
  - [ ] `novel_annotations action=check` returns summary with paragraph excerpts
  - [ ] `novel_annotations action=resolve` marks annotation as resolved
  - [ ] All queries parameterized
  - [ ] PlotWriter prompt contains "读者标注" section
  - [ ] Reviewer prompt contains "标注一致性检查" section
  - [ ] no tsc errors

  **QA Scenarios**:
  ```
  Scenario: Check annotations with paragraph context
    Tool: Bash (tsx -e)
    Preconditions: annotations table has data, chapters exist
    Steps:
      1. tsx -e "import {annotationsTool} from './src/modules/annotations/tool'; const r=await annotationsTool.execute({action:'check'},{directory:'/root/novel-plugin'}); console.log('Unresolved:', r.total); console.log('Sample:', r.items?.[0]?.text)"
    Expected Result: Returns unresolved count and at least one annotation with paragraph context
    Evidence: .omo/evidence/task-31-annotations-check.txt
  ```

  **Commit**: YES (groups with T31-T32)
  - Files: `src/modules/annotations/tool.ts`, `src/index.ts`, `src/commands/index.ts`

### Wave 7 — Style Imprint Learning（从已有小说学习风格）

> 用户提供一本 TXT 小说 → 统计分析 + AI 风格总结 → 生成风格印记 JSON → 自动注入 PlotWriter 写作提示词

- [ ] 33. **Create style imprint type definitions + storage layer**

  **What to do**:
  - Create `src/modules/style-imprint/imprint-schema.ts` — 定义 `StyleImprint` 接口:
    ```typescript
    interface StyleImprint {
      name: string;                     // 印记名称
      source: string;                   // 源文件路径
      charCount: number;                // 总字符数
      analyzedAt: string;               // ISO 时间戳
      styleProfile: {
        avgSentenceLength: number;      // 平均句长（字符数）
        avgParagraphLength: number;     // 平均段长
        dialogueRatio: number;          // 对话比例 0-1
        topBigrams: [string, number][]; // Top 50 高频二字词组
        topWords: [string, number][];   // Top 100 高频词（单字+双字）
        chapterStartPatterns: string[]; // 开篇模式标签
        chapterEndPatterns: string[];   // 收尾模式标签
        sentenceLengthDist: number[];   // 句长分布 [<10, 10-20, 20-30, 30-50, >50]
        paragraphCharDist: number[];    // 段长分布 [<50, 50-100, 100-200, 200-500, >500]
        punctuationFreq: Record<string, number>; // 标点频率
      };
      representativePassages: {          // 3-5 段范文
        label: string;                  // "第3章中段·战斗描写"
        text: string;                   // 段落原文（200-500 字）
        tags: string[];                 // ["战斗", "动作", "紧张"]
      }[];
      aiStyleSummary: string;           // AI 风格总结（200-300 字中文）
      active: boolean;                  // 是否启用
    }
    ```
  - Create `src/modules/style-imprint/storage.ts`:
    - `saveImprint(projectRoot, imprint)` → 写入 `.novel-weaver/style-imprints/{name}.json`
    - `loadImprint(projectRoot, name)` → 从文件加载
    - `listImprints(projectRoot)` → 列出所有印记
    - `deleteImprint(projectRoot, name)` → 删除
    - `getActiveImprint(projectRoot)` → 获取当前激活的印记
    - `setActiveImprint(projectRoot, name | null)` → 设置/取消激活
  - Create `.novel-weaver/style-imprints/` directory in init flow
  - Import jieba (or equivalent) for Chinese word segmentation — use simple character bigram as fallback

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T34, T35, T36)
  - **Blocked By**: T5 (init flow for directory creation)

  **References**:
  - `src/modules/init/tool.ts` — Init flow to create style-imprints dir
  - `.novel-weaver/style-anchors/` — Similar file-based storage pattern

- [ ] 34. **Create statistical text analyzer for Chinese web novels**

  **What to do**:
  - Create `src/modules/style-imprint/analyzer.ts`:
    - `analyzeNovel(filePath: string): Promise<Partial<StyleImprint>>` — 主入口
    - 读取 TXT 文件（UTF-8，支持大文件分块）:
      - `fs.readFileSync()` — 小说通常 < 20MB，一次读入
      - 分章检测: 按 "第X章" / "Chapter X" 分割
    - **统计分析**:
      1. **句长统计**: 按。！？分行，计算每句长度，输出分布
      2. **段落统计**: 按空行分段，计算每段长度
      3. **对话比例**: 检测「」和 "" 内的内容比例
      4. **高频词**: 使用简单的 character bigram 分析（不求精确分词）
      5. **标点频率**: ，。！？、：；""「」——……的使用频次
      6. **开篇模式**: 每章开头200字的句式特征（对话/描写/叙述）
      7. **收尾模式**: 每章最后200字的句式特征
    - **代表性段落提取**:
      - 按类型聚类（对话密集段/描写段/动作段/心理段）
      - 从每类中选 1 个代表性段落（200-500 字）
    - 返回填充了统计数据的部分 `StyleImprint`
  - **特别注意**: 中文文本的句号分段、引号对话检测、章节标题识别
  - **大文件处理**: 100 万字小说约 5-10MB，无需流式处理

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T33, T35, T36)
  - **Blocked By**: T33 (imprint schema)

- [ ] 35. **Create novel_imprint tool**

  **What to do**:
  - Create `src/modules/style-imprint/tool.ts`:
    - `novel_imprint` 工具，支持动作:
    - **`analyze`**: 
      1. 读取 TXT 文件 → 调用 `analyzer.analyzeNovel()`
      2. 输出结构化的统计数据
      3. **提示用户**: "AI 风格总结尚未生成。请让 AI 阅读以上统计数据和代表性段落，生成风格总结（200-300 字），然后调用 `novel_imprint action=save` 保存。"
    - **`save`**: 用户提供 `name + aiStyleSummary` → 保存完整 StyleImprint 到文件
    - **`list`**: 列出所有保存的风格印记
    - **`activate name=xxx`**: 激活指定印记（写入`.novel-weaver/style-imprints/.active` 文件）
    - **`deactivate`**: 取消激活
    - **`remove name=xxx`**: 删除印记文件
  - Register in `src/index.ts`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T33, T34, T36)
  - **Blocked By**: T33 (storage), T34 (analyzer)

- [ ] 36. **Integrate style imprint injection into PlotWriter writing flow**

  **What to do**:
  - Create `src/modules/style-imprint/injector.ts`:
    - `injectImprintToPrompt(projectRoot, basePrompt): string`
    - 逻辑:
      1. 检查 `.novel-weaver/style-imprints/.active` 是否有激活的印记
      2. 没有 → 返回原 prompt
      3. 有 → 读取印记文件
      4. 在 prompt 中注入风格指示:
         ```
         ## 写作风格要求（当前激活风格: {name}）

         ### 风格总结
         {aiStyleSummary}

         ### 句式特征
         - 平均句长: {avgSentenceLength} 字（据此调节句子长短）
         - 对话比例: {dialogueRatio}%（据此控制对话密度）
         - 常用句式: {topBigrams} 中的高频搭配

         ### 范文参考（模仿以下段落的风格）
         {representativePassages.map(p => `示例1（${p.label}）:\n${p.text}`).join('\n\n')}
         ```
  - 在 `src/modules/chapter/engine/dispatcher.ts` 中调用 `injectImprintToPrompt()`:
    - 在分发 PlotWriter 任务前注入
  - **不修改 PlotWriter 提示词文件本身**（保持提示词纯净，注入在运行时）
  - 印记注入仅在 `novel_write_chapter` 和 `novel_write_continue` 时生效

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T33, T34, T35)
  - **Blocked By**: T33 (loadImprint/getActiveImprint)

---

### Wave 8 — Long-Form Novel Features（章节概要中心 + RAG 检索 + 事实锁定）

> 参考 CodeWhale 方案，解决长篇小说核心问题：Token 消耗过大（概要中心）、设定检索不精确（RAG）、关键事实漂移（不可变锁定）

- [ ] 37. **Create chapter summary table + summary generation engine**

  **What to do**:
  - Add `chapter_summaries` table to `src/db/schema.ts`:
    ```sql
    CREATE TABLE IF NOT EXISTS chapter_summaries (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL REFERENCES chapters(id),
      summary_level INTEGER NOT NULL DEFAULT 1,  -- 1=单章, 2=多章组, 3=压缩
      summary_text TEXT NOT NULL,                -- 正文概要
      key_events TEXT NOT NULL,                  -- JSON: 关键事件链
      cliffhangers TEXT,                         -- JSON: 未解决悬念
      character_end_states TEXT,                 -- JSON: 角色章末状态
      next_chapter_notes TEXT,                   -- 续写注意事项
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    ```
  - Create `src/modules/summary/engine/single.ts` — 单章概要生成:
    - 读取章节正文 → 提取: 事件链、关键细节、结尾状态、伏笔
    - 使用 PlotWriter Agent 或独立摘要 Agent
    - 输出结构化概要（Markdown 格式，500-800 字）
  - Create `src/modules/summary/engine/group.ts` — 多章概要组合并:
    - 选择 N 个单章概要 → 合并去重 → 生成统一的概要组
    - 自动识别跨章情节线
  - Create `src/modules/summary/engine/compress.ts` — 压缩概要组:
    - 将已有的概要组进一步压缩（用于 50+ 章的超长上下文）
    - 保留: 主线事件、角色当前状态、未回收伏笔
  - Create `src/modules/summary/schema.ts` — Summary 相关类型定义
  - **温度**: 0.40（摘要任务需要精确稳定，使用较低温度）

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T38-T42)
  - **Blocked By**: T1 (schema types)

- [ ] 38. **Create novel_summary tool + summary lifecycle management**

  **What to do**:
  - Create `src/modules/summary/tool.ts`:
    - `novel_summary action=generate chapter_id=XXX` → 生成/更新单章概要
    - `novel_summary action=generate_group chapter_ids=1,2,3,4,5` → 生成多章概要组
    - `novel_summary action=compress summary_id=XXX` → 压缩已有的概要组
    - `novel_summary action=list chapter_id=XXX` → 查看某章的所有概要版本
    - `novel_summary action=lock summary_id=XXX` → 锁定概要（防止被覆盖）
    - 返回: `{ level, summary_text, key_events, cliffhangers, next_chapter_notes }`
  - Register in `src/index.ts`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T37, T39-T42)
  - **Blocked By**: T37 (summary engine)

- [ ] 39. **🔥 Integrate summary system via OpenCode hooks (系统级上下文调度)**

  **What to do**:
  - **不在 context-manager.ts 内部实现**（那是工具级别的，范围太小）
  - 改为在 `src/index.ts` 中注册 **`experimental.chat.messages.transform`** hook:
    ```typescript
    "experimental.chat.messages.transform": async (_input, output) => {
      // 每次 LLM 请求前调用，可以修改整个消息列表
      for (const msg of output.messages) {
        // 检测消息是否包含旧的章节正文
        const chapterMatch = extractChapterRef(msg);
        if (!chapterMatch) continue;
        
        // 如果该章节有概要且不是最近 5 章 → 替换为概要
        const summary = await getBestSummary(chapterMatch.chapterId);
        if (summary && !isRecentChapter(chapterMatch.chapterNum, 5)) {
          msg.parts = [{ type: "text", text: summary.summary_text }];
        }
      }
    }
    ```
    - `getBestSummary()`: 优先级 压缩概要组 > 多章组 > 单章概要
    - `isRecentChapter()`: 最近 N 章保留原文（保证短期记忆）
    - **效果**: 100 章小说从 ~50 万 Token 降到 ~3 万 Token
  - 同时注册 **`experimental.session.compacting`** hook:
    ```typescript
    "experimental.session.compacting": async (_input, output) => {
      // OpenCode 触发压缩时，注入小说专属保留指令
      output.context.push(
        "此会话是小说创作项目。压缩时请特别注意保留:\n" +
        "1. 所有 locked facts（不可变事实）\n" +
        "2. 当前角色状态（上次更新时的修为、位置、关系）\n" +
        "3. 未回收的伏笔\n" +
        "4. 当前的创作意图和风格要求"
      );
    }
    ```
  - 添加配置选项: 
    - `.novel-weaverrc.json` 中 `context.summary.enabled=true` | `context.summary.recentChapters=5`
  - 这个 hook **系统级生效** — 不仅是 `novel_write_chapter` 调用时触发，用户问"之前那个 NPC 叫什么？"时也会触发概要替换

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T37-T38, T40-T42)
  - **Blocked By**: T37 (summary table exists), T38 (summary generation works)

- [ ] 40. **Create RAG embedder + vector store**

  **What to do**:
  - Create `src/modules/rag/embedder.ts`:
    - `embedText(text: string): Promise<number[]>` — 调用 Embedding API
    - `embedBatch(texts: string[]): Promise<number[][]>` — 批量处理
    - 默认使用 OpenAI `text-embedding-3-small`（维度 1536，性价比最高）
    - 配置: `.novel-weaverrc.json` 中 `embedding.model` 和 `embedding.apiKey`
    - 支持: OpenAI / 智谱 / SiliconFlow 兼容 API
    - 加入防抖: 同一文本在 5 分钟内不重复请求
  - Create `src/modules/rag/vector-store.ts`:
    - `storeVectors(entityType, entityId, chunks, vectors)` — 保存向量
    - `searchSimilar(queryVector, topK)` — 余弦相似度搜索（纯 JS 实现）
    - 存储格式: `.novel-weaver/vectors/{entity_type}/{entity_id}.json`
    - 每个文件: `{ id, chunk, vector: number[], metadata }`
    - Top-K 默认: 5（可通过配置调整）
  - Create `src/modules/rag/types.ts` — RAG 类型定义
  - **何时启用**: 设定条目（角色+世界+副本+事实）> 20 时自动启用
  - **温度**: 0.20（最低温度，embedding 任务不需要创造力）

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T37-T39, T41-T42)
  - **Blocked By**: None (独立模块)

- [ ] 41. **🔥 Integrate RAG via OpenCode hooks（系统级注入，不限于写工具调用）**

  **What to do**:
  - Create `src/modules/rag/retriever.ts`:
    - `buildRAGContext(query: string, projectRoot: string): Promise<string>`
    - 流程:
      1. 将用户的写作意图/当前问题向量化
      2. 在 `vectors/` 中搜索 Top-5 最相关设定
      3. 返回格式化的上下文块
  - **不修改 dispatcher.ts**（那是工具级别，范围太小）
  - 改为在 `src/index.ts` 中注册 **`experimental.chat.system.transform`** hook:
    ```typescript
    "experimental.chat.system.transform": async (_input, output) => {
      // 每次 LLM 请求前调用，可以修改 System Prompt
      // 判断是否 novel-weaver 项目（检查 .novel-weaverrc.json 是否存在）
      if (!isNovelProject()) return;
      
      // 检查是否可以启用 RAG（设定 > 20 条且有 embedding 配置）
      if (await shouldEnableRAG()) {
        // 获取用户最新消息作为查询
        const query = getLatestUserMessage();
        // 检索 Top-5 最相关设定
        const ragContext = await buildRAGContext(query);
        if (ragContext) {
          // 追加到 System Prompt 末尾
          output.system.push(
            `\n## 当前最相关的设定（RAG 检索）\n${ragContext}`
          );
        }
      }
    }
    ```
    - 这个 hook **系统级生效** — 用户问"主角的剑叫什么名字？"也会自动检索，不限于写作工具
  - **初始化流程**: 
    - `novel_init` 时检查 embedding 配置
    - 用户首次写作时自动索引所有现有设定（角色、世界、副本、事实）
    - 用户新增设定时增量索引
  - 如果 RAG 未启用（设定 < 20 条）或没有 embedding API Key，**跳过不影响正常功能**

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T37-T40, T42)
  - **Blocked By**: T40 (embedder + vector store exist)

- [ ] 42. **Immutable fact locking + consistency scoring**

  **What to do**:
  - Update `chapter_facts` table: add `locked INTEGER DEFAULT 0` column
  - Create `src/modules/consistency/lock.ts`:
    - `lockFact(factId)` — 锁定事实（标记为不可更改）
    - `unlockFact(factId)` — 解锁
    - `getLockedFacts()` — 列出所有不可变事实
    - `validateAgainstLocked(text)` — 验证文本是否违反任何锁定事实
  - Create `src/modules/consistency/scorer.ts`:
    - `scoreChapterConsistency(chapterId): ScoreReport`
    - 评分维度:
      - 事实一致性（对比 locked facts + chapter_facts）— 40 分
      - 角色一致性（性格、能力、关系）— 20 分
      - 设定一致性（世界观规则、力量体系）— 20 分
      - 时间线一致性（事件顺序、时间跳跃）— 20 分
    - 总分 0-100
    - 输出格式:
      ```json
      {
        "totalScore": 85,
        "dimensions": [
          { "name": "事实一致性", "score": 35, "maxScore": 40, "issues": [...] },
          { "name": "角色一致性", "score": 18, "maxScore": 20, "issues": [...] }
        ],
        "summary": "整体一致性良好，但第3段与锁定事实'主角是左撇子'矛盾"
      }
      ```
  - Update `novel_consistency_check` to include score output
  - Create `novel_fact_lock` tool:
    - `action=lock fact_id=XXX reason="主角出生地不可更改"`
    - `action=unlock fact_id=XXX`
    - `action=list` — 列出所有锁定事实
    - `action=validate chapter_id=XXX` — 验证章节是否违反锁定事实

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T37-T41)
  - **Blocked By**: T1 (chapter_facts schema)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results and wait for explicit user "okay".

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, confirm table schema, check agent registration). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + check for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify parameterized queries in all new DB code (no sq() calls).
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | Parameterized queries [ALL/FOUND sq()] | VERDICT`

- [ ] F3. **End-to-End QA** — `unspecified-high`
  Start from clean state. Execute full flow:
  1. `novel_init project_name="test" genre="xianxia"` → verify 4 new tables exist
  2. `novel_world_create` → create a core world
  3. `novel_dungeon_generate` → generate a dungeon
  4. `novel_write_chapter` (with PlotWriter) → verify commit was successful
  5. `novel_review_chapter` → verify 7-layer anti-AI check found issues
  6. `novel_state_snapshot` → verify returns character state
  7. `novel_crosscheck` → verify returns cross-chapter check
  8. `novel_style_anchor extract` → verify anchor extraction
  9. `novel_dashboard action=start` → verify dashboard starts and responds
  10. `curl http://localhost:3456/api/graph` → verify entity graph returns data
  11. `curl http://localhost:3456/api/stats` → verify stats endpoint works
  12. `novel_dashboard action=stop` → verify graceful shutdown
  13. Save all evidence to `.omo/evidence/final-qa/`
  Output: `Steps [N/N pass] | Evidence [N files] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Must NOT Have [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(db): add chapter_facts, character_states, outlines, aliases tables`
- **Wave 2**: `feat(engine): add context assembly, write-back, entity linking engines`
- **Wave 3**: `feat(agent): add PlotWriter agent + upgrade all agent prompts with anti-AI`
- **Wave 4**: `feat(tools): add crosscheck, state_snapshot, foreshadow, style_anchor tools`
- **Wave 5**: `feat(dashboard): add Express server + AI-generated dashboard + novel_dashboard tool`
- **Wave 6**: `feat(config): add .novel-weaverrc.json config file + per-agent temperature via chat.params hook`
- **Wave 3.5**: `feat(agent): add Novel Weaver Master Agent for OpenCode ecosystem integration`
- **Wave 7**: `feat(imprint): add style imprint learning from external novels (T33-T36)`
- **Wave 8**: `feat(longform): add chapter summary center, RAG retrieval, immutable fact locking (T37-T42)`
- **Wave FINAL**: `chore: final verification + cleanup`

---

## Success Criteria

### Verification Commands
```bash
# Init test
tsx src/index.ts  # Expected: no crash, logs "novel-weaver plugin loaded"

# Schema verification
sqlite3 .novel-weaver/novel-weaver.db ".tables"  # Expected: chapter_facts, character_states, outlines, aliases

# Tool registration
grep -c "novel_crosscheck\|novel_state_snapshot\|novel_foreshadow\|novel_style_anchor" src/index.ts  # Expected: 4

# Agent registration
grep "PlotWriter" src/agents/index.ts  # Expected: found

# Anti-AI layer check
grep -c "禁用词\|视角\|段落\|章尾\|AI高级\|叙事节奏" src/agents/prompts/Reviewer.ts  # Expected: >=5 layers

# Dashboard
grep "novel_dashboard" src/index.ts  # Expected: found
sqlite3 .novel-weaver/novel-weaver.db ".tables" | grep -c "chapter_facts"  # Expected: 1 (DB readable)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All Wave-FINAL reviews pass
