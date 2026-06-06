# Error Handling & Boundary Audit — Findings

**Date**: 2026-05-31
**Scope**: All 23 tools in `src/tools/*.ts` + `src/pipeline/index.ts`
**Build**: `npx tsc --noEmit` ✅ PASS

---

## Summary of Boundary Scenario Coverage

### Scenario 1: Empty DB → "not initialized" error
**Verdict: ✅ PASS (all tools check db handle)**

Every tool checks `getDatabase()` at the start of `execute()`:
| Tool | Check | Message |
|------|-------|---------|
| `novel_world_create` | `if (!db)` | `错误：数据库未初始化。请确保插件已正确加载。` |
| `novel_world_query` | `if (!db)` | `错误：数据库未初始化。` |
| `novel_world_link` | `if (!db)` | `错误：数据库未初始化。` |
| `novel_character_create` | `if (!db)` | `Error: Database not initialised. Call initDatabase() first.` |
| `novel_character_update` | `if (!db)` | `Error: Database not initialised.` |
| `novel_character_query` | `if (!db)` | `Error: Database not initialised.` |
| `novel_dungeon_generate` | (thrown via helper) | `[novel-weaver] Database not initialised.` |
| `novel_dungeon_customize` | (thrown via helper) | `[novel-weaver] Database not initialised.` |
| `novel_write_chapter` | `if (!db)` | `❌ 数据库未初始化，请先调用 initDatabase()` |
| `novel_write_continue` | `if (!db)` | `❌ 数据库未初始化，请先调用 initDatabase()` |
| `novel_write_edit` | `if (!db)` | `❌ 数据库未初始化，请先调用 initDatabase()` |
| `novel_review_chapter` | `if (!db)` | `数据库未初始化，请先调用 initDatabase` |
| `novel_review_fix` | `if (!db)` | `数据库未初始化，请先调用 initDatabase` |
| `novel_consistency_check` | `if (!db)` | `错误：数据库未初始化。请确保插件已正确加载。` |
| `novel_consistency_rules` | `if (!db)` | `错误：数据库未初始化。请确保插件已正确加载。` |
| `novel_progress_track` | `if (!db)` | `❌ 数据库未初始化。请先运行 novel_init 初始化。` |
| `novel_progress_summary` | `if (!db)` | `❌ 数据库未初始化。请先运行 novel_init 初始化。` |
| `novel_pipeline_start` | `if (!db)` | `❌ 数据库未初始化。请先运行 novel_init 初始化项目。` |
| `novel_pipeline_status` | `if (!db)` | `❌ 数据库未初始化。请先运行 novel_init 初始化项目。` |
| `novel_query` | `if (!db)` | `错误：数据库未初始化。` |
| `novel_stats` | `if (!db)` | `错误：数据库未初始化。` |

**Note**: `novel_init` is the exception — it creates the database, so `!db` check only applies after the `initDatabase()` call, which is guarded by `if (!SQL)` throw at the db module level.

### Scenario 2: Readonly directory → write failure
**Verdict: ⚠️ PARTIAL (9 tools handle gracefully, 12 tools rely on framework catch)**

Tools using `fs.writeFileSync`/`fs.mkdirSync`:

| Tool | Location | Wrapped in try-catch? |
|------|----------|----------------------|
| `init.ts` | line 70, 100-101, 123 | ❌ No |
| `world.ts` | line 140, 143 | ❌ No |
| `dungeon.ts` | line 613, 648, 883 | ❌ No (but lines 613, 648 are in tool handler) |
| `character.ts` | line 41, 135, 143 | ❌ No (lines 289-297, 411-425 wrapped) |
| `review.ts` | line 573 | ❌ No |
| `write.ts` | line 321, 334, 852, 864 | ❌ No |
| `progress.ts` | line 465 | ❌ No |
| `consistency.ts` | line 556 | ❌ No |
| `pipeline/index.ts` | — | No file writes |

The tool framework (`@opencode-ai/plugin/tool`) likely catches unhandled exceptions from `execute()` and returns a generic error, but user-friendly messages are missing for most file write failures.

### Scenario 3: Duplicate init → "already initialized" error
**Verdict: ✅ PASS**

`novel_init` checks `if (fs.existsSync(novelDir))` at line 54 and returns:
```
❌ 项目已存在，「.novel-weaver/」目录已存在。
如需重新初始化，请手动删除「.novel-weaver/」目录后重试。
```

No `--force` option exists. ✓ Correct behavior.

**Duplicate chapter** is also handled in `novel_write_chapter` (line 492-495):
```
❌ 章节重复：第 X 卷第 Y 章已存在（ID: ...）。使用 novel_write_edit 修改，或更换 chapter_num。
```

### Scenario 4: Non-existent ID → "not found" error
**Verdict: ✅ PASS (all tools return descriptive messages)**

| Tool | Query | Error Message |
|------|-------|---------------|
| `novel_world_query` | keyword search → no results | `未找到包含「${keyword}」的世界设定。` |
| `novel_world_link` | N/A (inserts only) | — |
| `novel_character_create` | world_id lookup → miss | `Error: World with id "${worldId}" not found. Create the world first.` |
| `novel_character_update` | character id → miss | `Error: Character with id "${id}" not found.` |
| `novel_character_query` | search → no results | `No characters found matching "${searchTerm}".` |
| `novel_dungeon_customize` | loadDungeon → null | `❌ 未找到 ID 为「${dungeon_id}」的副本。请检查 ID 是否正确。` |
| `novel_write_edit` | chapter id → miss | `❌ 未找到章节：${chapter_id}` |
| `novel_review_chapter` | chapter id → miss | `未找到章节：${chapter_id}` |
| `novel_review_fix` | review id → miss | `未找到审查记录：${review_id}（请先对本章执行 novel_review_chapter）` |
| `novel_consistency_rules` | remove → id miss | `❌ 未找到 ID 为「${args.id}」的规则。` |
| `novel_progress_track` | dungeon_id → step fail | `❌ 未找到 ID 为「${dungeon_id}」的副本。` |
| `novel_progress_track` | step_name → miss | `❌ 副本「${name}」中未找到步骤「${step_name}」。` |
| `novel_query` | any type → no results | `未找到包含「${query}」的${typeLabel}` |

### Scenario 5: sql.js errors wrapped in try-catch
**Verdict: ❌ FAIL (many unprotected sql.js calls)**

**Protected calls** (inside try-catch in tool handler):
- `character.ts`: lines 269-278 (INSERT), 386-395 (UPDATE), 511-516 (queryAll)
- `dungeon.ts`: lines 576-591 (insertDungeon), 623-635 (insertCharacter), 655-664 (insertProgressStep), 847-851 (updateDungeon)
- `write.ts`: lines 513-526 (saveChapter), 658-671 (saveChapter in continue)
- `consistency.ts`: lines 591-597 (runChecks), 789-797 (INSERT rule), 830-834 (DELETE rule)
- `review.ts`: lines 778-782 (JSON.parse)

**Unprotected calls** (will throw raw sql.js errors):
- `init.ts`: lines 85, 92 — `db.run()` for INSERT
- `world.ts`: lines 109, 117, 307 — `db.run()` for INSERT/link
- `write.ts`: lines 209-272 — `db.exec()` in `loadChapterContext()` (sql injection via `sq()` + string interpolation)
- `write.ts`: lines 487, 585, 729 — `db.exec()` for duplicate check / last chapter / existing chapter
- `write.ts`: line 313 — `db.run()` in `saveChapter()` (parent try-catch catches it)
- `write.ts`: lines 825-838 — `db.run()` for UPDATE (not in try-catch)
- `pipeline/index.ts`: lines 60, 85, 113, 138 — table creation, pipeline CRUD
- `pipeline/index.ts`: lines 791-813 — `db.exec()` in pipeline status
- `character.ts`: lines 156-157 — `db.run()` in `syncCharacterFts()`
- `character.ts`: lines 194, 201 — `db.run()`/`db.exec()` in `ensureDefaultProtagonist()`
- `character.ts`: line 281 — `db.exec()` for rowid retrieval
- `progress.ts`: lines 115-145 — `db.prepare()`/`db.run()` in progress_track
- `progress.ts`: lines 166-203 — `db.prepare()`/`db.run()` in view
- `progress.ts`: line 261 — `db.exec()` in list
- `progress.ts`: line 362, 385 — `db.exec()`/`db.prepare()` in progress_summary
- `consistency.ts`: lines 579, 707 — `db.run()` for CREATE TABLE
- `review.ts`: lines 531, 559, 750, 764, 825, 837 — `db.prepare()`/`db.run()`
- `dungeon.ts`: lines 298, 330, 363, 381, 406 — helper function db calls

**SQL injection via string interpolation** (using `sq()` + template literals):
- `write.ts` `loadChapterContext()` — all 5 `db.exec()` calls at lines 209, 231, 253, 265, 272
- `write.ts` `novel_write_chapter` — line 487-492 (duplicate check)
- `write.ts` `novel_write_continue` — line 585-591 (last chapter)
- `write.ts` `novel_write_edit` — line 729-732 (find existing)
- `pipeline/index.ts` `buildSettingContext` — lines 239-241, 243-244
- `pipeline/index.ts` `buildPlanningContext` — lines 280-283, 296-298, 302-309, 316-318, 321-323
- `pipeline/index.ts` `buildWritingContext` — lines 371-374, 383-388, 399-403, 409-414
- `pipeline/index.ts` `buildReviewingContext` — lines 460-461, 479-483, 502-504

These use `sq()` (single-quote escaping) instead of parameterized queries. While functional for simple text, this is a code smell and can break on edge cases with backslash or unicode.

---

## Additional Findings

### Helper Function Error Propagation
Several helper functions throw on error and rely on the caller to catch:
- `insertDungeon()` → throws on !db, caller catches ✓
- `insertCharacter()` → throws on !db, caller catches ✓  
- `saveChapter()` → throws on !db, caller catches ✓
- `queryAll()` / `queryOne()` → don't wrap prepare/step, errors propagate uncaught ✗

### `novel_ping` Tool
Has no db check — returns "pong" regardless. This is intentional as a health check. ✓

### Empty Query String in `novel_query`
Checked at line 348-350: `if (!query) return { output: "请提供搜索关键词。" }` ✓

### Published Chapter Guard
`novel_write_edit` checks status at line 750: `if (existing.status === 'published')` returns error. ✓

---

## Summary Counts

| Check | Result |
|-------|--------|
| Build (`npx tsc --noEmit`) | ✅ PASS |
| Scenario 1: Empty DB → "not initialized" | ✅ PASS (21/21 tools) |
| Scenario 2: Readonly dir → write failure | ⚠️ PARTIAL (0/9 direct file writes wrapped) |
| Scenario 3: Duplicate init → "already exists" | ✅ PASS |
| Scenario 4: Non-existent ID → "not found" | ✅ PASS (12/12 query patterns) |
| Scenario 5: sql.js errors in try-catch | ❌ FAIL (~45 unprotected sql.js calls) |

**VERDICT: ❌ FAIL — Critical: sql.js calls unprotected; Moderate: filesystem write errors unhandled**
