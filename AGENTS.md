# AGENTS.md — novel-weaver

High-signal guidance for AI agents working on this repository. Designed to answer one question: **"Would an agent miss this without help?"**

## Essential Commands

| Command | What it does | Notes |
|---|---|---|
| `npm run build` | tsup → esm + cjs + .d.ts | Output: `dist/` |
| `npm run typecheck` | `tsc --noEmit` | Runs type-check on src/ |
| `npm run prepublishOnly` | `npm run build` | No test/prepublish lint |
| `tsx src/index.ts` | Execute entry point | ESM loader, no build needed for dev runs |

There is **no test runner configured** (no jest/vitest/mocha in devDependencies). Do not add test files or assume a test framework exists.

## Package & Runtime

- `@opencode-ai/plugin` is an **optional peer dep** — needed only for `PluginModule` types. Install it explicitly for typecheck: `npm install @opencode-ai/plugin`.
- **Node >= 18** required. TypeScript 5.5+, target ES2022.
- Runtime deps: `sql.js ^1.10` (WASM SQLite), `uuid ^10`.
- Dev deps: `tsup ^8`, `tsx ^4.22`, `typescript ^5.5`, `@types/node ^20`.

## Database (sql.js)

**The single most important thing to know**: sql.js is **synchronous WASM SQLite**. Queries are sync — only `initSqlJs()` (WASM bootstrap) is async. After that, all `db.run()`, `db.exec()`, `db.prepare()` are synchronous.

- **FTS4, not FTS5** — sql.js WASM builds lack FTS5. All full-text search uses `CREATE VIRTUAL TABLE ... USING fts4(...)`.
- DB init sequence: `initSqlJs()` → `new SQL.Database(data)` → create tables from DDL in `src/db/schema.ts` → write `.novel-weaver/novel-weaver.db` via `db.export()`.
- **Every tool that touches the DB must call `getDatabase()` first**. If it returns null/undefined, the tool returns a Chinese error ("请先初始化小说项目，使用 novel_init 工具"). No tool works before `novel_init` is called.
- Database is a singleton stored in module scope in `src/db/index.ts`.
- `sqljs.d.ts` exists at `src/db/sqljs.d.ts` because sql.js does not ship its own type declarations.
- Persistence pattern: `db.export()` → `fs.writeFileSync(dbPath, Buffer.from(db.export()))`.

### Schema (13 tables + 3 FTS4 indexes + version 2)

Tables: `projects`, `worlds`, `characters`, `dungeons`, `chapters`, `reviews`, `links`, `progress`, `schema_version`, `chapter_facts`, `character_states`, `outlines`, `aliases`. Full DDL in `src/db/schema.ts`.

**FTS4 virtual tables**: `chapters_fts`, `worlds_fts`, `characters_fts`.

**New tables (v2)**:
- `chapter_facts` — structured fact extraction for long-form consistency (9 fact types)
- `character_states` — per-chapter character state snapshots with tags/power/items/relationships
- `outlines` — multi-level outline hierarchy (master/volume/chapter/blueprint)
- `aliases` — entity alias resolution for character/world/dungeon/item name matching

**FK indexes**: `idx_chapter_facts_chapter_id`, `idx_character_states_character_id`, `idx_character_states_chapter_id`, `idx_outlines_dungeon_id`, `idx_aliases_entity_id`, `idx_aliases_alias`

## Tool System

**23 tools** registered in the `tool()` hook in `src/index.ts`. File locations:

| Tool | File | Purpose |
|---|---|---|
| novel_ping | `src/tools/ping.ts` | Health check |
| novel_init | `src/tools/init.ts` | MUST be first — creates `.novel-weaver/` + DB |
| novel_world_create | `src/tools/world.ts` | Create world/setting |
| novel_world_query | `src/tools/world.ts` | Search worlds |
| novel_world_link | `src/tools/world.ts` | Link entities |
| novel_dungeon_generate | `src/tools/dungeon.ts` | Generate dungeon (5 themes) |
| novel_dungeon_customize | `src/tools/dungeon.ts` | Modify dungeon |
| novel_character_create | `src/tools/character.ts` | Create character |
| novel_character_query | `src/tools/character.ts` | Search characters |
| novel_character_update | `src/tools/character.ts` | Update character |
| novel_write_chapter | `src/tools/write.ts` | Write chapter |
| novel_write_continue | `src/tools/write.ts` | Auto-continue next chapter |
| novel_write_edit | `src/tools/write.ts` | Edit existing chapter |
| novel_review_chapter | `src/tools/review.ts` | 8-dimension quality review |
| novel_review_fix | `src/tools/review.ts` | Auto-fix blocker issues |
| novel_progress_track | `src/tools/progress.ts` | View/update progress |
| novel_progress_summary | `src/tools/progress.ts` | Progress report |
| novel_stats | `src/tools/stats.ts` | Writing statistics |
| novel_query | `src/tools/query.ts` | Smart search across entities |
| novel_consistency_check | `src/tools/consistency.ts` | 5-dimension consistency |
| novel_consistency_rules | `src/tools/consistency.ts` | Manage custom rules |
| novel_pipeline_start | `src/pipeline/index.ts` | Start/resume pipeline |
| novel_pipeline_status | `src/pipeline/index.ts` | Pipeline state |

**Pattern**: Each tool file exports a function that takes `(input, context)` and returns `{ content: [...] }` or `{ isError: true, content: [...] }`. The `context.directory` gives the project root — all `.novel-weaver/` paths are resolved relative to it.

**There is no `--force` option on novel_init**. If `.novel-weaver/` exists, it refuses and tells the user to delete it manually.

## Sub-Agent Prompts

4 agents registered in `src/agents/index.ts`, prompts in `src/agents/prompts/`. All have **Chinese-language** system prompts because they are designed as Chinese web novel domain experts:

1. **World Builder** — Setting generation (世界观构建师), system prompt: `world-builder-prompt.md`
2. **Dungeon Master** — Dungeon instance generation (副本主神), system prompt: `dungeon-master-prompt.md`
3. **Reviewer** — Chapter quality assessment (网文审查员), system prompt: `reviewer-prompt.md`
4. **Plot Planner** — Plot planning (网文大纲规划师), system prompt: `plot-planner-prompt.md`

## Pipeline

Strict 4-phase orchestration in `src/pipeline/index.ts`:

```
setting → planning → writing → reviewing
```

Phases defined in `PHASES` array (index in array = phase order). Pipeline state tracked in `projects` table (`pipeline_phase` column). Phase values: `"setting"`, `"planning"`, `"writing"`, `"reviewing"`, `"completed"`. `novel_pipeline_start` can skip phases or resume from last interrupted phase.

## Dungeon Templates

5 theme presets in `src/tools/dungeon-templates.ts`:

| Theme | Key | Difficulty safety |
|---|---|---|
| Horror | `terror` | Clamps to 1-10 |
| Sci-Fi | `sci-fi` | Clamps to 1-10 |
| Xianxia | `xianxia` | Clamps to 1-10 |
| Urban | `urban` | Clamps to 1-10 |
| Post-Apocalyptic | `末世` (apocalypse) | Clamps to 1-10 |

Difficulty input is clamped to `Math.max(1, Math.min(10, difficulty))`.

## Writing Constraints (from write.ts)

- **Forbidden words**: List in `src/tools/write.ts` `FORBIDDEN_WORDS` — terms auto-rejected
- **Paragraph limit**: 500 chars per paragraph (split if exceeded)
- **Sentence limit**: ...check write.ts for exact value
- Chapters generate Markdown with frontmatter and [[wikilinks]]
- Chapter files named `ch{num}-{slugified-title}.md` in `.novel-weaver/content/chapters/vol-{vol}/`

## File Conventions

- **Encoding**: All Markdown output is UTF-8. Obsidian wikilinks use `[[wikilink]]` syntax.
- **Frontmatter**: YAML frontmatter with title/type/status/tags/created/modified and entity-specific fields.
- **Naming**:
  - Worlds: `world-{name}.md` (name slugified: lowercase, hyphens, stripped special chars)
  - Characters: `char-{name}.md`
  - Dungeons: `dungeon-{name}.md`
  - Chapters: `ch{num}-{title}.md`
- **Directory**: `.novel-weaver/content/` with subdirs `settings/`, `dungeons/`, `chapters/`, `reports/`

## Existing Instruction Files

- `.opencode/` — OpenCode-specific configs (package.json, memory/project.md)
- `.omo/netpads/novel-weaver-plugin/learnings.md` — Implementation decisions and gotchas
- `.omo/netpads/novel-weaver-plugin/issues.md` — Boundary scenario audit results
- **No `.cursorrules`, no `.github/copilot-instructions.md`, no root-level `.opencode/instructions`**

## Type Declarations

sql.js does not ship `.d.ts` files. All sql.js types are manually declared in `src/db/sqljs.d.ts`:
- `Database` interface: `run()`, `exec()`, `prepare()`, `export()`, `close()`
- `Statement` interface: `step()`, `getAsObject()`, `get()`, `bind()`, `reset()`, `free()`
- `SqlJsStatic` interface: `Database` constructor
- `initSqlJs()` factory function

## Genre Templates (Wave 1)

5 genre template JSON files in `src/modules/chapter/genre-templates/`: `xianxia.json`, `sci-fi.json`, `urban.json`, `horror.json`, `apocalypse.json`. Each defines `styleGuidelines`, `styleRules`, `forbiddenPatterns`, `recommendedPatterns`, and `specialRules` in Chinese.

Loading: `loadGenreTemplate(genre)` in `src/modules/chapter/genre-utils.ts` resolves via `src/modules/chapter/constants.ts` (aliases, fallback chain).

## Style Anchor (Wave 1)

`src/modules/style-anchor/tool.ts` provides `extractStyleAnchors(projectRoot)` — reads 3-5 recent chapters, extracts sentence/paragraph length distributions, dialogue ratio, top 50 bigrams, and punctuation frequency. Saves to `.novel-weaver/style-anchors/anchor-profile.json`. Supports manual override via `manual-anchor.md` YAML frontmatter.

## Anti-AI Expression Rules (Wave 1)

`src/modules/review/anti-ai-expressions.json` contains 60+ Chinese web novel AI-slop patterns across 7 layers (adverb_overuse, emotion_tagging, dialog_formality, structure_closure, transition_formula, summary_tendency, info_exposition). `src/modules/review/anti-ai-rules.ts` provides `loadAntiAiRules()`, `applyAntiAiFix(text)`, `detectAntiAiPatterns(text)`, and `getRulesByLayer(...)`.

## Config System (.novel-weaverrc.json)

Optional project-level config at `{projectRoot}/.novel-weaverrc.json`. Loaded by `loadRcConfig()` in `src/tools/init.ts`. Supports: `genre`, `author`, `temperature[agent]`, `antiAi.{enabled, layers}`, `dashboard.{port, host}`.

**Temperature**: `chat.params` hook in `src/index.ts` reads rc config and falls back to defaults in `src/config.ts` (`DEFAULT_TEMPERATURES`): PlotWriter 0.85, WorldBuilder 0.75, DungeonMaster 0.75, PlotPlanner 0.65, Reviewer 0.25, DashboardGenerator 0.80, default 0.70.

## Key Gotchas

- **sql.js sync/async split**: `initSqlJs()` is async; everything after is sync. Don't wrap DB ops in promises.
- **No FTS5**: Use FTS4 for full-text search. If you need FTS5 features, `matchinfo()` works differently.
- **No tests**: Adding tests is welcome but there's no test runner. Decide on one (vitest recommended given tsup/tsx usage).
- **Chinese error messages**: All db-not-initialized errors are in Chinese. Don't add English translations unless doing a full i18n effort.
- **Default genre in code is `"fantasy"`** (in `src/config.ts` `DEFAULT_CONFIG.defaultGenre`), NOT `"infinite-flow"` as stated in README. When creating worlds, `defaultGenre` is used if no genre specified.
- **3 spaces indent in templates**: Some template strings use 3-space indentation (not tabs, not 2-space). Match the existing template style when adding sections.
- **No ESM/CJS dual-package hazard**: tsup builds both. Entry point resolution uses `"module"` condition first. All source is ESM (`"type": "module"` in package.json).
