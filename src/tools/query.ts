/**
 * novel-weaver Query & Statistics Tools
 *
 * Two tools for exploring project data:
 *   1. novel_query  — intelligent query router that accepts natural language-like
 *                     queries and searches across worlds/characters/chapters/
 *                     arcs/links using FTS4 and LIKE. Supports intent-based
 *                     semantic search (recall / relation / definition / summary).
 *   2. novel_stats  — writing statistics: overall stats (total word count,
 *                     chapter count, arc count, completion %), per-arc
 *                     stats, and optional timeline breakdown (V2).
 *
 * @packageDocumentation
 */

import { tool } from "@opencode-ai/plugin/tool";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { getDatabase } from "../db/index.js";
import type { Database } from "../db/index.js";

const z = tool.schema;

/** Local require() — works in both ESM and CJS builds. */
const localRequire = typeof __dirname !== 'undefined' ? require : createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum candidate chapters returned by Stage 1 (coarse retrieval). */
const CANDIDATE_LIMIT = 10;

/** Maximum number of excerpts returned in semantic intent results. */
const SEMANTIC_RESULT_LIMIT = 5;

/** Excerpt length (in characters) for a single semantic citation. */
const EXCERPT_MAX_CHARS = 500;

/** Preview length (in characters) per chapter for summary intent. */
const SUMMARY_PREVIEW_CHARS = 200;

/** How many chapters to include in a default summary intent. */
const SUMMARY_DEFAULT_CHAPTERS = 10;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Run a prepared SELECT and return all rows as objects. */
function queryAll(
  db: Database,
  sql: string,
  params: unknown[],
): Record<string, unknown>[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row) rows.push(row);
    }
    stmt.free();
    return rows;
  } catch (err) {
    console.error(`[novel-weaver] queryAll failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Run a prepared SELECT and return the first row, or null. */
function queryOne(
  db: Database,
  sql: string,
  params: unknown[],
): Record<string, unknown> | null {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row: Record<string, unknown> | null = null;
    if (stmt.step()) {
      row = stmt.getAsObject() ?? null;
    }
    stmt.free();
    return row;
  } catch (err) {
    console.error(`[novel-weaver] queryOne failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Cached ModelResolver reference (resolved lazily). */
let cachedResolver:
  | {
      getModel(task: string): string;
      recordUsage(task: string, promptTokens: number, completionTokens: number): void;
    }
  | null
  | undefined; // undefined = not yet attempted; null = attempted & not available

/**
 * Try to load the ModelResolver module once, then cache the reference.
 *
 * Returns `null` when the resolver is not initialised (i.e. `initModelResolver`
 * has not been called by the host). The query tool degrades gracefully — it
 * simply skips usage tracking when the resolver is unavailable.
 */
function tryGetModelResolver(): {
  getModel(task: string): string;
  recordUsage(task: string, promptTokens: number, completionTokens: number): void;
} | null {
  if (cachedResolver !== undefined) return cachedResolver;
  // Use createRequire to load the resolver module lazily. This keeps the
  // query tool working when the resolver has not been initialised by the
  // host (e.g. tests, or tools invoked before initModelResolver).
  try {
    const mod = localRequire("../services/model-resolver.js") as typeof import("../services/model-resolver.js");
    cachedResolver = mod.getModelResolver();
  } catch {
    cachedResolver = null;
  }
  return cachedResolver;
}

// ---------------------------------------------------------------------------
// Intent detection for auto mode
// ---------------------------------------------------------------------------

type DetectedType = "world" | "character" | "chapter" | "arc" | "link";

function detectType(query: string): DetectedType {
  const lower = query.toLowerCase();

  // Link / relationship keywords (check first — more specific)
  if (
    /关联|关系|链接|wikilink|link|连接|相关/.test(lower)
  ) {
    return "link";
  }

  // Arc keywords
  if (/副本|篇章|dungeon|arc|迷宫|秘境/.test(lower)) {
    return "arc";
  }

  // Chapter keywords
  if (/章节|章|内容|chapter|卷|剧情/.test(lower)) {
    return "chapter";
  }

  // Character / person keywords
  if (/角色|人物|谁|character|who|主角|配角|npc/.test(lower)) {
    return "character";
  }

  // World / setting keywords
  if (/世界|世界观|设定|world|setting|宇宙/.test(lower)) {
    return "world";
  }

  // Default to character (most common search intent)
  return "character";
}

// ---------------------------------------------------------------------------
// Search implementations
// ---------------------------------------------------------------------------

/** Search worlds by name or yaml_metadata (LIKE). */
function searchWorlds(db: Database, query: string): string {
  const pattern = `%${query}%`;
  const sql = `SELECT id, name, type, status, yaml_metadata
               FROM worlds
               WHERE name LIKE ? OR yaml_metadata LIKE ?
               ORDER BY name LIMIT 20`;
  const rows = queryAll(db, sql, [pattern, pattern]);

  if (rows.length === 0) {
    return `未找到包含「${query}」的世界设定。`;
  }

  const typeLabel = (t: string) => (t === "core" ? "核心世界" : "篇章世界");

  const lines: string[] = [`找到 ${rows.length} 个世界设定：`, ""];
  for (const row of rows) {
    let desc = "";
    try {
      const meta = JSON.parse(String(row.yaml_metadata ?? "{}"));
      desc =
        typeof meta.description === "string"
          ? meta.description.slice(0, 60)
          : "";
    } catch {
      // invalid JSON — ignore
    }
    const suffix = desc ? ` — ${desc}` : "";
    lines.push(
      `- [[${row.name}]] — ${typeLabel(String(row.type))} [${row.status}]${suffix}`,
    );
  }
  return lines.join("\n");
}

/** Search characters by name or aliases (LIKE + FTS4 fallback). */
function searchCharacters(db: Database, query: string): string {
  const pattern = `%${query}%`;
  const sql = `SELECT c.id, c.name, c.role_type, c.aliases, c.description,
                      w.name AS world_name
               FROM characters c
               LEFT JOIN worlds w ON w.id = c.world_id
               WHERE c.name LIKE ? OR c.aliases LIKE ?
               ORDER BY c.name ASC LIMIT 20`;
  let rows = queryAll(db, sql, [pattern, pattern]);

  // FTS4 fallback when LIKE returns nothing
  if (rows.length === 0) {
    try {
      const ftsSql = `SELECT c.id, c.name, c.role_type, c.aliases, c.description,
                             w.name AS world_name
                      FROM characters_fts fts
                      JOIN characters c ON c.rowid = fts.rowid
                      LEFT JOIN worlds w ON w.id = c.world_id
                      WHERE characters_fts MATCH ?
                      ORDER BY c.name ASC LIMIT 20`;
      rows = queryAll(db, ftsSql, [query]);
    } catch {
      // FTS MATCH may fail on certain terms — silently fall through
    }
  }

  if (rows.length === 0) {
    return `未找到包含「${query}」的角色。`;
  }

  const roleLabels: Record<string, string> = {
    protagonist: "主角",
    support: "配角",
    antagonist: "反派",
    npc: "NPC",
  };

  const lines: string[] = [`找到 ${rows.length} 个角色：`, ""];
  for (const row of rows) {
    const roleLabel =
      roleLabels[String(row.role_type ?? "")] ?? String(row.role_type);
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(String(row.aliases ?? "[]"));
    } catch {
      aliases = [];
    }
    const aliasStr =
      aliases.length > 0 ? `（别名：${aliases.join("、")}）` : "";
    const worldStr = row.world_name ? `[${row.world_name}]` : "";
    lines.push(`- [[${row.name}]]${aliasStr} — ${roleLabel} ${worldStr}`);
  }
  return lines.join("\n");
}

/** Search chapters by title (FTS4 MATCH with LIKE fallback). */
function searchChapters(db: Database, query: string): string {
  // Try FTS4 MATCH first
  let rows: Record<string, unknown>[] = [];
  try {
    const ftsSql = `SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num,
                           ch.word_count, ch.status, a.name AS arc_name
                    FROM chapters_fts fts
                    JOIN chapters ch ON ch.rowid = fts.rowid
                    LEFT JOIN arcs a ON a.id = ch.arc_id
                    WHERE chapters_fts MATCH ?
                    ORDER BY ch.volume_num, ch.chapter_num LIMIT 20`;
    rows = queryAll(db, ftsSql, [query]);
  } catch {
    // FTS MATCH failed — fall through to LIKE
  }

  // LIKE fallback
  if (rows.length === 0) {
    const pattern = `%${query}%`;
    const likeSql = `SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num,
                            ch.word_count, ch.status, a.name AS arc_name
                     FROM chapters ch
                     LEFT JOIN arcs a ON a.id = ch.arc_id
                     WHERE ch.title LIKE ?
                     ORDER BY ch.volume_num, ch.chapter_num LIMIT 20`;
    rows = queryAll(db, likeSql, [pattern]);
  }

  if (rows.length === 0) {
    return `未找到标题包含「${query}」的章节。`;
  }

  const lines: string[] = [`找到 ${rows.length} 个章节：`, ""];
  for (const row of rows) {
    const arcStr = row.arc_name ? `[${row.arc_name}]` : "";
    lines.push(
      `- 第${row.volume_num}卷第${row.chapter_num}章「${row.title}」${arcStr} — ${row.word_count}字 [${row.status}]`,
    );
  }
  return lines.join("\n");
}

/** Search arcs by name or theme (LIKE). */
function searchArcs(db: Database, query: string): string {
  const pattern = `%${query}%`;
  const sql = `SELECT a.id, a.name, a.theme, a.difficulty, a.status,
                      w.name AS world_name
               FROM arcs a
               LEFT JOIN worlds w ON w.id = a.world_id
               WHERE a.name LIKE ? OR a.theme LIKE ?
               ORDER BY a.name LIMIT 20`;
  const rows = queryAll(db, sql, [pattern, pattern]);

  if (rows.length === 0) {
    return `未找到包含「${query}」的篇章。`;
  }

  const lines: string[] = [`找到 ${rows.length} 个篇章：`, ""];
  for (const row of rows) {
    const worldStr = row.world_name ? ` 所属世界: ${row.world_name}` : "";
    lines.push(
      `- [[${row.name}]] — 主题: ${row.theme} | 难度: ${row.difficulty} [${row.status}]${worldStr}`,
    );
  }
  return lines.join("\n");
}

/**
 * Search the links table for all connections involving a given entity.
 * For deeper queries ("role X出现在哪些篇章"), JOIN characters ↔ arcs
 * through the worlds table.
 */
function searchLinks(db: Database, query: string): string {
  // First try the links table directly
  const pattern = `%${query}%`;
  const linkSql = `SELECT id, source_file, target_file, link_type, created_at
                   FROM links
                   WHERE source_file LIKE ? OR target_file LIKE ?
                   ORDER BY created_at DESC LIMIT 30`;
  const linkRows = queryAll(db, linkSql, [pattern, pattern]);

  // Also try to resolve cross-entity relationships:
  // e.g. "张三出现在哪些篇章" → join characters → worlds → arcs
  const charCross = queryAll(
    db,
    `SELECT c.name AS character_name, w.name AS world_name, a.name AS arc_name
     FROM characters c
     JOIN worlds w ON w.id = c.world_id
     LEFT JOIN arcs a ON a.world_id = w.id
     WHERE c.name LIKE ? AND a.id IS NOT NULL
     ORDER BY c.name, a.name
     LIMIT 20`,
    [pattern],
  );

  const lines: string[] = [];

  if (linkRows.length > 0) {
    const typeLabels: Record<string, string> = {
      contains: "包含",
      arc_of: "篇章隶属于",
      character_in: "角色隶属于",
      reference: "引用",
    };

    lines.push(`找到 ${linkRows.length} 个直接关联：`, "");
    for (const row of linkRows) {
      const typeLabel =
        typeLabels[String(row.link_type ?? "")] ?? String(row.link_type);
      lines.push(
        `- ${row.source_file} → ${row.target_file} (${typeLabel})`,
      );
    }
  }

  if (charCross.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`找到 ${charCross.length} 个跨实体关联：`, "");
    for (const row of charCross) {
      lines.push(
        `- 角色 [[${row.character_name}]] 在「${row.world_name}」→ 篇章 [[${row.arc_name}]]`,
      );
    }
  }

  if (lines.length === 0) {
    return `未找到包含「${query}」的关联。`;
  }

  return lines.join("\n");
}

/** Search chapter_facts by description or entity_ref (LIKE). */
function searchChapterFacts(db: Database, query: string): string {
  const pattern = `%${query}%`;
  const sql = `SELECT cf.id, cf.fact_type, cf.entity_ref, cf.description,
                      cf.chapter_num, ch.title AS chapter_title
               FROM chapter_facts cf
               LEFT JOIN chapters ch ON ch.id = cf.chapter_id
               WHERE cf.description LIKE ? OR cf.entity_ref LIKE ?
               ORDER BY cf.chapter_num ASC LIMIT 20`;
  const rows = queryAll(db, sql, [pattern, pattern]);

  if (rows.length === 0) {
    return '';
  }

  const factTypeLabels: Record<string, string> = {
    new_character: '新角色登场',
    location_change: '位置变化',
    item_acquire: '获得物品',
    plot_advance: '剧情推进',
    combat_result: '战斗结果',
    relationship_change: '关系变化',
    state_change: '状态变化',
    hook_set: '伏笔设置',
    hook_payoff: '伏笔回收',
  };

  const lines: string[] = [`找到 ${rows.length} 条章节事实：`, ''];
  for (const row of rows) {
    const typeLabel = factTypeLabels[String(row.fact_type ?? '')] ?? String(row.fact_type);
    const entityStr = row.entity_ref ? `[${row.entity_ref}]` : '';
    const chapterStr = row.chapter_title
      ? `第${row.chapter_num}章「${row.chapter_title}」`
      : `第${row.chapter_num}章`;
    lines.push(
      `- ${chapterStr} ${entityStr} ${typeLabel}: ${String(row.description).slice(0, 60)}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Intent-based semantic search (Stage 1: coarse retrieval)
// ---------------------------------------------------------------------------

/** A single chapter candidate produced by Stage 1 retrieval. */
interface ChapterCandidate {
  id: string;
  title: string;
  chapter_num: number;
  volume_num: number;
  word_count: number;
  arc_name: string | null;
  /** First EXCERPT_MAX_CHARS characters of chapter body or summary. */
  excerpt: string;
  /** How we sourced the excerpt text. */
  excerpt_source: "file" | "summary" | "facts" | "fallback";
  /** Coarse relevance score 0-1 (1.0 = best). */
  relevance: number;
}

/**
 * Load a chapter body from disk. Returns the trimmed raw text body (without
 * YAML frontmatter) or `null` if the file does not exist.
 */
function loadChapterBody(
  projectRoot: string | undefined,
  volumeNum: number,
  chapterNum: number,
  title: string,
): string | null {
  if (!projectRoot) return null;
  // Match the writer's filename convention:
  // <root>/.novel-weaver/content/chapters/vol-<N>/ch<NN>-<slug>.md
  const slug = title
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
  const numStr = String(chapterNum).padStart(2, "0");
  const candidates = [
    path.join(projectRoot, ".novel-weaver", "content", "chapters", `vol-${volumeNum}`, `ch${numStr}-${slug}.md`),
    path.join(projectRoot, ".novel-weaver", "content", "chapters", `vol-${volumeNum}`, `ch${chapterNum}-${slug}.md`),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf-8");
      // Strip YAML frontmatter if present.
      const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
      return fmMatch ? raw.slice(fmMatch[0].length).trim() : raw.trim();
    } catch {
      // ignore — fall through to next candidate
    }
  }
  return null;
}

/**
 * Pick the best available excerpt text for a chapter.
 *
 * Priority:
 *   1. chapter_summaries row (summary_text) for the same chapter
 *   2. chapter_facts (joined, aggregated)
 *   3. Markdown file on disk (loadChapterBody)
 *   4. Empty excerpt (caller will surface a fallback)
 */
function pickChapterExcerpt(
  db: Database,
  projectRoot: string | undefined,
  chapterId: string,
  chapterNum: number,
  title: string,
  volumeNum: number,
): { excerpt: string; source: ChapterCandidate["excerpt_source"] } {
  // 1. chapter_summaries
  try {
    const sumRow = queryOne(
      db,
      `SELECT summary_text FROM chapter_summaries
       WHERE chapter_id = ? AND status = 'active'
       ORDER BY summary_level ASC, updated_at DESC LIMIT 1`,
      [chapterId],
    );
    if (sumRow && typeof sumRow.summary_text === "string" && sumRow.summary_text.length > 0) {
      return {
        excerpt: sumRow.summary_text.slice(0, EXCERPT_MAX_CHARS),
        source: "summary",
      };
    }
  } catch {
    // ignore
  }

  // 2. chapter_facts
  try {
    const factRows = queryAll(
      db,
      `SELECT fact_type, description FROM chapter_facts
       WHERE chapter_id = ?
       ORDER BY id ASC LIMIT 6`,
      [chapterId],
    );
    if (factRows.length > 0) {
      const text = factRows
        .map((r) => `[${String(r.fact_type)}] ${String(r.description)}`)
        .join("\n");
      return {
        excerpt: text.slice(0, EXCERPT_MAX_CHARS),
        source: "facts",
      };
    }
  } catch {
    // ignore
  }

  // 3. file on disk
  const body = loadChapterBody(projectRoot, volumeNum, chapterNum, title);
  if (body && body.length > 0) {
    return {
      excerpt: body.slice(0, EXCERPT_MAX_CHARS),
      source: "file",
    };
  }

  return { excerpt: "", source: "fallback" };
}

/**
 * Stage 1 coarse retrieval — find candidate chapters for a query.
 *
 * Strategy:
 *   1. Try FTS4 MATCH against chapters_fts (title only).
 *   2. Fall back to LIKE on title and join with arcs for context.
 *   3. Pull excerpt for each candidate (summary / facts / file).
 */
function findChapterCandidates(
  db: Database,
  query: string,
  projectRoot: string | undefined,
): ChapterCandidate[] {
  let rows: Record<string, unknown>[] = [];

  // 1. FTS4 MATCH against chapter titles
  try {
    const ftsSql = `SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num,
                           ch.word_count, a.name AS arc_name
                    FROM chapters_fts fts
                    JOIN chapters ch ON ch.rowid = fts.rowid
                    LEFT JOIN arcs a ON a.id = ch.arc_id
                    WHERE chapters_fts MATCH ?
                    ORDER BY ch.volume_num, ch.chapter_num
                    LIMIT ?`;
    rows = queryAll(db, ftsSql, [query, CANDIDATE_LIMIT]);
  } catch {
    // ignore — fall through to LIKE
  }

  // 2. LIKE fallback on title
  if (rows.length === 0) {
    const pattern = `%${query}%`;
    const likeSql = `SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num,
                            ch.word_count, a.name AS arc_name
                     FROM chapters ch
                     LEFT JOIN arcs a ON a.id = ch.arc_id
                     WHERE ch.title LIKE ?
                     ORDER BY ch.volume_num, ch.chapter_num
                     LIMIT ?`;
    rows = queryAll(db, likeSql, [pattern, CANDIDATE_LIMIT]);
  }

  // 3. Pull excerpt for each candidate
  const candidates: ChapterCandidate[] = rows.map((row, idx) => {
    const id = String(row.id ?? "");
    const chapterNum = Number(row.chapter_num ?? 0);
    const volumeNum = Number(row.volume_num ?? 0);
    const title = String(row.title ?? "");
    const { excerpt, source } = pickChapterExcerpt(
      db,
      projectRoot,
      id,
      chapterNum,
      title,
      volumeNum,
    );
    // Earlier matches = higher relevance; first hit ≈ 0.95, last ≈ 0.40.
    const relevance = Math.max(0.4, 0.95 - idx * (0.55 / Math.max(rows.length, 1)));
    return {
      id,
      title,
      chapter_num: chapterNum,
      volume_num: volumeNum,
      word_count: Number(row.word_count ?? 0),
      arc_name: row.arc_name ? String(row.arc_name) : null,
      excerpt,
      excerpt_source: source,
      relevance: Number(relevance.toFixed(2)),
    };
  });

  return candidates;
}

// ---------------------------------------------------------------------------
// Stage 2: structured answer builder for semantic intents
// ---------------------------------------------------------------------------

interface SemanticCitation {
  chapter_id: string;
  chapter_num: number;
  volume_num: number;
  title: string;
  excerpt: string;
  relevance: number;
}

/** Trim an excerpt to the nearest sentence/character boundary near N chars. */
function trimExcerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const lastPunct = Math.max(
    sliced.lastIndexOf("。"),
    sliced.lastIndexOf("！"),
    sliced.lastIndexOf("？"),
    sliced.lastIndexOf("\n"),
  );
  if (lastPunct > max * 0.5) return sliced.slice(0, lastPunct + 1);
  return sliced + "…";
}

/** Build a recall/relation answer string from candidate chapters. */
function buildCandidateAnswer(
  intentLabel: string,
  query: string,
  citations: SemanticCitation[],
): string {
  if (citations.length === 0) {
    return `【${intentLabel}】${query}\n\n未找到匹配的章节。`;
  }
  const header = `【${intentLabel}】${query}`;
  const summary = `\n找到 ${citations.length} 个候选章节，请综合以下内容回答：\n`;
  const blocks = citations.map((c) => {
    const arc = c.title;
    const label = `第${c.volume_num}卷第${c.chapter_num}章「${arc}」（相关度 ${c.relevance.toFixed(2)}）`;
    const body = c.excerpt ? trimExcerpt(c.excerpt, EXCERPT_MAX_CHARS) : "（无内容摘要）";
    return `\n---\n${label}\n${body}`;
  });
  return [header, summary, ...blocks].join("\n");
}

/** Build a summary preview list across the first N chapters. */
function buildSummaryPreviews(
  rows: Array<{ id: string; title: string; chapter_num: number; volume_num: number; arc_name: string | null }>,
  excerpts: Map<string, string>,
): string {
  if (rows.length === 0) return "暂无章节。";
  const blocks = rows.map((r) => {
    const excerpt = trimExcerpt(excerpts.get(r.id) ?? "", SUMMARY_PREVIEW_CHARS);
    const label = `第${r.volume_num}卷第${r.chapter_num}章「${r.title}」${r.arc_name ? ` [${r.arc_name}]` : ""}`;
    return `\n---\n${label}\n${excerpt || "（无内容）"}`;
  });
  return [`找到 ${rows.length} 个章节：`, ...blocks].join("\n");
}

// ---------------------------------------------------------------------------
// Intent-based handlers
// ---------------------------------------------------------------------------

function handleRecall(
  db: Database,
  query: string,
  projectRoot: string | undefined,
): { output: string; citations: SemanticCitation[] } {
  const candidates = findChapterCandidates(db, query, projectRoot);
  const citations: SemanticCitation[] = candidates.slice(0, SEMANTIC_RESULT_LIMIT).map((c) => ({
    chapter_id: c.id,
    chapter_num: c.chapter_num,
    volume_num: c.volume_num,
    title: c.title,
    excerpt: c.excerpt,
    relevance: c.relevance,
  }));
  // Try to record usage when a resolver is available; never block on failure.
  const resolver = tryGetModelResolver();
  if (resolver) {
    try {
      resolver.recordUsage("query", query.length + JSON.stringify(citations).length, 0);
    } catch {
      // ignore — usage tracking is best-effort
    }
  }
  return {
    output: buildCandidateAnswer("回忆", query, citations),
    citations,
  };
}

function handleRelation(
  db: Database,
  query: string,
  projectRoot: string | undefined,
): { output: string; citations: SemanticCitation[]; characterMatches: Array<{ id: string; name: string; description: string }> } {
  // 1. Coarse chapter retrieval (recalls staged over chapter titles + bodies).
  const candidates = findChapterCandidates(db, query, projectRoot);
  const citations: SemanticCitation[] = candidates.slice(0, SEMANTIC_RESULT_LIMIT).map((c) => ({
    chapter_id: c.id,
    chapter_num: c.chapter_num,
    volume_num: c.volume_num,
    title: c.title,
    excerpt: c.excerpt,
    relevance: c.relevance,
  }));

  // 2. Also surface character descriptions / aliases that match the query.
  //    This makes "主角和师父的关系变化" find both the protagonist
  //    and the master before the outer LLM synthesises the timeline.
  const pattern = `%${query}%`;
  const charRows = queryAll(
    db,
    `SELECT id, name, description, aliases FROM characters
     WHERE name LIKE ? OR aliases LIKE ? OR description LIKE ?
     LIMIT ?`,
    [pattern, pattern, pattern, SEMANTIC_RESULT_LIMIT],
  );
  const characterMatches = charRows
    .filter((r) => r.description != null)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ""),
    }));

  const resolver = tryGetModelResolver();
  if (resolver) {
    try {
      resolver.recordUsage(
        "query",
        query.length + JSON.stringify(citations).length + JSON.stringify(characterMatches).length,
        0,
      );
    } catch {
      // ignore
    }
  }

  const header = `【关系】${query}`;
  const summary =
    `\n找到 ${citations.length} 个候选章节` +
    (characterMatches.length > 0 ? `、${characterMatches.length} 个匹配角色` : "") +
    `，请综合以下内容回答：\n`;
  const chapterBlocks = citations.map((c) => {
    const label = `第${c.volume_num}卷第${c.chapter_num}章「${c.title}」（相关度 ${c.relevance.toFixed(2)}）`;
    const body = c.excerpt ? trimExcerpt(c.excerpt, EXCERPT_MAX_CHARS) : "（无内容摘要）";
    return `\n---\n${label}\n${body}`;
  });
  const charBlocks = characterMatches.map((c) => {
    const body = c.description ? trimExcerpt(c.description, EXCERPT_MAX_CHARS) : "（无描述）";
    return `\n---\n角色 [[${c.name}]]\n${body}`;
  });
  const output =
    citations.length === 0 && characterMatches.length === 0
      ? `${header}\n\n未找到匹配的章节或角色。`
      : [header, summary, ...chapterBlocks, ...charBlocks].join("\n");

  return { output, citations, characterMatches };
}

function handleDefinition(
  db: Database,
  query: string,
): string {
  // Search world/character yaml_metadata first
  const worldPattern = `%${query}%`;
  const worldRows = queryAll(
    db,
    `SELECT id, name, yaml_metadata FROM worlds
     WHERE name LIKE ? OR yaml_metadata LIKE ?
     LIMIT 20`,
    [worldPattern, worldPattern],
  );
  if (worldRows.length > 0) {
    const lines: string[] = [`【定义】${query}`, "", "找到以下世界/设定匹配："];
    for (const row of worldRows) {
      let desc = "";
      let def: string | undefined;
      try {
        const meta = JSON.parse(String(row.yaml_metadata ?? "{}"));
        desc = typeof meta.description === "string" ? meta.description : "";
        def = typeof meta.definition === "string" ? meta.definition : undefined;
      } catch {
        // ignore
      }
      const body = def ?? desc ?? "";
      lines.push(`- [[${row.name}]]${body ? ` — ${trimExcerpt(body, 120)}` : ""}`);
    }
    return lines.join("\n");
  }

  // Fall back to characters
  const charPattern = `%${query}%`;
  const charRows = queryAll(
    db,
    `SELECT id, name, description FROM characters
     WHERE name LIKE ? OR description LIKE ?
     LIMIT 20`,
    [charPattern, charPattern],
  );
  if (charRows.length > 0) {
    const lines: string[] = [`【定义】${query}`, "", "找到以下角色/概念匹配："];
    for (const row of charRows) {
      const desc = String(row.description ?? "");
      lines.push(`- [[${row.name}]]${desc ? ` — ${trimExcerpt(desc, 120)}` : ""}`);
    }
    return lines.join("\n");
  }

  // Fall back to chapter_facts — structured fact mentions (e.g. setting / item definitions)
  const factPattern = `%${query}%`;
  const factRows = queryAll(
    db,
    `SELECT cf.id, cf.fact_type, cf.entity_ref, cf.description,
            cf.chapter_num, ch.title AS chapter_title
     FROM chapter_facts cf
     LEFT JOIN chapters ch ON ch.id = cf.chapter_id
     WHERE cf.description LIKE ? OR cf.entity_ref LIKE ?
     ORDER BY cf.chapter_num ASC LIMIT 20`,
    [factPattern, factPattern],
  );
  if (factRows.length > 0) {
    const lines: string[] = [`【定义】${query}`, "", "找到以下章节事实匹配："];
    for (const row of factRows) {
      const entityStr = row.entity_ref ? `[${row.entity_ref}]` : "";
      const chapterStr = row.chapter_title
        ? `第${row.chapter_num}章「${row.chapter_title}」`
        : `第${row.chapter_num}章`;
      lines.push(
        `- ${chapterStr} ${entityStr} ${String(row.fact_type)}: ${trimExcerpt(String(row.description), 120)}`,
      );
    }
    return lines.join("\n");
  }

  // Last fallback: chapter title FTS
  return `【定义】${query}\n\n未在世界/角色/章节事实中匹配到；回退到章节检索：\n\n` +
    searchChapters(db, query);
}

function handleSummary(
  db: Database,
  query: string,
  projectRoot: string | undefined,
  limit: number = SUMMARY_DEFAULT_CHAPTERS,
): string {
  // Pull first N chapters in volume/chapter order
  const rows = queryAll(
    db,
    `SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num, a.name AS arc_name
     FROM chapters ch
     LEFT JOIN arcs a ON a.id = ch.arc_id
     ORDER BY ch.volume_num ASC, ch.chapter_num ASC
     LIMIT ?`,
    [limit],
  );

  // Optionally filter rows by query if query looks like a topic
  const filtered = query
    ? rows.filter((r) => String(r.title ?? "").includes(query))
    : rows;
  const target = filtered.length > 0 ? filtered : rows;

  const excerpts = new Map<string, string>();
  for (const r of target) {
    const id = String(r.id);
    const { excerpt } = pickChapterExcerpt(
      db,
      projectRoot,
      id,
      Number(r.chapter_num ?? 0),
      String(r.title ?? ""),
      Number(r.volume_num ?? 0),
    );
    excerpts.set(id, excerpt);
  }

  return `【摘要】${query || "项目总览"}\n\n` +
    buildSummaryPreviews(
      target.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        chapter_num: Number(r.chapter_num ?? 0),
        volume_num: Number(r.volume_num ?? 0),
        arc_name: r.arc_name ? String(r.arc_name) : null,
      })),
      excerpts,
    );
}

// ===========================================================================
// Tool: novel_query
// ===========================================================================

export const novel_query = tool({
  description:
    "智能查询工具。根据自然语言查询在角色、世界、章节、篇章和关联中搜索项目信息，返回格式化结果。支持自动识别查询意图，以及基于意图（回忆/关系/定义/摘要）的语义检索。",
  args: {
    query: z.string().describe("搜索关键词，支持自然语言描述"),
    type: z
      .enum(["auto", "world", "character", "chapter", "arc", "link"])
      .default("auto")
      .describe(
        "搜索范围：auto 自动识别, world 世界观/设定, character 角色, chapter 章节, arc 篇章, link 关联",
      ),
    intent: z
      .enum(["search", "recall", "relation", "definition", "summary"])
      .default("search")
      .describe(
        "查询意图: search 关键词搜索, recall 回忆检索, relation 关系查询, definition 定义查询, summary 摘要查询",
      ),
  },
  async execute(args, context) {
    const db = getDatabase();
    if (!db) {
      return { output: "错误：数据库未初始化。" };
    }

    const query = String(args.query).trim();
    if (!query) {
      return { output: "请提供搜索关键词。" };
    }

    const searchType = args.type === "auto" ? detectType(query) : args.type;
    const intent = args.intent ?? "search";
    const projectRoot = context?.directory;

    // -----------------------------------------------------------------------
    // Intent-based semantic search (recalls the structured return shape)
    // -----------------------------------------------------------------------
    if (intent !== "search") {
      switch (intent) {
        case "recall": {
          const { output, citations } = handleRecall(db, query, projectRoot);
          if (citations.length === 0) {
            return {
              output,
              metadata: {
                query,
                intent,
                type: searchType,
                citations: [],
                candidate_count: 0,
              },
            };
          }
          return {
            output,
            metadata: {
              query,
              intent,
              type: searchType,
              citations: citations.map((c) => ({
                chapter_id: c.chapter_id,
                chapter_num: c.chapter_num,
                volume_num: c.volume_num,
                title: c.title,
                excerpt: c.excerpt,
                relevance: c.relevance,
              })),
              candidate_count: citations.length,
            },
          };
        }
        case "relation": {
          const { output, citations, characterMatches } = handleRelation(
            db,
            query,
            projectRoot,
          );
          if (citations.length === 0 && characterMatches.length === 0) {
            return {
              output,
              metadata: {
                query,
                intent,
                type: searchType,
                citations: [],
                characters: [],
                candidate_count: 0,
              },
            };
          }
          return {
            output,
            metadata: {
              query,
              intent,
              type: searchType,
              citations: citations.map((c) => ({
                chapter_id: c.chapter_id,
                chapter_num: c.chapter_num,
                volume_num: c.volume_num,
                title: c.title,
                excerpt: c.excerpt,
                relevance: c.relevance,
              })),
              characters: characterMatches.map((c) => ({
                character_id: c.id,
                name: c.name,
                description: c.description,
              })),
              candidate_count: citations.length + characterMatches.length,
            },
          };
        }
        case "definition": {
          const output = handleDefinition(db, query);
          return {
            output,
            metadata: {
              query,
              intent,
              type: searchType,
              answer: output,
            },
          };
        }
        case "summary": {
          const output = handleSummary(db, query, projectRoot);
          return {
            output,
            metadata: {
              query,
              intent,
              type: searchType,
              answer: output,
            },
          };
        }
        default: {
          // Should not happen given the enum constraint.
          return { output: `错误：未知 intent「${intent}」。` };
        }
      }
    }

    // -----------------------------------------------------------------------
    // Default: classic keyword search (preserved from the previous behavior)
    // -----------------------------------------------------------------------
    const typeLabels: Record<string, string> = {
      world: "世界观",
      character: "角色",
      chapter: "章节",
      arc: "篇章",
      link: "关联",
    };

    let result: string;
    switch (searchType) {
      case "world":
        result = searchWorlds(db, query);
        break;
      case "character":
        result = searchCharacters(db, query);
        break;
      case "chapter":
        result = searchChapters(db, query);
        break;
      case "arc":
        result = searchArcs(db, query);
        break;
      case "link":
        result = searchLinks(db, query);
        break;
      default:
        result = searchCharacters(db, query);
    }

    const label = typeLabels[searchType] ?? searchType;

    // Also search chapter_facts when querying characters or chapters
    let factsResult = '';
    if (searchType === 'character' || searchType === 'chapter') {
      factsResult = searchChapterFacts(db, query);
    }

    const outputParts = [`【${label}搜索】「${query}」`, '', result];
    if (factsResult) {
      outputParts.push('', '---', '', factsResult);
    }

    return {
      output: outputParts.join('\n'),
      metadata: {
        query,
        intent,
        type: searchType,
        detected_type: args.type === "auto" ? searchType : undefined,
        chapter_facts_found: factsResult ? true : false,
      },
    };
  },
});

// ===========================================================================
// Tool: novel_stats
// ===========================================================================

export const novel_stats = tool({
  description:
    "写作统计工具。获取总体写作进度（总字数、章节数、篇章数、角色数、完成度百分比）或各篇章详细统计。",
  args: {
    scope: z
      .enum(["overall", "arc", "timeline"])
      .default("overall")
      .describe(
        "统计范围：overall 全局统计, arc 按篇章统计, timeline 时间线统计（V2 提供）",
      ),
  },
  async execute(args, _context) {
    const db = getDatabase();
    if (!db) {
      return { output: "错误：数据库未初始化。" };
    }

    if (args.scope === "timeline") {
      return {
        output: "时间线统计功能将在 V2 版本提供，敬请期待。",
        metadata: { scope: "timeline", available: false },
      };
    }

    // -----------------------------------------------------------------------
    // Per-arc stats
    // -----------------------------------------------------------------------
    if (args.scope === "arc") {
      const arcs = queryAll(
        db,
        `SELECT a.id, a.name, a.status,
                COUNT(ch.id) AS chapter_count,
                COALESCE(SUM(ch.word_count), 0) AS total_words
         FROM arcs a
         LEFT JOIN chapters ch ON ch.arc_id = a.id
         GROUP BY a.id
         ORDER BY a.name`,
        [],
      );

      // Aggregate progress per arc
      const progressRows = queryAll(
        db,
        `SELECT arc_id,
                COUNT(*) AS total_steps,
                SUM(completed) AS completed_steps
         FROM progress
         GROUP BY arc_id`,
        [],
      );
      const progressMap = new Map<string, { total: number; done: number }>();
      for (const pr of progressRows) {
        progressMap.set(String(pr.arc_id), {
          total: Number(pr.total_steps ?? 0),
          done: Number(pr.completed_steps ?? 0),
        });
      }

      if (arcs.length === 0) {
        return {
          output: "暂无篇章数据。",
          metadata: { scope: "arc", arcs: [] },
        };
      }

      const lines: string[] = [
        `找到 ${arcs.length} 个篇章：`,
        "",
      ];
      for (const a of arcs) {
        const prog = progressMap.get(String(a.id));
        const progressPct =
          prog && prog.total > 0
            ? Math.round((prog.done / prog.total) * 100)
            : 0;
        lines.push(
          `- [[${a.name}]] — ${a.chapter_count}章 / ${a.total_words}字 / 进度${progressPct}% [${a.status}]`,
        );
      }

      return {
        output: lines.join("\n"),
        metadata: {
          scope: "arc",
          arc_count: arcs.length,
          arcs: arcs.map((a) => ({
            id: String(a.id),
            name: String(a.name),
            chapter_count: Number(a.chapter_count ?? 0),
            total_words: Number(a.total_words ?? 0),
            status: String(a.status),
          })),
        },
      };
    }

    // -----------------------------------------------------------------------
    // Overall stats
    // -----------------------------------------------------------------------

    const chapterCount = queryOne(
      db,
      "SELECT COUNT(*) AS cnt FROM chapters",
      [],
    );
    const totalWords = queryOne(
      db,
      "SELECT COALESCE(SUM(word_count), 0) AS total FROM chapters",
      [],
    );
    const arcCount = queryOne(
      db,
      "SELECT COUNT(*) AS cnt FROM arcs",
      [],
    );
    const characterCount = queryOne(
      db,
      "SELECT COUNT(*) AS cnt FROM characters",
      [],
    );
    const worldCount = queryOne(
      db,
      "SELECT COUNT(*) AS cnt FROM worlds",
      [],
    );

    // Overall completion rate across all arcs
    const progressOverall = queryOne(
      db,
      `SELECT COUNT(*) AS total_steps,
              COALESCE(SUM(completed), 0) AS completed_steps
       FROM progress`,
      [],
    );
    const totalSteps = Number(progressOverall?.total_steps ?? 0);
    const completedSteps = Number(progressOverall?.completed_steps ?? 0);
    const completionPct =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const lines: string[] = [
      "全局写作统计",
      "",
      `- 章节总数：${Number(chapterCount?.cnt ?? 0)}`,
      `- 总字数：${Number(totalWords?.total ?? 0)}`,
      `- 篇章总数：${Number(arcCount?.cnt ?? 0)}`,
      `- 角色总数：${Number(characterCount?.cnt ?? 0)}`,
      `- 世界总数：${Number(worldCount?.cnt ?? 0)}（核心 + 篇章）`,
      `- 整体完成度：${completionPct}%`,
    ];

    return {
      output: lines.join("\n"),
      metadata: {
        scope: "overall",
        chapter_count: Number(chapterCount?.cnt ?? 0),
        total_words: Number(totalWords?.total ?? 0),
        arc_count: Number(arcCount?.cnt ?? 0),
        character_count: Number(characterCount?.cnt ?? 0),
        world_count: Number(worldCount?.cnt ?? 0),
        completion_pct: completionPct,
      },
    };
  },
});
