# Writing Quality Upgrade — Learnings

## Cross-Chapter Fact Conflict Detection (novel_crosscheck)

- **Created**: 2026-06-05
- **Module**: `src/modules/crosscheck/` (tool.ts + fact-checker.ts)
- **Purpose**: Detect 7 types of continuity conflicts across chapters by querying `chapter_facts` and `character_states` tables.

### 7 Detection Types

| # | Type | Detection Logic | Source Table |
|---|------|----------------|-------------|
| 1 | Temporal | Finds combat_result death → later reappearance without revival explanation | chapter_facts + character_states |
| 2 | Location | Same character, same chapter_num, different location values | character_states (self-join) |
| 3 | Power level | Power value jump >2x (BLOCKER) or any change (WARNING) without state_change/plot_advance | character_states + chapter_facts |
| 4 | Relationship | Relationship type flipping (ally↔enemy) without relationship_change fact in between | character_states (parse JSON relationships) |
| 5 | Item usage | Entity referenced in non-acquire fact before its first item_acquire fact | chapter_facts |
| 6 | Fact contradiction | Character_states with contradictory tag pairs (死亡↔存活, 昏迷↔清醒, etc.) | character_states (parse JSON status_tags) |
| 7 | Unresolved hook | hook_set without hook_payoff after N chapters (default 10) | chapter_facts |

### Key Technical Decisions

- **Pure SQL + logic** — no LLM calls. All detection is deterministic.
- **sql.js synchronous** — all DB ops sync after WASM bootstrap.
- **ESM imports** — `.js` extension on all relative imports.
- **Tool factory pattern** — follows existing `tool()` + `tool.schema` pattern from consistency tool.
- **Chinese error/output** — follows the project convention (database-not-initialized, error messages).
- **Report file** — follows consistency pattern: `.novel-weaver/content/reports/crosscheck-{date}.md` with YAML frontmatter.
- **Parameterized queries** — all queries use `db.prepare()` + `bind()` + `step()`, no string interpolation.

## Task 12 — Tools Upgrade (Memory System Integration)

- **Date**: 2026-06-05
- **Files modified**:
  - `src/tools/query.ts` — Added `searchChapterFacts()` that queries `chapter_facts` table by description/entity_ref. Appended to character and chapter search results.
  - `src/tools/progress.ts` — Added character state snapshot to progress view (`action=view`). Queries `character_states` via dungeon→world→character join, shows status_tags and power_level per character.
  - `src/tools/consistency.ts` — Added 6th dimension "跨章节事实一致性" that checks `chapter_facts` for contradictions: death+zombie detection, conflict pairs (combat_result/state_change, hook_set/hook_payoff), and self-contradictory types (combat_result with opposite outcomes).
  - `src/tools/review.ts` — Added `loadStyleProfile()` and `checkStyleDeviation()` for Layer 7 anti-AI style comparison. Loads `anchor-profile.json` and compares sentence length distribution and dialogue ratio against the author's established style.
  - `src/pipeline/index.ts` — Added genre template context to writing phase via `loadGenreTemplate()` from genre-utils. Shows style guidelines and writing rules from the dungeon's theme template.

### Gotchas Encountered

- Power level is stored as TEXT in character_states — must extract numeric values with regex fallback.
- character_states.status_tags and character_states.relationships are JSON strings — must parse carefully.
- entity_ref in chapter_facts may be a character name or item name (not UUID) — joins with characters table use name matching.
- Relationship types are not standardized — we check for opposing pairs (enemy↔ally, hostile↔friendly, etc.).
- No LSP server in dev environment — only `tsc --noEmit` for validation.
