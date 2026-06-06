# 设定管理子系统 — 设计与实现

## TL;DR

> **Quick Summary**: 为 novel-weaver 插件新增 5 张设定管理表（势力/地点/力量体系/物品/时间线）+ 15 个 CRU 工具 + Markdown 文件模板，参考 `characters` 表模式实现结构化设定管理。
> 
> **Deliverables**:
> - 5 张新 DB 表：`factions`, `locations`, `power_systems`, `items`, `timeline_events`
> - 15 个 CRU 工具：每 entity 类型 × (create/query/update)
> - 5 个 Markdown 模板 + Obsidian 文件生成函数
> - `links` 表迁移扩展（跨世界关联）
> - `aliases` 表 CHECK 约束重建（支持新实体类型）
> - FTS4 全文索引（5 个实体全部 + 同步逻辑）
> - `consistency_check` 扩展
> - world 模板修改：力量体系/势力/地点章节改为 [[wikilink]] 引用
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Schema Migration → 各 entity 工具 → consistency 扩展 → Final Verification

---

## Context

### Original Request
用户发现插件"没有对设定的支持"——目前只有 `worlds` 表用 yaml_metadata JSON blob 存储所有设定信息，无法独立查询/修改势力、地点、力量体系、物品等关键设定。

### Interview Summary
**Key Discussions**:
- 使用独立分表模式，而非扩展 yaml_metadata 字段
- 参考 `characters` 表模式：DB 结构化字段 + YAML frontmatter .md 文件 + CRU 工具
- 无限流题材需支持跨世界关联（同一物品/力量体系出现在多个世界）
- 不提供 delete 工具，与现有 CRU 模式一致
- 不导入风格指南
- **双写处理**：world 模板从 inline 章节改为 [[wikilink]] 引用新实体（分两步：先建新表，后改模板）
- **别名系统**：所有新实体类型加入 aliases 表（需重建 CHECK 约束）
- **力量体系**：题材包 = 通用模板，power_systems 表 = 世界实例
- **FTS4**：所有 5 个实体类型全部加上
- **前端**：本次仅后端，不动 Dashboard/Web UI

**Research Findings**:
- `characters` 表有完善的结构化字段（id, name, role_type, aliases, description, voice_fingerprint, address_chain）——可复制此模式
- `character.ts` 提供了完整的 C/R/U 工具实现模式（Zod schema + DB insert/update + query + FTS4 sync + .md 文件生成）
- `links` 表已存在，扩展 `world_id` 列 + 新 `link_type` 值即可支持跨世界关联
- `.novel-weaver/content/settings/` 是现有 .md 文件目录，新 entity 文件也放此处
- 代码库无 delete 工具模式

### Metis Review
*Metis 分析已触发，Oracle 双重验证（Phase 1 + Phase 2）已替代完成全面审查。*

---

## Work Objectives

### Core Objective
为 novel-weaver 插件新增一套完整的设定管理子系统（势力/地点/力量体系/物品/时间线），使设定信息可从 DB 独立查询、通过工具管理、并以结构化 Markdown 文件呈现。

### Concrete Deliverables
- `src/db/schema.ts` — 新增 5 张表的 DDL（含 FTS4 索引）
- `src/db/migrations/004-settings-management.ts` — 新增表 + links 表扩展
- `src/tools/faction.ts` — 势力 CRU 工具
- `src/tools/location.ts` — 地点 CRU 工具
- `src/tools/power_system.ts` — 力量体系 CRU 工具
- `src/tools/item.ts` — 物品 CRU 工具
- `src/tools/timeline.ts` — 时间线 CRU 工具
- `src/md/templates/faction.ts` — 势力 markdown 模板
- `src/md/templates/location.ts` — 地点 markdown 模板
- `src/md/templates/power-system.ts` — 力量体系 markdown 模板
- `src/md/templates/item.ts` — 物品 markdown 模板
- `src/md/templates/timeline.ts` — 时间线 markdown 模板
- `src/md/obsidian.ts` — 新增 5 个文件生成函数
- `src/tools/consistency.ts` — 扩展一致性检查
- `.omo/evidence/` — QA 场景证据文件

### Definition of Done
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] 所有 CRU 工具在 MCP 和 plugin 模式下可调用
- [ ] 新增表在 `novel_init` 后自动创建（migration 执行）
- [ ] 跨世界关联通过 `links` 表正确可查
- [ ] 设定 .md 文件正确生成（frontmatter + wikilinks）

### Must Have
- 势力、地点、力量体系、物品、时间线各一张独立表
- 每 entity 至少 create/query/update 三个工具
- 每 entity 对应可读写的 .md 文件
- `links` 表扩展支持跨世界关联
- 现有 CRU 模式一致性（无 delete 工具）
- FTS4 全文搜索支持

### Must NOT Have (Guardrails)
- 不要提供 delete 工具（与现有模式一致）
- 不要导入风格指南文件
- 不要修改现有 projects/worlds/chapters 表
- 不要新增图片/附件功能
- 不要添加测试框架（遵循 AGENTS.md）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (follows AGENTS.md — no test runner configured)
- **QA method**: Agent-executed scenario verification (Bash/curl for API tools, tmux for CLI)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB/Schema**: Use Bash (sql.js via tsx) — connect to DB, verify tables exist, run SELECT queries
- **API Tools**: Use Bash (tsx) — call tool functions via MCP adapter, assert output structure
- **File Generation**: Use Bash (fs) — verify .md files exist, check frontmatter fields
- **Cross-world Linking**: Use Bash (sql.js) — insert links, SELECT with JOIN, assert results

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — Schema + Templates):
├── Task 1: Schema DDL — 5 new tables in schema.ts [quick]
├── Task 2: Schema DDL — FTS4 indexes + FK indexes [quick]
├── Task 3: Migration script 004-settings-management [quick]
├── Task 4: 5 Markdown templates (faction/location/power-system/item/timeline) [quick]
├── Task 5: obsidian.ts — 5 file generation functions [quick]
├── Task 6: links table migration — add world_id + new link_type values [quick]
└── Task 7: Tool scaffolding — 5 empty CRU files + registry registration [quick]

Wave 2 (Core CRU Tools — MAX PARALLEL):
├── Task 8: faction CRU tools (depends: 1, 4, 5, 7) [unspecified-high]
├── Task 9: location CRU tools (depends: 1, 4, 5, 7) [unspecified-high]
├── Task 10: power_system CRU tools (depends: 1, 4, 5, 7) [unspecified-high]
├── Task 11: items CRU tools (depends: 1, 4, 5, 7) [unspecified-high]
└── Task 12: timeline CRU tools (depends: 1, 4, 5, 7) [unspecified-high]

Wave 3 (Integration):
├── Task 13: Register all 15 tools in registry.ts [quick]
├── Task 14: Build + typecheck fix [deep]
├── Task 15: Consistency check extension [unspecified-high]
└── Task 16: World template — replace inline sections with wikilinks [unspecified-high]

Wave FINAL:
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Full integration QA (all tools called end-to-end)
├── Task F3: Code quality review
└── Task F4: Scope fidelity check

Critical Path: Task 1 → Task 7 → Task 8-12 → Task 13 → Task 14 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 2)
Note: Task 16 runs in parallel with Final Verification (no blocking dependency on F1-F4)
```

### Dependency Matrix

- **1-7**: None — Wave 1, start immediately
- **8**: 1, 4, 5, 7 → 13, 14
- **9**: 1, 4, 5, 7 → 13, 14
- **10**: 1, 4, 5, 7 → 13, 14
- **11**: 1, 4, 5, 7 → 13, 14
- **12**: 1, 4, 5, 7 → 13, 14
- **13**: 8-12 → 14
- **14**: 13, 6 → F1-F4
- **15**: 8-12 → F1-F4

---

## TODOs

- [ ] 1. **Schema DDL — 5 new tables in schema.ts**

  **What to do**:
  - Add 5 new `CREATE TABLE IF NOT EXISTS` statements to `CREATE_TABLES_SQL` in `src/db/schema.ts`
  - Tables: `factions`, `locations`, `power_systems`, `items`, `timeline_events`
  - Each table needs: `id TEXT PRIMARY KEY`, foreign key to `worlds(id)`, name field, type/category field, JSON text fields for flexible data
  - **factions**: id, world_id, name, faction_type TEXT (e.g. 'sect', 'clan', 'empire', 'organization'), leader TEXT (character ID ref), description TEXT, members TEXT (JSON array of character IDs), territory TEXT, status TEXT DEFAULT 'active', created_at
  - **locations**: id, world_id, name, location_type TEXT (e.g. 'city', 'dungeon', 'region', 'landmark'), parent_id TEXT (self-ref for hierarchy), description TEXT, danger_level INTEGER, features TEXT (JSON), created_at
  - **power_systems**: id, name, world_ids TEXT (JSON array of world IDs for cross-world), system_type TEXT (e.g. 'cultivation', 'magic', 'qi', 'superpower'), description TEXT, levels TEXT (JSON array of {name, description, requirements}), source TEXT, cost TEXT, created_at
  - **items**: id, name, world_ids TEXT (JSON array), item_type TEXT (e.g. 'weapon', 'artifact', 'consumable', 'treasure', 'skill_book'), rarity TEXT (e.g. 'common', 'rare', 'epic', 'legendary'), description TEXT, effects TEXT (JSON), owner_id TEXT (character ID ref), origin TEXT, created_at
  - **timeline_events**: id, world_id, name, event_type TEXT (e.g. 'war', 'disaster', 'discovery', 'founding', 'battle'), date_label TEXT (in-world date, not real date), description TEXT, participants TEXT (JSON array of character/entity IDs), consequences TEXT (JSON), order_num INTEGER (for chronology), created_at

  **Must NOT do**:
  - Do NOT modify existing table definitions
  - Do NOT remove any existing CREATE statements
  - Do NOT use FTS5 (sql.js only supports FTS4)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple DDL additions following existing schema.ts patterns
  - **Skills**: None needed
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-7)
  - **Blocks**: Tasks 8, 9, 10, 11, 12, 13
  - **Blocked By**: None

  **References**:
  - `src/db/schema.ts:49-59` — `characters` table DDL pattern (id + foreign key + name + JSON fields)
  - `src/db/schema.ts:100-106` — `links` table DDL pattern (id + source/target + type)
  - `src/db/schema.ts:140-155` — `character_states` table for JSON field pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Verify all 5 tables are created after fresh schema init
    Tool: Bash (tsx)
    Preconditions: In-memory SQLite database initialized with FULL_SCHEMA_SQL + new DDL
    Steps:
      1. Import FULL_SCHEMA_SQL from schema.ts
      2. Run all CREATE TABLE statements
      3. Query "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('factions','locations','power_systems','items','timeline_events')"
    Expected Result: 5 rows returned, one per new table
    Evidence: .omo/evidence/task-1-tables-exist.txt
  ```

  **Evidence to Capture**:
  - [ ] Table existence query output

  **Commit**: YES (groups with Tasks 2-7)
  - Message: `feat(settings): add 5 setting entity tables to schema`
  - Files: `src/db/schema.ts`
  - Pre-commit: `npm run typecheck`

- [ ] 2. **Schema DDL — FTS4 indexes + FK indexes**

  **What to do**:
  - Add 5 new FTS4 virtual table definitions to `CREATE_FTS_SQL` in `src/db/schema.ts`
  - `factions_fts` on (name, description)
  - `locations_fts` on (name, description)
  - `power_systems_fts` on (name, description)
  - `items_fts` on (name, description)
  - `timeline_events_fts` on (name, description)
  - Also update `EXPECTED_TABLES` and `CHECK_ALL_TABLES_SQL` to include new tables
  - Add FK indexes: `idx_factions_world_id`, `idx_locations_world_id`, `idx_power_systems_world_ids` (for JSON search), `idx_items_world_ids`, `idx_timeline_events_world_id`, `idx_locations_parent_id`

  **Must NOT do**:
  - Do NOT use FTS5 — sql.js only has FTS4

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple FTS4 DDL additions following existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-7)

  **References**:
  - `src/db/schema.ts:202-215` — FTS4 index pattern (worlds_fts, characters_fts, chapters_fts, arcs_fts)
  - `src/db/schema.ts:227-234` — FK index pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Verify all 5 new FTS4 virtual tables are created
    Tool: Bash (tsx)
    Steps:
      1. Run FULL_SCHEMA_SQL + new FTS4 DDL
      2. Query "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'"
    Expected Result: FTS tables present: factions_fts, locations_fts, power_systems_fts, items_fts, timeline_events_fts
    Evidence: .omo/evidence/task-2-fts-tables.txt
  ```

  **Evidence to Capture**:
  - [ ] FTS table existence query output

  **Commit**: YES (groups with 1)
  - Message: `feat(settings): add 5 setting entity tables to schema`

- [ ] 3. **Migration script 004-settings-management**

  **What to do**:
  - Create `src/db/migrations/004-settings-management.ts`
  - Follow migration pattern from `003-character-voice.ts`
  - Execute all CREATE TABLE statements for the 5 new tables (same as schema.ts but in migration context)
  - **Aliases table CHECK constraint rebuild**: SQLite cannot ALTER CHECK constraints. Strategy:
    1. Create temporary table `aliases_v2` with updated CHECK: `entity_type IN ('character','world','arc','item','faction','location','power_system','timeline_event')`
    2. Copy all existing rows: `INSERT INTO aliases_v2 SELECT * FROM aliases`
    3. Drop old table: `DROP TABLE aliases`
    4. Rename: `ALTER TABLE aliases_v2 RENAME TO aliases`
    - Use try/catch for idempotency; if aliases_v2 already exists (partial migration), skip create step
  - Execute ALTER TABLE for links table extension (world_id column) — see Task 6
  - Use try/catch for idempotency (same as existing migrations)
  - Export `version = 4`, `name = 'settings-management'`, `up(db)` function

  **Must NOT do**:
  - Do NOT add columns to existing tables (links table extension is separate Task 6)
  - Do NOT drop any tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple migration script following existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-2, 4-7)

  **References**:
  - `src/db/migrations/003-character-voice.ts:1-36` — Migration pattern (version, name, up(db), try/catch, schema_version insert)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Migration runs without errors and records version
    Tool: Bash (tsx)
    Steps:
      1. Create in-memory SQLite with v3 schema
      2. Run up(db) from 004-migration
      3. Query "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
    Expected Result: version = 4
    Evidence: .omo/evidence/task-3-migration-version.txt
  ```

  **Evidence to Capture**:
  - [ ] schema_version query output

  **Commit**: YES (groups with 1)
  - Message: `feat(settings): add 5 setting entity tables to schema`

- [ ] 4. **5 Markdown templates for setting entities**

  **What to do**:
  - Create `src/md/templates/faction.ts` — template + applyFactionTemplate()
  - Create `src/md/templates/location.ts` — template + applyLocationTemplate()
  - Create `src/md/templates/power-system.ts` — template + applyPowerSystemTemplate()
  - Create `src/md/templates/item.ts` — template + applyItemTemplate()
  - Create `src/md/templates/timeline.ts` — template + applyTimelineTemplate()
  - Each template follows the pattern of `src/md/templates/world.ts`
  - Template strings with `{{placeholders}}` for YAML frontmatter + structured body sections
  - Faction template: title, type, status, tags, created/modified frontmatter; sections: 概述, 势力详情, 首领/领导层, 成员, 领地, 关系
  - Location template: sections: 概述, 描述, 危险等级, 特色/特征, 关联地点
  - Power system template: sections: 概述, 体系详情, 等级体系, 能量来源, 代价/限制, 所属世界
  - Item template: sections: 概述, 效果/能力, 稀有度, 来历, 所属世界, 当前持有者
  - Timeline template: sections: 事件概述, 参与方, 后果/影响, 关联世界

  Update exports in `src/md/templates/index.ts` (create if not exists) or add exports to existing barrel file.

  **Must NOT do**:
  - Do NOT use emojis
  - Do NOT commit .md content to DB (only template generation functions)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward template files following world.ts pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-7)

  **References**:
  - `src/md/templates/world.ts:1-68` — Complete template pattern (template string + apply function)
  - `src/md/obsidian.ts:90-105` — How world template is consumed in generateWorldFile()

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Each template produces valid output with data substitution
    Tool: Bash (tsx)
    Steps:
      1. Import each apply*Template function
      2. Call with test data {title: "测试", description: "测试描述"}
      3. Assert output string starts with "---\ntitle:" and contains "# 测试"
    Expected Result: All 5 templates produce valid frontmatter-prefixed markdown
    Evidence: .omo/evidence/task-4-templates.txt
  ```

  **Evidence to Capture**:
  - [ ] Template output samples

  **Commit**: YES (groups with 5)
  - Message: `feat(settings): add markdown templates and obsidian file gen for settings entities`

- [ ] 5. **obsidian.ts — 5 file generation functions**

  **What to do**:
  - Add to `src/md/obsidian.ts`:
    - `FactionData` interface (title, status, tags, created, modified, description, leader, members, territory, relations, worldId)
    - `LocationData` interface (title, status, tags, parentId, description, dangerLevel, features, worldId)
    - `PowerSystemData` interface (title, status, tags, description, levels, source, cost, worldIds)
    - `ItemData` interface (title, status, tags, description, effects, rarity, origin, ownerId, worldIds)
    - `TimelineData` interface (title, status, tags, description, eventType, dateLabel, participants, consequences, orderNum, worldId)
    - 5 generate*File functions that call the corresponding template + return complete .md content
  - Export all new interfaces and functions
  - Reuse existing `generateFrontmatter`, `generateWikilink`, `today()` helpers

  **Must NOT do**:
  - Do NOT write to disk (that's the tool layer's job)
  - Do NOT duplicate template logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Interface definitions + delegation to templates, following generateWorldFile() pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6-7)

  **References**:
  - `src/md/obsidian.ts:69-105` — WorldData interface + generateWorldFile() pattern
  - `src/md/obsidian.ts:224-281` — CharacterData interface + generateCharacterFile() pattern
  - `src/md/obsidian.ts:313-319` — today() helper

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Each generate function produces correct markdown
    Tool: Bash (tsx)
    Steps:
      1. Import each generate*File function
      2. Call with rich test data including wikilinks
      3. Assert output contains correct frontmatter fields and body sections
    Expected Result: All 5 functions produce valid markdown with frontmatter
    Evidence: .omo/evidence/task-5-obsidian-functions.txt
  ```

  **Evidence to Capture**:
  - [ ] Generated markdown samples

  **Commit**: YES (groups with 4)
  - Message: `feat(settings): add markdown templates and obsidian file gen for settings entities`

- [ ] 6. **Links table migration — support cross-world settings linking**

  **What to do**:
  - Consolidated into migration 004 (Task 3) — ALTER TABLE statements live in the same migration script
  - Add `world_id` column to `links` (nullable, for filtering links by world)
    2. Document new `link_type` values that tools will use: `'faction_in'`, `'location_in'`, `'item_in'`, `'power_system_in'`, `'timeline_in'`, `'faction_relation'`, `'item_owner'`
  - Migration SQL:
    - `ALTER TABLE links ADD COLUMN world_id TEXT;`
    - `CREATE INDEX IF NOT EXISTS idx_links_world_id ON links(world_id);`
  - Add `idx_links_world_id` to `FULL_SCHEMA_SQL` in schema.ts too

  **Must NOT do**:
  - Do NOT remove existing columns or change link_type CHECK (there is none — it's TEXT)
  - Do NOT delete existing link records

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple ALTER TABLE + migration following existing patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5, 7)

  **References**:
  - `src/db/schema.ts:100-106` — Current links table DDL
  - `src/db/schema.ts:234` — FK index pattern
  - `src/db/migrations/003-character-voice.ts:20-21` — ALTER TABLE migration pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Links table has world_id column after migration
    Tool: Bash (tsx)
    Steps:
      1. Create in-memory SQLite with existing DDL
      2. Run ALTER TABLE + CREATE INDEX
      3. Query "PRAGMA table_info(links)"
    Expected Result: table_info includes world_id column
    Evidence: .omo/evidence/task-6-links-migration.txt

  Scenario: Existing link rows are unaffected (world_id is NULL)
    Tool: Bash (tsx)
    Steps:
      1. Insert a link row before migration
      2. Run ALTER TABLE
      3. SELECT the existing row
    Expected Result: Row still exists, world_id is NULL
    Evidence: .omo/evidence/task-6-links-preserved.txt
  ```

  **Evidence to Capture**:
  - [ ] PRAGMA table_info output
  - [ ] Existing data preservation proof

  **Commit**: YES (groups with 1-3)
  - Message: `feat(settings): add 5 setting entity tables to schema`

- [ ] 7. **Tool scaffolding — 5 empty CRU files + registry entry**

  **What to do**:
  - Create 5 new tool stub files that export empty tool definitions ready for Wave 2 implementation:
    - `src/tools/faction.ts` — export `novel_faction_create`, `novel_faction_query`, `novel_faction_update`
    - `src/tools/location.ts` — export `novel_location_create`, `novel_location_query`, `novel_location_update`
    - `src/tools/power_system.ts` — export `novel_power_system_create`, `novel_power_system_query`, `novel_power_system_update`
    - `src/tools/item.ts` — export `novel_item_create`, `novel_item_query`, `novel_item_update`
    - `src/tools/timeline.ts` — export `novel_timeline_create`, `novel_timeline_query`, `novel_timeline_update`
  - Each stub should:
    - Import `tool`, `z` from `@opencode-ai/plugin/tool`
    - Have a basic description
    - Have empty args object `{}`
    - Have `async execute()` returning `{ output: "not implemented" }` (placeholder)
    - Follow the export pattern from character.ts
  - Register all 15 stubs in `src/tools/registry.ts`:
    - Add imports for each new tool
    - Add to `TOOL_DEFINITIONS` array
    - Add to `TOOL_DEFINITION_NAME_MAP` candidates
  - Register stubs temporarily so they don't break the build

  **Must NOT do**:
  - Do NOT implement logic yet — this is pure scaffolding
  - Do NOT break existing tools

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical code creation following established patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-6)

  **References**:
  - `src/tools/character.ts:252-376` — novel_character_create full implementation (pattern to follow)
  - `src/tools/character.ts:537-664` — novel_character_query full implementation (pattern to follow)
  - `src/tools/registry.ts:18-39` — Import pattern for new tools
  - `src/tools/registry.ts:66-134` — TOOL_DEFINITIONS registration pattern
  - `src/tools/registry.ts:191-235` — TOOL_DEFINITION_NAME_MAP pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: All 15 stubs are registered and build passes
    Tool: Bash (npm run typecheck)
    Preconditions: All stub files created, registry updated
    Steps:
      1. Run "npm run typecheck"
    Expected Result: No TypeScript errors
    Evidence: .omo/evidence/task-7-typecheck.txt

  Scenario: Stub tools can be called without error
    Tool: Bash (tsx)
    Steps:
      1. Import novel_faction_create from registry
      2. Execute with empty args
    Expected Result: Returns output containing "not implemented" (stub behavior OK)
    Evidence: .omo/evidence/task-7-stubs.txt
  ```

  **Evidence to Capture**:
  - [ ] Typecheck output
  - [ ] Stub execution output

  **Commit**: YES (groups with Tasks 1-6)
  - Message: `feat(settings): add schema, migrations, templates, and tool scaffolding`

- [ ] 8. **Faction CRU tools — full implementation**

  **What to do**:
  - Implement `novel_faction_create` in `src/tools/faction.ts`:
    - Args: world_id (string, required), name (string, required), faction_type (enum: sect/clan/empire/organization, default 'organization'), leader (string, optional, character ID), description (string, optional), members (array of strings, optional, character IDs), territory (string, optional), status (enum: active/inactive/defunct, default 'active')
    - Logic: validate world exists → generateId() → INSERT INTO factions → sync FTS → write .md file
    - .md file path: `.novel-weaver/content/settings/faction-{slugified-name}.md`
    - .md content: call generateFactionFile() from obsidian.ts
    - Return: id, name, file_path, metadata
  - Implement `novel_faction_query`:
    - Args: name (string, optional, substring search), world_id (string, optional), faction_type (string, optional)
    - Logic: build dynamic WHERE clause → SELECT with LEFT JOIN worlds → LIKE search on name + aliases/description → FTS4 MATCH fallback
    - Return: formatted list matching character_query output style
  - Implement `novel_faction_update`:
    - Args: id (required), other fields optional partial update
    - Logic: fetch existing → merge fields → UPDATE → sync FTS → rewrite .md file (delete old if name changed)
  
  **Helper functions needed** (in same file):
  - `factionFilePath(name)`: resolves .md file path
  - `writeFactionMdFile(id, name, ...)`: generates and writes .md
  - `syncFactionFts(rowId, name, description)`: syncs FTS4 index
  - `slugify(name)`: converts name to filename-friendly string (handle Chinese characters via transliteration or use UUID-like slug)

  **Must NOT do**:
  - Do NOT implement delete tool
  - Do NOT modify existing character.ts functions
  - Do NOT add voice_fingerprint / address_chain complexity (not needed for factions)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full CRU implementation following character.ts pattern — moderate complexity
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 10, 11, 12)
  - **Blocks**: Tasks 13, 14, 15
  - **Blocked By**: Tasks 1, 4, 5, 7

  **References**:
  - `src/tools/character.ts:252-376` — novel_character_create full pattern (Zod, DB, FTS, .md)
  - `src/tools/character.ts:537-664` — novel_character_query full pattern (dynamic WHERE, FTS4 fallback)
  - `src/tools/character.ts:382-531` — novel_character_update full pattern (fetch+merge+rewrite)
  - `src/tools/character.ts:44-55` — parseAliases() helper pattern
  - `src/db/schema.ts:38-46` — worlds table (for world existence check)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Create a faction and verify DB + .md file
    Tool: Bash (tsx)
    Preconditions: A world exists in the database
    Steps:
      1. Call novel_faction_create with world_id, name="玄天宗", faction_type="sect", description="修仙界第一宗门"
      2. Read faction file from .novel-weaver/content/settings/faction-玄天宗.md
    Expected Result: 
      - DB has row in factions table with correct fields
      - .md file exists with frontmatter (title: 玄天宗) and body sections
      - Output returns id and file_path
    Evidence: .omo/evidence/task-8-faction-create.txt

  Scenario: Query factions by name substring
    Tool: Bash (tsx)
    Preconditions: 2+ factions exist (玄天宗, 天魔教)
    Steps:
      1. Call novel_faction_query with name="天"
    Expected Result: Returns both factions (name contains "天")
    Evidence: .omo/evidence/task-8-faction-query.txt

  Scenario: Update faction, verify file rename on name change
    Tool: Bash (tsx)
    Preconditions: Faction "旧名" exists
    Steps:
      1. Call novel_faction_update with id and name="新名"
    Expected Result: 
      - DB row updated with new name
      - Old .md file deleted, new .md file created
      - changed_fields includes "name"
    Evidence: .omo/evidence/task-8-faction-update.txt

  Scenario: Error on non-existent world_id
    Tool: Bash (tsx)
    Steps:
      1. Call novel_faction_create with non-existent world_id
    Expected Result: Error message citing world not found
    Evidence: .omo/evidence/task-8-faction-error.txt
  ```

  **Evidence to Capture**:
  - [ ] Create output showing id and file_path
  - [ ] Query results
  - [ ] Update verification

  **Commit**: YES (groups with Task 9)
  - Message: `feat(settings): add faction and location CRU tools`
  - Files: `src/tools/faction.ts`, `src/tools/location.ts`

- [ ] 9. **Location CRU tools — full implementation**

  **What to do**:
  - Implement `novel_location_create` in `src/tools/location.ts`:
    - Args: world_id (required), name (required), location_type (enum: city/dungeon/region/landmark/other, default 'other'), parent_id (optional, self-ref to parent location), description (optional), danger_level (optional, integer 0-10), features (optional, array of strings)
    - Logic: same pattern as faction: validate → INSERT → FTS sync → .md
    - .md file: `.novel-weaver/content/settings/location-{slugified-name}.md`
  - Implement `novel_location_query`:
    - Args: name, world_id, location_type, parent_id (optional, filter by parent)
    - Pattern: dynamic WHERE + JOIN worlds + FTS4 fallback
  - Implement `novel_location_update`:
    - Args: id (required), other fields optional
    - Pattern: fetch → merge → UPDATE → FTS sync → .md rewrite
  
  **Helper functions**: locationFilePath(), writeLocationMdFile(), syncLocationFts()

  **Must NOT do**:
  - Do NOT implement hierarchical query (parent->children traversal) — that's future
  - Do NOT implement geospatial features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full CRU implementation — same pattern as task 8 but different entity

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10, 11, 12)

  **References**:
  - Same as Task 8
  - `src/tools/character.ts` — query/create/update patterns

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Create location with parent hierarchy
    Tool: Bash (tsx)
    Preconditions: A world exists
    Steps:
      1. Create location "灵脉矿" (location_type="landmark")
      2. Create location "禁地深渊" with parent_id = first location's id
    Expected Result: Both created, child has parent_id set
    Evidence: .omo/evidence/task-9-location-create.txt

  Scenario: Query locations filtered by type
    Tool: Bash (tsx)
    Steps:
      1. Call novel_location_query with location_type="city"
    Expected Result: Only city-type locations returned
    Evidence: .omo/evidence/task-9-location-filter.txt
  ```

  **Evidence to Capture**:
  - [ ] Location creation output
  - [ ] Filtered query results

  **Commit**: YES (groups with Task 8)
  - Message: `feat(settings): add faction and location CRU tools`
  - Files: `src/tools/location.ts`

- [ ] 10. **Power System CRU tools — full implementation**

  **What to do**:
  - Implement `novel_power_system_create` in `src/tools/power_system.ts`:
    - Args: name (required), world_ids (array of strings, required for cross-world linking — at least one world), system_type (enum: cultivation/magic/qi/superpower/other, default 'other'), description (optional), levels (optional, array of {name: string, description: string, requirements?: string}), source (optional, string), cost (optional, string)
    - Logic: validate at least one world exists → INSERT → FTS sync → .md
    - Multiple worlds JSON in world_ids TEXT field
    - .md file: `.novel-weaver/content/settings/power-system-{slugified-name}.md`
  - Implement `novel_power_system_query`:
    - Args: name, system_type, world_id (filter systems that include this world)
    - Query: JSON_CONTAINS-like via LIKE "%world_id%" for world_ids field
    - FTS4 fallback
  - Implement `novel_power_system_update`:
    - Standard update pattern

  **Cross-world note**: world_ids is a JSON array. Query uses LIKE "%id%" pattern (no JSON_CONTAINS in sql.js). Accept for now.

  **Must NOT do**:
  - Do NOT add level editing tools (levels edited via JSON wholesale update only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full CRU with cross-world JSON handling

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 11, 12)

  **References**:
  - Same CRU pattern as Tasks 8-9
  - `src/db/schema.ts:55` — aliases JSON array storage pattern (for world_ids)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Create power system linked to multiple worlds
    Tool: Bash (tsx)
    Preconditions: 2+ worlds exist
    Steps:
      1. Create power system "修仙体系" with world_ids=["world-1", "world-2"], system_type="cultivation"
      2. Add levels: [{"name":"练气","description":"入门"},{"name":"筑基","description":"基础"}]
    Expected Result: 
      - DB row created with JSON world_ids array
      - .md file lists both worlds as wikilinks
      - Return includes id and file_path
    Evidence: .omo/evidence/task-10-power-system-create.txt

  Scenario: Query power systems by world
    Tool: Bash (tsx)
    Steps:
      1. Call novel_power_system_query with world_id="world-1"
    Expected Result: Returns all systems whose world_ids contain world-1
    Evidence: .omo/evidence/task-10-power-system-query.txt
  ```

  **Evidence to Capture**:
  - [ ] Power system creation with multi-world
  - [ ] World-filtered query

  **Commit**: YES (groups with 11, 12)
  - Message: `feat(settings): add power_system, item, and timeline CRU tools`

- [ ] 11. **Item CRU tools — full implementation**

  **What to do**:
  - Implement `novel_item_create` in `src/tools/item.ts`:
    - Args: name (required), world_ids (array, required — at least one world), item_type (enum: weapon/artifact/consumable/treasure/skill_book/other, default 'other'), rarity (enum: common/uncommon/rare/epic/legendary/mythic, default 'common'), description (optional), effects (optional, array of {name: string, description: string}), owner_id (optional, character ID), origin (optional, string)
    - Logic: validate world(s) exist → validate owner exists if provided → INSERT → FTS sync → .md
    - .md file: `.novel-weaver/content/settings/item-{slugified-name}.md`
  - Implement `novel_item_query`:
    - Args: name, item_type, rarity, world_id, owner_id
    - Standard dynamic WHERE
  - Implement `novel_item_update`:
    - Standard CRU update

  **Cross-world note**: Same world_ids JSON pattern as power_systems

  **Must NOT do**:
  - Do NOT implement inventory management (character_states table already tracks character items)
  - Do NOT implement item crafting/combining

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full CRU with JSON fields + owner validation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 10, 12)

  **References**:
  - `src/db/schema.ts:140-155` — character_states items field pattern (JSON array)
  - Same CRU pattern as Tasks 8-10

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Create item with owner reference
    Tool: Bash (tsx)
    Preconditions: A world and a character in that world exist
    Steps:
      1. Create item "乾坤戒" with item_type="artifact", rarity="legendary", owner_id=character_id
      2. Include effects: [{"name":"储物","description":"内含一立方米空间"}]
    Expected Result: Item created, .md file includes owner wikilink
    Evidence: .omo/evidence/task-11-item-create.txt

  Scenario: Query items by rarity
    Tool: Bash (tsx)
    Steps:
      1. Call novel_item_query with rarity="legendary"
    Expected Result: Only legendary items returned
    Evidence: .omo/evidence/task-11-item-query.txt

  Scenario: Error on invalid owner_id
    Tool: Bash (tsx)
    Steps:
      1. Create item with non-existent owner_id
    Expected Result: Error message about owner not found
    Evidence: .omo/evidence/task-11-item-owner-error.txt
  ```

  **Evidence to Capture**:
  - [ ] Item creation with owner
  - [ ] Rarity-filtered query
  - [ ] Invalid owner error

  **Commit**: YES (groups with 10, 12)
  - Message: `feat(settings): add power_system, item, and timeline CRU tools`

- [ ] 12. **Timeline CRU tools — full implementation**

  **What to do**:
  - Implement `novel_timeline_create` in `src/tools/timeline.ts`:
    - Args: world_id (required), name (required), event_type (enum: war/disaster/discovery/founding/battle/other, default 'other'), date_label (optional, string — in-world date like "太古纪元" or "三千年前"), description (optional), participants (optional, array of strings — entity IDs), consequences (optional, array of strings), order_num (optional, integer for chronology sort)
    - Logic: validate world → generateId → INSERT → .md file
    - NO FTS needed (timeline is more structured, less searched)
    - .md file: `.novel-weaver/content/settings/timeline-{slugified-name}.md`
  - Implement `novel_timeline_query`:
    - Args: name, world_id, event_type, date_label
    - ORDER BY order_num ASC for chronological display
    - No FTS4 fallback (simple LIKE search on name/description)
  - Implement `novel_timeline_update`:
    - Standard CRU update

  **Must NOT do**:
  - Do NOT implement auto-chronology (in-world date parsing is future work)
  - Do NOT implement timeline visualization (that's frontend/dashboard)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full CRU — simpler than other entities (no FTS, no cross-world)

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 10, 11)

  **References**:
  - Same CRU pattern as Tasks 8-11 (simplified, no FTS sync)
  - `src/tools/character.ts` — standard query pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Create timeline events and query chronologically
    Tool: Bash (tsx)
    Preconditions: A world exists
    Steps:
      1. Create event "天地初开" with order_num=1
      2. Create event "人族崛起" with order_num=2
      3. Create event "万族争霸" with order_num=3
      4. Call novel_timeline_query with world_id
    Expected Result: Events returned in order_num order (1, 2, 3)
    Evidence: .omo/evidence/task-12-timeline-create.txt

  Scenario: Filter timeline events by type
    Tool: Bash (tsx)
    Steps:
      1. Call novel_timeline_query with event_type="war"
    Expected Result: Only war-type events returned
    Evidence: .omo/evidence/task-12-timeline-filter.txt
  ```

  **Evidence to Capture**:
  - [ ] Chronologically sorted query
  - [ ] Type-filtered query

  **Commit**: YES (groups with 10, 11)
  - Message: `feat(settings): add power_system, item, and timeline CRU tools`

- [ ] 13. **Register all 15 tools in registry.ts**

  **What to do**:
  - Update `src/tools/registry.ts` to replace stub imports with actual implementations
  - Verify all 15 new tool names are in `TOOL_DEFINITIONS` and `TOOL_DEFINITION_NAME_MAP`
  - Ensure import paths are correct for all 5 new tool files
  - Run `npm run typecheck` and fix any type errors
  - Ensure `deriveToolName()` works for all new tools

  **What NOT to do**:
  - Do not change existing tool registrations
  - Do not reorder the TOOL_DEFINITIONS array

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical registry updates + typecheck

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential within wave)
  - **Blocks**: Task 14 (build fix)
  - **Blocked By**: Tasks 8, 9, 10, 11, 12

  **References**:
  - `src/tools/registry.ts:18-39` — Import block pattern
  - `src/tools/registry.ts:66-134` — TOOL_DEFINITIONS array
  - `src/tools/registry.ts:191-235` — TOOL_DEFINITION_NAME_MAP

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: All tools registered and name map populated
    Tool: Bash (npm run typecheck)
    Preconditions: All 5 tool files fully implemented
    Steps:
      1. Run "npm run typecheck"
    Expected Result: No errors, all imports resolve
    Evidence: .omo/evidence/task-13-typecheck.txt

  Scenario: Tool names are derivable
    Tool: Bash (tsx)
    Steps:
      1. Import deriveToolName from registry
      2. Test with one tool from each new file
    Expected Result: Names returned (e.g. "novel_faction_create")
    Evidence: .omo/evidence/task-13-names.txt
  ```

  **Evidence to Capture**:
  - [ ] Typecheck output
  - [ ] Tool name derivation output

  **Commit**: YES (groups with 14, 15)
  - Message: `feat(settings): register tools, fix typecheck, extend consistency check`

- [ ] 14. **Build + typecheck fix round**

  **What to do**:
  - Run `npm run typecheck` and fix ALL TypeScript errors across all changed files
  - Run `npm run build` and fix any build errors
  - Common issues to watch for:
    - Missing `z` imports (make sure all tool files import from `@opencode-ai/plugin/tool`)
    - Incorrect return types (all tools return `{output: string, metadata?: object}`)
    - Missing `z.enum()` values that don't match DB CHECK constraints
    - Circular dependencies between template files and obsidian.ts
    - Path resolution issues in slugify functions
    - `any` type assertions needed for sql.js results

  **Must NOT do**:
  - Do NOT disable type checking with `@ts-ignore` or `as any` (except where sql.js row access requires it)
  - Do NOT change existing working files beyond fixing import/type issues

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Systematic error fixing — needs careful type-level reasoning

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs all tools registered first)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Task 13

  **References**:
  - `src/tools/character.ts` — Reference for correct return types and Zod patterns
  - `src/tools/world.ts` — Reference for correct import patterns

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: TypeScript typecheck passes
    Tool: Bash (npm run typecheck)
    Steps:
      1. Run "npx tsc --noEmit"
    Expected Result: Exit code 0, no errors
    Evidence: .omo/evidence/task-14-typecheck.txt

  Scenario: Build succeeds
    Tool: Bash (npm run build)
    Steps:
      1. Run "npm run build"
    Expected Result: Exit code 0, dist/ directory contains .js and .d.ts files
    Evidence: .omo/evidence/task-14-build.txt
  ```

  **Evidence to Capture**:
  - [ ] Typecheck output (zero errors)
  - [ ] Build output (dist/ created)

  **Commit**: YES (groups with 13, 15)
  - Message: `feat(settings): register tools, fix typecheck, extend consistency check`

- [ ] 15. **Consistency check extension**

  **What to do**:
  - Extend `novel_consistency_check` in `src/tools/consistency.ts` to cover new entity types
  - Add 2 new consistency dimensions:
    1. **Settings Cross-Reference Check**: Verify that entity references are valid
       - Faction `leader` references a valid character
       - Faction `members` all reference valid characters
       - Item `owner_id` references a valid character
       - Timeline `participants` reference valid characters/entities
    2. **Cross-World Consistency**: Detect settings that reference non-existent worlds
       - Power system `world_ids` all reference valid worlds
       - Item `world_ids` all reference valid worlds
  - Reuse the existing consistency scoring/reporting format
  - Output format: BLOCKER/WARNING/INFO level issues with file:line citations
  - Generate report file: `.novel-weaver/content/reports/consistency-{date}.md`

  **Must NOT do**:
  - Do NOT modify the existing 5 consistency dimensions
  - Do NOT add cross-chapter checks (that's novel_crosscheck's domain)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extending existing complex tool with new dimensions

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs all tools' tables populated)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 8, 9, 10, 11, 12

  **References**:
  - `src/tools/consistency.ts` — Existing consistency check implementation (5 dimensions)
  - `src/db/schema.ts:38-46` — worlds table (for world existence validation)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Consistency check detects invalid faction leader
    Tool: Bash (tsx)
    Preconditions: A faction exists with leader pointing to non-existent character ID
    Steps:
      1. Call novel_consistency_check
    Expected Result: Issue reported: BLOCKER or WARNING about invalid faction leader reference
    Evidence: .omo/evidence/task-15-consistency.txt

  Scenario: Consistency check detects invalid world reference in power system
    Tool: Bash (tsx)
    Preconditions: A power system exists with world_ids containing non-existent world ID
    Steps:
      1. Call novel_consistency_check
    Expected Result: Issue reported about invalid world reference
    Evidence: .omo/evidence/task-15-consistency-world.txt

  Scenario: Consistency check passes with valid data
    Tool: Bash (tsx)
    Preconditions: All entity references are valid
    Steps:
      1. Call novel_consistency_check
    Expected Result: No issues reported for new dimensions (or only existing issues)
    Evidence: .omo/evidence/task-15-consistency-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] Consistency report showing detected issues
  - [ ] Clean run with valid data

  **Commit**: YES (groups with 13, 14)
  - Message: `feat(settings): register tools, fix typecheck, extend consistency check`

- [ ] 16. **World template update — replace inline sections with wikilinks**

  **What to do**:
  - This task runs **after** all 5 entity CRU tools are implemented and Functional Verification (F1) passes
  - Modify `src/md/templates/world.ts` WORLD_TEMPLATE:
    - Replace `## 力量体系` section: instead of inline `{{power_system}}`, insert a section that lists [[power_system_name]] wikilinks generated from the new power_systems table
    - Replace `## 势力` section: insert [[faction_name]] wikilinks from factions table
    - Replace `## 地点` section: insert [[location_name]] wikilinks from locations table
    - Keep `## 历史` section (timeline events are less suited as static wikilinks)
    - Keep `## 角色` section (already uses character wikilinks)
    - Keep `## 篇章` section (already uses arc wikilinks)
  - The replaced sections should show: "本世界有 X 个势力/力量体系/地点，详见以下设定文件："
  - Query the DB at template generation time to get entity names for the current world
  - Update `generateWorldFile()` in `src/md/obsidian.ts` to query DB and inject wikilinks
  - Update `novel_world_create` tool to no longer accept `power_system`, `factions`, `locations` as inline text args (they'll be managed through the new tools)

  **Must NOT do**:
  - Do NOT break existing world files — only the template for NEW world creation changes
  - Do NOT modify `history` section — timeline events stay inline or future work
  - Do NOT auto-backfill existing worlds' data into new tables (that's a separate migration tool)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Template refactor + DB query integration + tool arg changes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential with 13-15)
  - **Blocks**: Nothing (runs in parallel with Final Verification)
  - **Blocked By**: Tasks 8, 9, 10, 11 (entity tables must be populated)

  **References**:
  - `src/md/templates/world.ts:19-57` — Current WORLD_TEMPLATE with inline sections
  - `src/md/obsidian.ts:69-105` — generateWorldFile() with inline parameter passing
  - `src/tools/world.ts` — novel_world_create tool (current args structure)
  - `src/tools/character.ts:222-246` — getWorldName() pattern for DB queries

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: New world file references entities instead of inline text
    Tool: Bash (tsx)
    Preconditions: A world exists, and it has factions/locations/power_systems created via new tools
    Steps:
      1. Create a new world via novel_world_create
      2. Read the generated .md file
    Expected Result: 
      - `## 势力` contains [[faction-name]] wikilinks, not plain text
      - `## 地点` contains [[location-name]] wikilinks
      - `## 力量体系` contains [[power-system-name]] wikilinks
      - File still has valid YAML frontmatter
    Evidence: .omo/evidence/task-16-world-template.txt

  Scenario: Existing world files are unchanged
    Tool: Bash (tsx)
    Preconditions: An existing world file was created before this change
    Steps:
      1. Read an existing world .md file that hasn't been regenerated
    Expected Result: Its content is identical to before (no data migration applied)
    Evidence: .omo/evidence/task-16-existing-preserved.txt
  ```

  **Evidence to Capture**:
  - [ ] New world file content showing wikilinks
  - [ ] Existing world file unchanged

  **Commit**: YES (separate commit)
  - Message: `refactor(settings): update world template to use wikilinks for setting entities`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run query, call tool). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.omo/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Full Integration QA** — `unspecified-high`
  Execute end-to-end scenario:
  1. Create a world → Create a faction in that world → Create a character as leader
  2. Create a location in that world → Create a power system (linked to world)
  3. Create an item (with owner = the character) → Create timeline events
  4. Search: query faction by name, query items by rarity
  5. Update: rename faction → verify .md file was renamed
  6. Run consistency check → verify no false positives
  7. Cross-world: link power system to a second world → verify
  Save all evidence to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F3. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `npm run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1** (Tasks 1-7): `feat(settings): add schema, migrations, templates, and tool scaffolding`
- **Wave 2** (Tasks 8-12): Split into 2 commits:
  - `feat(settings): add faction and location CRU tools`
  - `feat(settings): add power_system, item, and timeline CRU tools`
- **Wave 3** (Tasks 13-15): `feat(settings): register tools, fix typecheck, extend consistency check`
- **Wave 3** (Task 16): `refactor(settings): update world template to use wikilinks for setting entities` (separate commit)
- **Final** (Tasks F1-F4): No commit — verification only

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: No errors
npm run build       # Expected: dist/ directory with .js + .d.ts
```

### Final Checklist
- [ ] All 5 new DB tables exist after migration
- [ ] All 15 CRU tools respond correctly
- [ ] All 5 template sets produce valid .md files
- [ ] Links table supports `faction_in`, `item_in`, `power_system_in` types
- [ ] FTS4 indexes searchable
- [ ] Consistency check covers new entity types
