# Novel Weaver — Learning Log

## Init Tool Implementation (2026-05-31)

### Key Decisions
- **Tool location**: `src/tools/init.ts` — exported as `novelInitTool` via `tool()` factory
- **Registration**: Imported in `src/index.ts` and added to the `tool` hook as `novel_init`
- **Path resolution**: Uses `context.directory` from tool context to resolve `.novel-weaver/` relative to project root
- **DB init**: Uses existing `initDatabase()` / `getDatabase()` from `src/db/index.ts` — the singleton handles WASM bootstrap
- **Template**: Uses `applyWorldTemplate()` from `src/md/templates/index.ts` for the core world setting file

### Directory Structure
```
.novel-weaver/
├── novel-weaver.db          (sql.js database)
├── settings/
│   └── 核心世界观.md         (initial core-world-setting)
├── dungeons/                 (副本设定)
└── chapters/
    └── vol-1/                (第一卷章节)
```

### Database
- Inserts into `projects` table with UUID `id`
- Inserts into `worlds` table with type `core` and status `active`
- DB is exported to disk immediately after inserts

### Error Handling
- If `.novel-weaver/` already exists, returns error message with instructions to delete and retry
- No `--force` option implemented yet

### Tool Schema
- `project_name`: required string
- `genre`: optional string, defaults to `"infinite-flow"`
- `author`: optional string

## Task 12 — Consistency Tools Implementation (2026-05-31)

### Files Created
- `src/tools/consistency.ts` — two tools: `novel_consistency_check` and `novel_consistency_rules`

### Tools

#### `novel_consistency_check`
- **Args**: none (auto-scan)
- **Behavior**: Queries all `worlds`, `characters`, `dungeons` tables and runs 5 heuristic dimensions:
  1. **Power consistency** — detects ability/power keywords (`能力`, `法术`, `等级`, etc.) appearing in character descriptions across different worlds
  2. **Item consistency** — parses dungeon `rewards` JSON fields for same-named items with contradictory descriptions or tier levels
  3. **Character relationship** — cross-world check for same character name with different `role_type` (BLOCKER) or conflicting descriptions (WARNING)
  4. **Timeline** — core world dungeons whose rules mention time-related keywords (`时间流速`, `倒计时`, etc.)
  5. **NPC consistency** — NPCs appearing in multiple worlds with conflicting background descriptions
- **Sorting**: BLOCKER → WARNING → INFO
- **Output**: Returns formatted text with counts + per-issue details, generates `.novel-weaver/content/reports/consistency-{date}.md`
- **Edge case**: Empty DB returns clean "no issues" message

#### `novel_consistency_rules`
- **Args**: `action` (list|add|remove), `name`, `description`, `config` (JSON string), `id`
- DDL: `CREATE TABLE IF NOT EXISTS rules` is executed on every tool call (idempotent)
- Stores in SQLite `rules` table

### Key Patterns Used
- `tool.schema.string()`, `tool.schema.enum()`, `tool.schema.number()` — same as world.ts/dungeon.ts
- `queryAll()` helper wrapping `db.prepare()`/`bind()`/`step()`/`getAsObject()` — same as character.ts
- Report generation uses `generateFrontmatter()` for YAML frontmatter
- All DB operations are synchronous (sql.js)
- Type assertions through `unknown` to satisfy TS strict mode (`as unknown as Type[]`)
- Both tools registered in `src/index.ts` under the `tool` hook
