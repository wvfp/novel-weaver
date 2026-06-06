/**
 * Unit tests for the novel_query tool's intent-based semantic search.
 *
 * Covers:
 *   1. `intent=recall`    — returns candidates with excerpts
 *   2. `intent=relation`  — searches character descriptions + chapters
 *   3. `intent=definition`— searches world / chapter_facts tables
 *   4. `intent=summary`   — aggregates previews across chapters
 *   5. no `intent`        — falls back to classic keyword behaviour
 *   6. `intent=recall` w/ no matches — returns appropriate message
 *   7. FTS4 failure       — graceful LIKE fallback
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { initDatabase, getDatabase, closeDatabase, generateId } from "../db/index";
import { novel_query } from "./query";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface SeedRefs {
  projectId: string;
  worldId: string;
  characterId: string;
  arcId: string;
  chapterIds: string[];
}

let projectRoot: string;

beforeEach(async () => {
  closeDatabase();
  projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "novel-query-"));
  await initDatabase(); // in-memory DB
  await seedFixture();
});

afterEach(async () => {
  closeDatabase();
  await fsp.rm(projectRoot, { recursive: true, force: true });
});

/**
 * Insert a deterministic project / world / character / arc / chapters set so
 * the semantic search handlers have something to retrieve. IDs are stored
 * in the chapter_summaries table for some chapters so Stage 1 can pull
 * excerpts from summary rows.
 */
async function seedFixture(): Promise<SeedRefs> {
  const db = getDatabase();
  if (!db) throw new Error("db not initialised in seedFixture");

  const projectId = generateId();
  const worldId = generateId();
  const characterId = generateId();
  const arcId = generateId();

  db.run(
    `INSERT INTO projects (id, name) VALUES (?, ?)`,
    [projectId, "测试项目"],
  );
  db.run(
    `INSERT INTO worlds (id, project_id, name, type, yaml_metadata)
     VALUES (?, ?, ?, 'primary', ?)`,
    [worldId, projectId, "天元大陆", JSON.stringify({
      description: "修炼者横行的修仙世界",
      definition: "魂力是修炼者驾驭天地的根本能量",
    })],
  );
  db.run(
    `INSERT INTO characters (id, world_id, name, role_type, aliases, description)
     VALUES (?, ?, '林夜', 'protagonist', ?, ?)`,
    [
      characterId,
      worldId,
      JSON.stringify(["夜哥", "林公子"]),
      "主角,出身寒门的少年,误入异世界后觉醒魂力,拜入青云宗",
    ],
  );
  db.run(
    `INSERT INTO characters (id, world_id, name, role_type, aliases, description)
     VALUES (?, ?, '玄清真人', 'support', ?, ?)`,
    [
      generateId(),
      worldId,
      JSON.stringify(["师父", "玄清"]),
      "青云宗长老,主角的师父,传授魂力心法",
    ],
  );
  db.run(
    `INSERT INTO arcs (id, world_id, name, arc_type, theme, difficulty, status)
     VALUES (?, ?, '初入异世', 'storyline', 'cultivation', 1, 'active')`,
    [arcId, worldId],
  );

  const chapterSeeds: Array<{ title: string; volume: number; num: number; summary?: string; factDesc?: string }> = [
    {
      title: "穿越",
      volume: 1,
      num: 1,
      summary: "林夜睁开眼,发现自己躺在一片荒芜的草原上。天空呈现诡异的紫红色,远处有光柱冲天而起。",
    },
    {
      title: "异世界的第一夜",
      volume: 1,
      num: 2,
      summary: "林夜在山洞中避难,发现手中凝聚出一团淡淡的银白光芒——这就是魂力。",
    },
    {
      title: "拜入青云宗",
      volume: 1,
      num: 3,
      summary: "玄清真人察觉林夜体内的魂力波动,收他为徒,关系确立为师徒。",
      factDesc: "林夜觉醒魂力,首次展现修炼天赋",
    },
    {
      title: "魂力的觉醒",
      volume: 1,
      num: 4,
      summary: "林夜在师父亲自指导下,逐步掌握魂力的运转方式。",
    },
    {
      // Chapter with a literal `"` so the FTS4 graceful-degradation test
      // can craft a query that fails FTS4 (unmatched quote) but still
      // matches this title via LIKE.
      title: '世界"记忆',
      volume: 1,
      num: 5,
    },
  ];

  const chapterIds: string[] = [];
  for (const c of chapterSeeds) {
    const id = generateId();
    chapterIds.push(id);
    db.run(
      `INSERT INTO chapters (id, arc_id, volume_num, chapter_num, title, word_count, status)
       VALUES (?, ?, ?, ?, ?, 1000, 'finalized')`,
      [id, arcId, c.volume, c.num, c.title],
    );
    if (c.summary) {
      db.run(
        `INSERT INTO chapter_summaries (id, chapter_id, summary_level, summary_text, key_events)
         VALUES (?, ?, 1, ?, '[]')`,
        [generateId(), id, c.summary],
      );
    }
    if (c.factDesc) {
      db.run(
        `INSERT INTO chapter_facts (id, chapter_id, fact_type, entity_ref, description, chapter_num)
         VALUES (?, ?, 'state_change', '林夜', ?, ?)`,
        [generateId(), id, c.factDesc, c.num],
      );
    }
  }

  return { projectId, worldId, characterId, arcId, chapterIds };
}

// ---------------------------------------------------------------------------
// Test execution helper
// ---------------------------------------------------------------------------

/** Invoke novel_query.execute() with a fake ToolContext. */
async function callQuery(
  args: Parameters<typeof novel_query.execute>[0],
  directory: string = projectRoot,
): Promise<{ output: string; metadata?: Record<string, unknown> }> {
  const ctx = {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
  const result = await novel_query.execute(args, ctx as any);
  if (typeof result === "string") return { output: result };
  return { output: result.output, metadata: result.metadata };
}

// ---------------------------------------------------------------------------
// 1. intent=recall — returns candidates with excerpts
// ---------------------------------------------------------------------------

describe("novel_query — intent=recall", () => {
  test("returns candidate chapters with excerpts and metadata", async () => {
    const result = await callQuery({
      query: "异世界",
      type: "auto",
      intent: "recall",
    });
    const meta = result.metadata ?? {};

    expect(result.output).toContain("异世界");
    expect(result.output).toContain("候选章节");
    expect(meta.intent).toBe("recall");
    expect(meta.query).toBe("异世界");
    expect(typeof meta.candidate_count).toBe("number");
    expect((meta.candidate_count as number) > 0).toBe(true);

    const citations = meta.citations as Array<Record<string, unknown>>;
    expect(Array.isArray(citations)).toBe(true);
    expect(citations.length).toBeGreaterThan(0);
    for (const c of citations.slice(0, 3)) {
      expect(typeof c.chapter_id).toBe("string");
      expect(typeof c.title).toBe("string");
      expect(typeof c.volume_num).toBe("number");
      expect(typeof c.chapter_num).toBe("number");
      expect(typeof c.excerpt).toBe("string");
      expect(typeof c.relevance).toBe("number");
      expect(c.relevance as number).toBeGreaterThanOrEqual(0);
      expect(c.relevance as number).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. intent=relation — searches character descriptions + chapters
// ---------------------------------------------------------------------------

describe("novel_query — intent=relation", () => {
  test("surfaces matching characters alongside chapter candidates", async () => {
    const result = await callQuery({
      query: "林夜",
      type: "auto",
      intent: "relation",
    });
    const meta = result.metadata ?? {};

    expect(meta.intent).toBe("relation");
    // The "characters" array should contain at least the protagonist.
    const characters = meta.characters as Array<Record<string, unknown>> | undefined;
    expect(Array.isArray(characters)).toBe(true);
    expect(characters?.length ?? 0).toBeGreaterThan(0);
    const names = (characters ?? []).map((c) => c.name as string);
    expect(names).toContain("林夜");
  });

  test("falls back to 'no matches' message when both lists are empty", async () => {
    const result = await callQuery({
      query: "一个绝对不存在的概念xyzzy",
      type: "auto",
      intent: "relation",
    });
    expect(result.output).toContain("未找到");
    const meta = result.metadata ?? {};
    expect(meta.candidate_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. intent=definition — searches world / chapter_facts tables
// ---------------------------------------------------------------------------

describe("novel_query — intent=definition", () => {
  test("matches against world yaml_metadata definitions", async () => {
    const result = await callQuery({
      query: "魂力",
      type: "auto",
      intent: "definition",
    });
    const meta = result.metadata ?? {};

    expect(meta.intent).toBe("definition");
    // World hit expected — yaml_metadata contains "魂力是修炼者驾驭天地的根本能量".
    expect(result.output).toContain("天元大陆");
    expect(result.output).toContain("魂力");
  });

  test("falls back to chapter_facts when world/character tables miss", async () => {
    // "青云宗" is not in any world/character description text but a fact
    // references it via the arc name in the chapter_facts row.
    const result = await callQuery({
      query: "青云宗",
      type: "auto",
      intent: "definition",
    });
    expect(result.output).toContain("【定义】");
  });
});

// ---------------------------------------------------------------------------
// 4. intent=summary — aggregates previews across chapters
// ---------------------------------------------------------------------------

describe("novel_query — intent=summary", () => {
  test("aggregates a list of previews across the seeded chapters", async () => {
    const result = await callQuery({
      query: "林夜",
      type: "auto",
      intent: "summary",
    });
    const meta = result.metadata ?? {};

    expect(meta.intent).toBe("summary");
    expect(result.output).toContain("【摘要】");
    // At least the four seeded chapters should be listed.
    const output = result.output;
    expect(output).toContain("穿越");
    expect(output).toContain("异世界的第一夜");
    expect(output).toContain("拜入青云宗");
    expect(output).toContain("魂力的觉醒");
    expect(typeof meta.answer).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 5. No `intent` — falls back to classic keyword behaviour
// ---------------------------------------------------------------------------

describe("novel_query — default keyword behaviour", () => {
  test("intent=search (default) returns classic character search results", async () => {
    const result = await callQuery({
      query: "林夜",
      type: "character",
      intent: "search",
    });
    const meta = result.metadata ?? {};

    // Classic output: 【角色搜索】「林夜」 followed by a list of characters.
    expect(result.output).toContain("【角色搜索】");
    expect(result.output).toContain("林夜");
    expect(meta.intent).toBe("search");
    expect(meta.type).toBe("character");
  });

  test("type=auto routes to character search by default for protagonist keywords", async () => {
    const result = await callQuery({
      query: "主角",
      type: "auto",
      intent: "search",
    });
    expect(result.output).toContain("【角色搜索】");
  });
});

// ---------------------------------------------------------------------------
// 6. intent=recall with no matches — returns appropriate message
// ---------------------------------------------------------------------------

describe("novel_query — intent=recall empty result", () => {
  test("returns a no-match output and zero candidate_count", async () => {
    const result = await callQuery({
      query: "完全不存在的关键词qzz_no_match",
      type: "auto",
      intent: "recall",
    });
    const meta = result.metadata ?? {};

    expect(result.output).toContain("未找到");
    expect(meta.intent).toBe("recall");
    expect(meta.candidate_count).toBe(0);
    expect((meta.citations as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. FTS4 failure — graceful LIKE fallback
// ---------------------------------------------------------------------------

describe("novel_query — FTS4 graceful degradation", () => {
  test("falls back to LIKE when FTS4 MATCH throws on invalid syntax", async () => {
    // The unbalanced double-quote causes FTS4 to throw a parse error,
    // exercising the try/catch fallback inside findChapterCandidates.
    // The query still contains "世界" which LIKE matches against the
    // chapter titled `世界"记忆`.
    const result = await callQuery({
      query: '世界"',
      type: "auto",
      intent: "recall",
    });
    const meta = result.metadata ?? {};

    // Should surface a LIKE hit (chapter titled `世界"记忆`) even though
    // FTS4 rejected the syntax.
    expect(result.output).toContain("世界");
    expect(meta.intent).toBe("recall");
    expect((meta.candidate_count as number) > 0).toBe(true);
  });
});
