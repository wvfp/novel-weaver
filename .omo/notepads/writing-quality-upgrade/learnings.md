# F1 Plan Compliance Audit — Learnings

**Date**: 2026-06-06
**Plan**: writing-quality-upgrade.md (2941 lines)
**Auditor**: oracle agent

---

## Must Have Summary

### PASS (Must Have [47/48])

| # | Category | Status | Details |
|---|----------|--------|---------|
| 1 | 4 new DB tables (chapter_facts, character_states, outlines, aliases) | ✅ PASS | Present in src/db/schema.ts (tables 10-13) |
| 2 | Genre templates (5 JSON files) | ✅ PASS | src/modules/chapter/genre-templates/{xianxia,sci-fi,urban,horror,apocalypse}.json |
| 3 | Style anchor storage (tool.ts + analyzer.ts) | ✅ PASS | src/modules/style-anchor/tool.ts + analyzer.ts |
| 4 | Anti-AI rules (expressions.json + rules.ts + apply.ts) | ✅ PASS | src/modules/review/anti-ai-*.{ts,json} |
| 5 | Schema migration + NovelWeaverRc + chat.params hook | ✅ PASS | schema.ts has 4 new tables; loadRcConfig in init.ts; chat.params in index.ts |
| 6 | Genre utils + config-utils + constants | ✅ PASS | src/modules/chapter/{genre-utils,config-utils,constants}.ts |
| 7-13 | All 7 Wave 2 engines | ✅ PASS | write-back.ts, context-manager.ts, ranker.ts, entity-linker.ts, analyzer.ts, emotion-blueprint.ts, rhythm-checker.ts, genre-profile-builder.ts |
| 14 | PlotWriter Agent | ✅ PASS | src/agents/prompts/PlotWriter.ts, registered in agents/index.ts as "plot-writer" |
| 15 | Reviewer upgrade (7-layer anti-AI) | ✅ PASS | src/agents/prompts/Reviewer.ts has 8+ mentions of 7-layer anti-AI patterns, plus annotations check section |
| 16 | WorldBuilder upgrade (genre-aware) | ✅ PASS | WorldBuilder.ts has 15 genre mentions |
| 17 | DungeonMaster upgrade (genre-aware) | ✅ PASS | ArcMaster.ts has 28 genre mentions |
| 18 | Plot Planner upgrade | ✅ PASS | PlotPlanner.ts has 5 outline mentions + 5 genre mentions |
| 19 | write_chapter + dispatcher | ✅ PASS | src/modules/chapter/engine/dispatcher.ts + write.ts |
| 20 | review_fix upgrade + anti-ai-apply | ✅ PASS | src/modules/review/anti-ai-apply.ts |
| 21 | write_continue upgrade | ✅ PASS | src/tools/write.ts (continueWriting function) |
| 22-25 | Wave 4 tools (crosscheck, state_snapshot, foreshadow, style_anchor) | ✅ PASS | All 4 module directories exist with tool.ts |
| 26 | Existing tools upgrade | ✅ PASS | query.ts, progress.ts, consistency.ts, review.ts all present |
| 27-30 | Wave 5 Dashboard (server, api, generator, manager) | ✅ PASS | All 4 files exist in src/dashboard/ |
| 31 | Master Agent prompt + config | ❌ FAIL | master-prompt.ts exists (109 lines Chinese) but master-config.ts ONLY has 23 tools, missing 13+ tools |
| 32 | novel_annotations tool + prompt integration | ✅ PASS | annotations/tool.ts; PlotWriter "读者标注" section; Reviewer "标注一致性检查" section |
| 33-36 | Wave 7 Style Imprint (schema, analyzer, tool, injector) | ✅ PASS | All 5 files exist in src/modules/style-imprint/ |
| 37-38 | Summary system (table, engine, tool) | ✅ PASS | summary/ with schema.ts, tool.ts, engine/{single,group,compress}.ts |
| 39 | Summary hooks (messages-transform) | ✅ PASS | src/hooks/messages-transform.ts registered in index.ts |
| 40-41 | RAG (embedder, vector-store, retriever + system-transform hook) | ✅ PASS | src/modules/rag/ with 4 files; system-transform.ts hook registered |
| 42 | Fact locking + scoring + novel_fact_lock tool | ✅ PASS | lock.ts, scorer.ts, fact-lock-tool.ts in src/modules/consistency/ |
| — | 36 tools registered | ✅ PASS | 36 tools in TOOL_DEFINITIONS (exceeds 23 minimum) |
| — | 5 agents registered | ✅ PASS | ArcMaster, WorldBuilder, Reviewer, PlotPlanner, PlotWriter |
| — | FTS4 tables | ✅ PASS | worlds_fts, characters_fts, chapters_fts, arcs_fts in schema.ts |
| — | 6 hooks registered | ✅ PASS | messages-transform, system-transform, tool-execute-after, chat-message, event, compacting |
| — | All Chinese prompts | ✅ PASS | All agent prompts verified as Chinese |
| — | All new code uses parameterized queries | ✅ PASS | No sq() in any src/modules/ file; dynamic IN clauses use safe ?-placeholder pattern |
| — | .novel-weaverrc.json config system | ✅ PASS | NovelWeaverRc in types.ts, loadRcConfig in init.ts, chat.params in index.ts |
| — | Migration system | ✅ PASS | src/db/migrations/002-dashboard-annotations.ts with proper up() |
| — | All DB indexes present | ✅ PASS | FK indexes on chapter_facts, character_states, outlines, aliases, genre_config |

---

## Must NOT Have Summary

| # | Constraint | Status | Details |
|---|-----------|--------|---------|
| 1 | 不修改现有 Bug | ✅ PASS | sq() calls in write.ts + pipeline/index.ts left untouched |
| 2 | 不搭建测试框架 | ✅ PASS | 4 .test.ts files exist but pre-existing in git history |
| 3 | 不添加 CI/CD | ✅ PASS | No CI/CD config found |
| 4 | Anti-AI 检测不超过 7 层 | ✅ PASS | Reviewer prompt exactly 7 layers |
| 5 | 首批题材模板不超过 5 种 | ✅ PASS | Exactly 5 genre template JSON files |
| 6 | 不合并 novel_consistency_check | ✅ PASS | consistency_check + crosscheck are separate tools |
| 7 | 不添加英文 Agent 提示词 | ✅ PASS | All prompts verified as Chinese |
| 8 | 不自动写 opencode.json | ✅ PASS | master-config.ts exports only |
| 9 | 不添加 .only 测试 | ✅ PASS | No .only found in any test files |
| 10 | Dashboard 只通过 HTTP API 通信 | ✅ PASS | dashboard/ imports no module tools directly |

---

## Task Completion Summary

Tasks T1-T42: **41/42 completed (97.6%)**
- T31 (Master Agent): Files exist but acceptance criteria FAIL (tools incomplete)

---

## Key Issues

### BLOCKER: master-config.ts missing 13+ tools (T31)
- **File**: src/agents/master-config.ts
- **What's wrong**: Per plan T31 acceptance criteria "包含全部 30+ 工具", master-config.ts only has 23 tools. Missing: novel_fact_lock, novel_crosscheck, novel_character_voice_check, novel_state_snapshot, novel_foreshadow, novel_style_anchor, novel_imprint, novel_summary, novel_annotations, novel_dashboard, novel_genre_list, novel_genre_config, novel_install_agents
- **Impact**: Users who register the master agent won't have access to all tools
- **Fix needed**: Add all missing tools to the tools object in NOVEL_WEAVER_AGENT_CONFIG

### WARNING: character_voice table in EXPECTED_TABLES has no CREATE TABLE statement
- **File**: src/db/schema.ts line 248
- character_voice is in EXPECTED_TABLES but no CREATE TABLE exists anywhere

### INFO: No evidence files in .omo/evidence/
- Expected by plan's QA policy but F1 is first verification step — evidence generation is downstream

---

## Verification Evidence

### Tools counted: 36
novel_ping, novel_init, novel_arc_generate, novel_arc_customize, novel_world_create, novel_world_query, novel_world_link, novel_character_create, novel_character_update, novel_character_query, novel_character_voice_check, novel_write_chapter, novel_write_continue, novel_write_edit, novel_review_chapter, novel_review_fix, novel_consistency_check, novel_consistency_rules, novel_fact_lock, novel_crosscheck, novel_query, novel_stats, novel_progress_track, novel_progress_summary, novel_state_snapshot, novel_foreshadow, novel_style_anchor, novel_imprint, novel_summary, novel_annotations, novel_dashboard, novel_pipeline_start, novel_pipeline_status, novel_genre_list, novel_genre_config, novel_install_agents

### Agents registered: 5
world-builder, arc-master, reviewer, plot-planner, plot-writer

### FTS4 tables: 4
worlds_fts, characters_fts, chapters_fts, arcs_fts

### Hooks registered: 7
config, tool, tool.definition, command.execute.before, chat.params, experimental.chat.messages.transform, experimental.chat.system.transform, tool.execute.after, chat.message, event, experimental.session.compacting

### sq() calls: 12 (all in pre-existing files: write.ts + pipeline/index.ts — not modified per guardrail)
Zero sq() calls in new module code under src/modules/

### .only in tests: 0

---

## FINAL VERDICT: REJECT

Must Have [47/48] | Must NOT Have [10/10] | Tasks [41/42] | VERDICT: REJECT

**Rejection reason**: T31 (Master Agent) acceptance criteria FAIL — src/agents/master-config.ts only includes 23 of 30+ required tools. All other Must Have items pass. Must NOT Have items all clean.

---

*Generated by F1 plan compliance audit agent*
