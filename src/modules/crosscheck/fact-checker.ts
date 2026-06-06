/**
 * novel-weaver Cross-Chapter Fact Conflict Detection Engine
 *
 * 7 detection functions for identifying continuity conflicts across chapters:
 *  1. Temporal conflicts   — character appears after death without revival
 *  2. Location conflicts   — character in two places at the same time
 *  3. Power level conflicts — power jumps without explanation
 *  4. Relationship conflicts — relationship reversals without transition
 *  5. Item conflicts        — items used before acquired
 *  6. Fact contradictions   — incompatible facts for same entity
 *  7. Unresolved hooks      — hook_set without hook_payoff after N chapters
 *
 * All queries are synchronous (sql.js). No LLM calls.
 *
 * @packageDocumentation
 */

import { getDatabase } from '../../db/index.js';
import { generateWikilink } from '../../md/wikilink.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity level for a cross-chapter conflict. */
export type ConflictSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

/** A single chapter reference used in conflict proof. */
export interface ChapterRef {
  chapterNum: number;
  title?: string;
}

/** A single cross-chapter conflict found during scanning. */
export interface CrosscheckConflict {
  type: string;
  severity: ConflictSeverity;
  description: string;
  chapterRefs: ChapterRef[];
  proof: string;
  entityRefs: string[];
}

/** Summary statistics for a crosscheck run. */
export interface CrosscheckSummary {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<ConflictSeverity, number>;
  scope: string;
  arcName?: string;
}

/** Top-level result from runAllChecks(). */
export interface CrosscheckResult {
  conflicts: CrosscheckConflict[];
  summary: CrosscheckSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a prepared SELECT and return all rows as objects. */
function queryAll(
  db: ReturnType<typeof getDatabase>,
  sql: string,
  params: unknown[],
): Record<string, unknown>[] {
  if (!db) return [];
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
    console.error(
      `[novel-weaver] queryAll failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/** Try to extract a numeric value from a power level string (e.g. "Level 5" → 5). */
function extractPowerValue(powerLevel: string | null): number | null {
  if (!powerLevel) return null;
  const match = powerLevel.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/** Keywords indicating death in combat_result descriptions or status_tags. */
const DEATH_KEYWORDS = [
  '死亡', '击杀', '陨落', '阵亡', '战死', '牺牲', '身亡',
];

function containsDeathKeyword(text: string): boolean {
  return DEATH_KEYWORDS.some((kw) => text.includes(kw));
}

/** Keywords indicating revival / resurrection. */
const REVIVAL_KEYWORDS = ['复活', '重生', '复苏', '复生', '还魂', '转生', '回生'];

function containsRevivalKeyword(text: string): boolean {
  return REVIVAL_KEYWORDS.some((kw) => text.includes(kw));
}

/** Build the WHERE clause suffix for arc filtering (with params). */
function arcFilter(
  arcId?: string,
  tableAlias: string = 'c',
): { clause: string; params: unknown[] } {
  if (!arcId) return { clause: '', params: [] };
  return { clause: ` AND ${tableAlias}.arc_id = ?`, params: [arcId] };
}

/** Attempt to parse a JSON string, returning undefined on failure. */
function tryParseJSON<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Temporal Conflicts — character appears after death without revival
// ═══════════════════════════════════════════════════════════════════════════

export function detectTemporalConflicts(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Find combat_result facts where entity "died"
  const { clause: deathClause, params: deathParams } = arcFilter(arcId);
  const deathSql = `
    SELECT f.id, f.entity_ref, f.description, f.chapter_num
    FROM chapter_facts f
    JOIN chapters c ON f.chapter_id = c.id
    WHERE f.fact_type = 'combat_result'
      AND f.description IS NOT NULL
      ${deathClause}
    ORDER BY f.chapter_num
  `;
  const combatFacts = queryAll(db, deathSql, deathParams);

  const deathFacts = combatFacts.filter(
    (r) => r.description && containsDeathKeyword(String(r.description)),
  );
  if (deathFacts.length === 0) return conflicts;

  for (const death of deathFacts) {
    const entityRef = String(death.entity_ref ?? '');
    const deathChapter = Number(death.chapter_num);
    if (!entityRef) continue;

    // Look for later facts with the same entity_ref that are NOT revival
    const { clause: laterClause, params: laterParams } = arcFilter(arcId);
    const laterSql = `
      SELECT f.id, f.fact_type, f.description, f.chapter_num
      FROM chapter_facts f
      JOIN chapters c ON f.chapter_id = c.id
      WHERE f.entity_ref = ?
        AND f.id != ?
        AND f.chapter_num > ?
        ${laterClause}
      ORDER BY f.chapter_num
    `;
    const laterFacts = queryAll(db, laterSql, [
      entityRef,
      String(death.id),
      deathChapter,
      ...laterParams,
    ]);

    let hasRevival = false;
    const reappearances: Array<{ chapterNum: number; description: string }> = [];

    for (const fact of laterFacts) {
      const desc = String(fact.description ?? '');
      const fType = String(fact.fact_type ?? '');

      if (
        containsRevivalKeyword(desc) &&
        (fType === 'state_change' || fType === 'plot_advance')
      ) {
        hasRevival = true;
        break;
      }

      // Non-explanation facts after death count as reappearance
      if (fType !== 'state_change' && fType !== 'plot_advance') {
        reappearances.push({
          chapterNum: Number(fact.chapter_num),
          description: desc,
        });
      }
    }

    if (!hasRevival && reappearances.length > 0) {
      const first = reappearances[0];
      // Also check character_states for the same entity
      const csSql = `
        SELECT cs.chapter_num, cs.status_tags
        FROM character_states cs
        JOIN chapters c ON cs.chapter_id = c.id
        WHERE cs.character_id = (SELECT id FROM characters WHERE name = ? LIMIT 1)
          AND cs.chapter_num > ?
          ${arcFilter(arcId, 'c').clause}
        ORDER BY cs.chapter_num
        LIMIT 1
      `;
      const csParams: unknown[] = [entityRef, deathChapter, ...arcFilter(arcId, 'c').params];
      const csRows = queryAll(db, csSql, csParams);
      let stillDead = false;
      for (const row of csRows) {
        const tags = tryParseJSON<string[]>(String(row.status_tags ?? ''));
        if (tags && tags.some((t) => containsDeathKeyword(t))) {
          stillDead = true;
        }
      }
      // If character_states also shows them alive, or there's no state data,
      // flag the conflict
      if (!stillDead) {
        conflicts.push({
          type: 'temporal',
          severity: 'BLOCKER',
          description: `角色 ${generateWikilink(entityRef)} 在第 ${deathChapter} 章死亡（${String(death.description ?? '')}），但第 ${first.chapterNum} 章再次出现且无复活解释`,
          chapterRefs: [
            { chapterNum: deathChapter },
            { chapterNum: first.chapterNum },
          ],
          proof: `死亡记录：${String(death.description ?? '')}\n再出现：${first.description}`,
          entityRefs: [entityRef],
        });
      }
    }
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Location Conflicts — character in two places at the same time
// ═══════════════════════════════════════════════════════════════════════════

export function detectLocationConflicts(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Find character_states where the same character has multiple locations
  // within the same chapter_num
  let sql = `
    SELECT cs1.character_id, cs1.chapter_num, cs1.location AS loc1,
           cs2.location AS loc2, cs1.id AS id1, cs2.id AS id2
    FROM character_states cs1
    JOIN character_states cs2 ON cs1.character_id = cs2.character_id
                             AND cs1.chapter_num = cs2.chapter_num
                             AND cs1.id < cs2.id
    JOIN chapters c ON cs1.chapter_id = c.id
    WHERE cs1.location IS NOT NULL
      AND cs2.location IS NOT NULL
      AND cs1.location != cs2.location
  `;
  const params: unknown[] = [];
  if (arcId) {
    sql += ' AND c.arc_id = ?';
    params.push(arcId);
  }
  sql += ' ORDER BY cs1.chapter_num';

  const locationRows = queryAll(db, sql, params);

  // Deduplicate by character+chapter
  const seen = new Set<string>();
  for (const row of locationRows) {
    const charId = String(row.character_id ?? '');
    const chapterNum = Number(row.chapter_num);
    const loc1 = String(row.loc1 ?? '');
    const loc2 = String(row.loc2 ?? '');
    const key = `${charId}:${chapterNum}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Resolve charId to name
    const nameRow = queryAll(
      db,
      'SELECT name FROM characters WHERE id = ? LIMIT 1',
      [charId],
    );
    const charName = nameRow.length > 0 ? String(nameRow[0].name ?? charId) : charId;

    conflicts.push({
      type: 'location',
      severity: 'WARNING',
      description: `角色 ${generateWikilink(charName)} 在第 ${chapterNum} 章同时出现在两个地点：${loc1} 和 ${loc2}`,
      chapterRefs: [{ chapterNum }],
      proof: `地点1：${loc1}\n地点2：${loc2}`,
      entityRefs: [charName],
    });
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Power Level Conflicts — power jumps without breakthrough explanation
// ═══════════════════════════════════════════════════════════════════════════

export function detectPowerLevelConflicts(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Get all character_states ordered by character + chapter
  let sql = `
    SELECT cs.character_id, cs.chapter_num, cs.power_level, cs.chapter_id
    FROM character_states cs
    JOIN chapters c ON cs.chapter_id = c.id
    WHERE cs.power_level IS NOT NULL
  `;
  const params: unknown[] = [];
  if (arcId) {
    sql += ' AND c.arc_id = ?';
    params.push(arcId);
  }
  sql += ' ORDER BY cs.character_id, cs.chapter_num';

  const rows = queryAll(db, sql, params);

  // Group by character
  const byChar = new Map<string, Array<{ chapterNum: number; powerLevel: string; chapterId: string }>>();
  for (const row of rows) {
    const charId = String(row.character_id ?? '');
    const entry = {
      chapterNum: Number(row.chapter_num),
      powerLevel: String(row.power_level ?? ''),
      chapterId: String(row.chapter_id ?? ''),
    };
    const arr = byChar.get(charId) ?? [];
    arr.push(entry);
    byChar.set(charId, arr);
  }

  for (const [charId, entries] of byChar) {
    // Resolve character name
    const nameRow = queryAll(
      db,
      'SELECT name FROM characters WHERE id = ? LIMIT 1',
      [charId],
    );
    const charName = nameRow.length > 0 ? String(nameRow[0].name ?? charId) : charId;

    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];
      const prevVal = extractPowerValue(prev.powerLevel);
      const currVal = extractPowerValue(curr.powerLevel);

      // Skip if we can't extract numeric values from both
      if (prevVal === null || currVal === null) {
        // Fallback: string change detection when power level text changed
        if (prev.powerLevel !== curr.powerLevel) {
          // Check for breakthrough explanation fact between these chapters
          const explainSql = `
            SELECT COUNT(*) AS cnt
            FROM chapter_facts f
            JOIN chapters c ON f.chapter_id = c.id
            WHERE f.entity_ref = ?
              AND f.fact_type IN ('state_change', 'plot_advance')
              AND f.chapter_num > ?
              AND f.chapter_num <= ?
          `;
          const explainParams: unknown[] = [charName, prev.chapterNum, curr.chapterNum];
          if (arcId) {
            explainSql.replace/* won't work, use dynamic */;
          }
          const explainRows = queryAll(db, explainSql, explainParams);
          const hasExplanation = explainRows.length > 0 && Number(explainRows[0].cnt ?? 0) > 0;

          if (!hasExplanation) {
            conflicts.push({
              type: 'power_level',
              severity: 'WARNING',
              description: `角色 ${generateWikilink(charName)} 在第 ${curr.chapterNum} 章战力从「${prev.powerLevel}」变为「${curr.powerLevel}」但缺乏突破/升级解释`,
              chapterRefs: [
                { chapterNum: prev.chapterNum },
                { chapterNum: curr.chapterNum },
              ],
              proof: `之前：${prev.powerLevel}（第 ${prev.chapterNum} 章）\n之后：${curr.powerLevel}（第 ${curr.chapterNum} 章）`,
              entityRefs: [charName],
            });
          }
        }
        continue;
      }

      // Check for large power jumps
      const ratio = currVal / prevVal;
      const needsExplanation = ratio > 2.0; // > 2x increase needs explanation

      if (needsExplanation || (currVal > prevVal && prev.powerLevel !== curr.powerLevel)) {
        // Check for breakthrough facts between these chapters
        const explainSql = `
          SELECT COUNT(*) AS cnt
          FROM chapter_facts f
          JOIN chapters c ON f.chapter_id = c.id
          WHERE f.entity_ref = ?
            AND f.fact_type IN ('state_change', 'plot_advance')
            AND f.chapter_num > ?
            AND f.chapter_num <= ?
        `;
        const explainParams: unknown[] = [charName, prev.chapterNum, curr.chapterNum];
        if (arcId) {
          explainParams.push(arcId);
        }
        let explainSqlFinal = explainSql;
        if (arcId) {
          explainSqlFinal += ' AND c.arc_id = ?';
        }
        const explainRows = queryAll(db, explainSqlFinal, explainParams);
        const hasExplanation = explainRows.length > 0 && Number(explainRows[0].cnt ?? 0) > 0;

        if (!hasExplanation) {
          const severity: ConflictSeverity = ratio > 2.0 ? 'BLOCKER' : 'WARNING';
          conflicts.push({
            type: 'power_level',
            severity,
            description: `角色 ${generateWikilink(charName)} 在第 ${curr.chapterNum} 章战力从 ${prevVal} 提升至 ${currVal}（${ratio.toFixed(1)}x）但缺乏突破解释`,
            chapterRefs: [
              { chapterNum: prev.chapterNum },
              { chapterNum: curr.chapterNum },
            ],
            proof: `之前：${prev.powerLevel}（第 ${prev.chapterNum} 章）\n之后：${curr.powerLevel}（第 ${curr.chapterNum} 章）`,
            entityRefs: [charName],
          });
        }
      }
    }
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Relationship Conflicts — relationship reversals without transition
// ═══════════════════════════════════════════════════════════════════════════

// Opposing relationship type pairs that would be contradictory without transition.
const OPPOSING_RELATIONS: Record<string, string> = {
  enemy: 'ally',
  ally: 'enemy',
  hostile: 'friendly',
  friendly: 'hostile',
  rival: 'friend',
  friend: 'rival',
};

export function detectRelationshipConflicts(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Get character_states with non-null relationships
  let sql = `
    SELECT cs.character_id, cs.chapter_num, cs.relationships, cs.chapter_id
    FROM character_states cs
    JOIN chapters c ON cs.chapter_id = c.id
    WHERE cs.relationships IS NOT NULL
  `;
  const params: unknown[] = [];
  if (arcId) {
    sql += ' AND c.arc_id = ?';
    params.push(arcId);
  }
  sql += ' ORDER BY cs.character_id, cs.chapter_num';

  const rows = queryAll(db, sql, params);

  // Group by character
  const byChar = new Map<
    string,
    Array<{
      chapterNum: number;
      relationships: Array<{ target: string; type: string; change?: string }>;
      chapterId: string;
    }>
  >();

  for (const row of rows) {
    const charId = String(row.character_id ?? '');
    const rels = tryParseJSON<Array<{ target: string; type: string; change?: string }>>(
      String(row.relationships ?? ''),
    );
    if (!rels) continue;

    const entry = {
      chapterNum: Number(row.chapter_num),
      relationships: rels,
      chapterId: String(row.chapter_id ?? ''),
    };
    const arr = byChar.get(charId) ?? [];
    arr.push(entry);
    byChar.set(charId, arr);
  }

  for (const [charId, entries] of byChar) {
    const nameRow = queryAll(
      db,
      'SELECT name FROM characters WHERE id = ? LIMIT 1',
      [charId],
    );
    const charName = nameRow.length > 0 ? String(nameRow[0].name ?? charId) : charId;

    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];

      // Build target→type maps
      const prevMap = new Map<string, string>();
      for (const r of prev.relationships) prevMap.set(r.target, r.type);

      const currMap = new Map<string, string>();
      for (const r of curr.relationships) currMap.set(r.target, r.type);

      // Check for opposing flips
      for (const [target, currType] of currMap) {
        const prevType = prevMap.get(target);
        if (!prevType || prevType === currType) continue;

        const expectedOpposite = OPPOSING_RELATIONS[prevType];
        if (currType !== expectedOpposite) continue;

        // Found a flip: prev=ally → curr=enemy (or vice versa)
        // Check if there's a relationship_change fact in between
        const checkSql = `
          SELECT COUNT(*) AS cnt
          FROM chapter_facts f
          JOIN chapters c ON f.chapter_id = c.id
          WHERE f.entity_ref = ?
            AND f.fact_type = 'relationship_change'
            AND f.description LIKE ?
            AND f.chapter_num > ?
            AND f.chapter_num <= ?
        `;
        const checkParams: unknown[] = [
          charName,
          `%${target}%`,
          prev.chapterNum,
          curr.chapterNum,
        ];
        if (arcId) {
          checkParams.push(arcId);
        }
        let checkSqlFinal = checkSql;
        if (arcId) {
          checkSqlFinal += ' AND c.arc_id = ?';
        }
        const existing = queryAll(db, checkSqlFinal, checkParams);
        const hasExplanation = existing.length > 0 && Number(existing[0].cnt ?? 0) > 0;

        if (!hasExplanation) {
          conflicts.push({
            type: 'relationship',
            severity: 'WARNING',
            description: `角色 ${generateWikilink(charName)} 与 ${generateWikilink(target)} 从「${prevType}」变为「${currType}」（第 ${prev.chapterNum}→${curr.chapterNum} 章），缺乏关系转变过渡`,
            chapterRefs: [
              { chapterNum: prev.chapterNum },
              { chapterNum: curr.chapterNum },
            ],
            proof: `之前关系：${prevType}（第 ${prev.chapterNum} 章）\n之后关系：${currType}（第 ${curr.chapterNum} 章）`,
            entityRefs: [charName, target],
          });
        }
      }
    }
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Item Conflicts — item used before acquired
// ═══════════════════════════════════════════════════════════════════════════

export function detectItemConflicts(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Find the earliest chapter each item was acquired
  let acquireSql = `
    SELECT f.entity_ref AS item_name, MIN(f.chapter_num) AS first_acquired
    FROM chapter_facts f
    JOIN chapters c ON f.chapter_id = c.id
    WHERE f.fact_type = 'item_acquire'
      AND f.entity_ref IS NOT NULL
  `;
  const aParams: unknown[] = [];
  if (arcId) {
    acquireSql += ' AND c.arc_id = ?';
    aParams.push(arcId);
  }
  acquireSql += ' GROUP BY f.entity_ref';

  const acquired = queryAll(db, acquireSql, aParams);
  if (acquired.length === 0) return conflicts;

  // For each acquired item, find usages (non-item_acquire facts mentioning it)
  // that occur before the first acquisition chapter
  for (const acq of acquired) {
    const itemName = String(acq.item_name ?? '');
    const firstAcquired = Number(acq.first_acquired);

    let usageSql = `
      SELECT f.fact_type, f.description, f.chapter_num
      FROM chapter_facts f
      JOIN chapters c ON f.chapter_id = c.id
      WHERE f.entity_ref = ?
        AND f.fact_type != 'item_acquire'
        AND f.chapter_num < ?
    `;
    const uParams: unknown[] = [itemName, firstAcquired];
    if (arcId) {
      usageSql += ' AND c.arc_id = ?';
      uParams.push(arcId);
    }
    usageSql += ' ORDER BY f.chapter_num';

    const usageFacts = queryAll(db, usageSql, uParams);

    for (const usage of usageFacts) {
      conflicts.push({
        type: 'item',
        severity: 'WARNING',
        description: `物品 ${generateWikilink(itemName)} 在第 ${Number(usage.chapter_num)} 章被使用时尚未获得（首次获取在第 ${firstAcquired} 章）`,
        chapterRefs: [
          { chapterNum: Number(usage.chapter_num) },
          { chapterNum: firstAcquired },
        ],
        proof: `使用记录（${String(usage.fact_type ?? '')}）：${String(usage.description ?? '')}\n首次获取：第 ${firstAcquired} 章`,
        entityRefs: [itemName],
      });
    }
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Fact Contradictions — incompatible facts for the same entity
// ═══════════════════════════════════════════════════════════════════════════

export function detectFactContradictions(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Find where the same entity_ref has character_states with contradictory status_tags
  // (alive vs dead) across overlapping chapters without transition
  let csSql = `
    SELECT cs.character_id, cs.chapter_num, cs.status_tags
    FROM character_states cs
    JOIN chapters c ON cs.chapter_id = c.id
    WHERE cs.status_tags IS NOT NULL
  `;
  const csParams: unknown[] = [];
  if (arcId) {
    csSql += ' AND c.arc_id = ?';
    csParams.push(arcId);
  }
  csSql += ' ORDER BY cs.character_id, cs.chapter_num';

  const csRows = queryAll(db, csSql, csParams);

  // Group by character
  const byChar = new Map<
    string,
    Array<{ chapterNum: number; tags: string[] }>
  >();
  for (const row of csRows) {
    const charId = String(row.character_id ?? '');
    const tags = tryParseJSON<string[]>(String(row.status_tags ?? ''));
    if (!tags) continue;
    const arr = byChar.get(charId) ?? [];
    arr.push({
      chapterNum: Number(row.chapter_num),
      tags,
    });
    byChar.set(charId, arr);
  }

  // Detect contradictory tag pairs
  const CONTRADICTORY_TAG_PAIRS: Array<[string, string]> = [
    ['死亡', '存活'],
    ['昏迷', '清醒'],
    ['被囚禁', '自由'],
    ['失忆', '记忆恢复'],
  ];

  for (const [charId, entries] of byChar) {
    const nameRow = queryAll(
      db,
      'SELECT name FROM characters WHERE id = ? LIMIT 1',
      [charId],
    );
    const charName = nameRow.length > 0 ? String(nameRow[0].name ?? charId) : charId;

    for (const [tagA, tagB] of CONTRADICTORY_TAG_PAIRS) {
      const hasA = entries.some((e) => e.tags.includes(tagA));
      const hasB = entries.some((e) => e.tags.includes(tagB));
      if (!hasA || !hasB) continue;

      // Find the chapters and check if there's proper transition
      const chA = entries.filter((e) => e.tags.includes(tagA));
      const chB = entries.filter((e) => e.tags.includes(tagB));

      // Check if tagA chapters all precede tagB chapters (or vice versa)
      const lastA = Math.max(...chA.map((e) => e.chapterNum));
      const firstB = Math.min(...chB.map((e) => e.chapterNum));

      // If they overlap (both present in same or interleaved chapters)
      const chNumsA = new Set(chA.map((e) => e.chapterNum));
      const chNumsB = new Set(chB.map((e) => e.chapterNum));
      const overlapChapters = [...chNumsA].filter((n) => chNumsB.has(n));

      if (overlapChapters.length > 0) {
        // Same chapter has contradictory tags
        for (const ch of overlapChapters) {
          conflicts.push({
            type: 'fact_contradiction',
            severity: 'BLOCKER',
            description: `角色 ${generateWikilink(charName)} 在第 ${ch} 章同时具有矛盾状态「${tagA}」和「${tagB}」`,
            chapterRefs: [{ chapterNum: ch }],
            proof: `状态标签：${tagA} ∩ ${tagB}`,
            entityRefs: [charName],
          });
        }
      } else if (lastA < firstB) {
        // Sequential: A before B. Check for transition in between
        const checkSql = `
          SELECT COUNT(*) AS cnt
          FROM chapter_facts f
          JOIN chapters c ON f.chapter_id = c.id
          WHERE f.entity_ref = ?
            AND f.fact_type IN ('state_change', 'plot_advance')
            AND f.chapter_num > ?
            AND f.chapter_num <= ?
        `;
        const checkParams: unknown[] = [charName, lastA, firstB];
        if (arcId) {
          checkParams.push(arcId);
        }
        let checkSqlFinal = checkSql;
        if (arcId) {
          checkSqlFinal += ' AND c.arc_id = ?';
        }
        const existing = queryAll(db, checkSqlFinal, checkParams);
        const hasTransition = existing.length > 0 && Number(existing[0].cnt ?? 0) > 0;

        if (!hasTransition) {
          conflicts.push({
            type: 'fact_contradiction',
            severity: 'WARNING',
            description: `角色 ${generateWikilink(charName)} 从「${tagA}」变为「${tagB}」（第 ${lastA}→${firstB} 章），缺乏过渡解释`,
            chapterRefs: [
              { chapterNum: lastA },
              { chapterNum: firstB },
            ],
            proof: `第 ${lastA} 章：${tagA}\n第 ${firstB} 章：${tagB}`,
            entityRefs: [charName],
          });
        }
      }
    }
  }

  // Also check chapter_facts for entity_ref contradictions:
  // A character appears as entity_ref in both new_character and later has combat_result
  // indicating they should be dead, but then is referenced again in later chapters
  // This overlaps with temporal check, so we focus on tag-based contradictions here.

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Unresolved Hooks — hook_set without hook_payoff after N chapters
// ═══════════════════════════════════════════════════════════════════════════

export function detectUnresolvedHooks(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  threshold: number = 10,
  arcId?: string,
): CrosscheckConflict[] {
  const conflicts: CrosscheckConflict[] = [];

  // Get all hook_set facts with their max chapter per arc scope
  let setSql = `
    SELECT f.id, f.entity_ref, f.description, f.chapter_num, f.chapter_id
    FROM chapter_facts f
    JOIN chapters c ON f.chapter_id = c.id
    WHERE f.fact_type = 'hook_set'
      AND f.entity_ref IS NOT NULL
  `;
  const sParams: unknown[] = [];
  if (arcId) {
    setSql += ' AND c.arc_id = ?';
    sParams.push(arcId);
  }
  setSql += ' ORDER BY f.chapter_num';

  const sets = queryAll(db, setSql, sParams);
  if (sets.length === 0) return conflicts;

  // Get all hook_payoff facts
  let payoffSql = `
    SELECT f.entity_ref, f.description, f.chapter_num, f.chapter_id
    FROM chapter_facts f
    JOIN chapters c ON f.chapter_id = c.id
    WHERE f.fact_type = 'hook_payoff'
      AND f.entity_ref IS NOT NULL
  `;
  const pParams: unknown[] = [];
  if (arcId) {
    payoffSql += ' AND c.arc_id = ?';
    pParams.push(arcId);
  }
  payoffSql += ' ORDER BY f.chapter_num';

  const payoffs = queryAll(db, payoffSql, pParams);

  // Build payoff lookup: entity_ref → earliest payoff chapter
  const payoffByEntity = new Map<string, number>();
  for (const po of payoffs) {
    const entity = String(po.entity_ref ?? '');
    const ch = Number(po.chapter_num);
    if (!payoffByEntity.has(entity) || ch < payoffByEntity.get(entity)!) {
      payoffByEntity.set(entity, ch);
    }
  }

  // Find the max chapter_num in the scope to determine if hook is "recent"
  let maxChSql = 'SELECT MAX(chapter_num) AS max_ch FROM chapters';
  const maxChParams: unknown[] = [];
  if (arcId) {
    maxChSql += ' WHERE arc_id = ?';
    maxChParams.push(arcId);
  }
  const maxChRow = queryAll(db, maxChSql, maxChParams);
  const maxChapter = maxChRow.length > 0 ? Number(maxChRow[0].max_ch ?? 0) : 0;

  for (const hook of sets) {
    const entity = String(hook.entity_ref ?? '');
    const setChapter = Number(hook.chapter_num);
    const payoffChapter = payoffByEntity.get(entity);

    if (payoffChapter !== undefined && payoffChapter > setChapter) {
      // Hook was resolved
      continue;
    }

    if (payoffChapter !== undefined && payoffChapter <= setChapter) {
      // Payoff happens before the hook was set — temporal anomaly
      conflicts.push({
        type: 'unresolved_hook',
        severity: 'INFO',
        description: `伏笔「${String(hook.description ?? entity)}」在第 ${setChapter} 章设置，但回收在第 ${payoffChapter} 章（早于设置）`,
        chapterRefs: [
          { chapterNum: setChapter },
          { chapterNum: payoffChapter },
        ],
        proof: `设置：第 ${setChapter} 章\n回收：第 ${payoffChapter} 章（时间异常）`,
        entityRefs: [entity],
      });
      continue;
    }

    // No payoff found
    const chaptersSince = maxChapter - setChapter;
    if (chaptersSince >= threshold) {
      conflicts.push({
        type: 'unresolved_hook',
        severity: 'WARNING',
        description: `伏笔「${String(hook.description ?? entity)}」在第 ${setChapter} 章设置后超过 ${threshold} 章（已过 ${chaptersSince} 章）仍未回收`,
        chapterRefs: [{ chapterNum: setChapter }],
        proof: `设置章节：第 ${setChapter} 章\n当前最大章节：第 ${maxChapter} 章\n未回收已持续 ${chaptersSince} 章（阈值 ${threshold} 章）`,
        entityRefs: [entity],
      });
    }
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// Orchestrator — runs all 7 checks
// ═══════════════════════════════════════════════════════════════════════════

const CHECK_NAMES: Record<string, string> = {
  temporal: '时间线冲突',
  location: '位置冲突',
  power_level: '战力冲突',
  relationship: '关系冲突',
  item: '物品冲突',
  fact_contradiction: '事实矛盾',
  unresolved_hook: '未回收伏笔',
};

const SEVERITY_ORDER: Record<ConflictSeverity, number> = {
  BLOCKER: 0,
  WARNING: 1,
  INFO: 2,
};

/**
 * Run all 7 cross-chapter conflict checks.
 *
 * @param arcId     - Optional arc ID to scope checks
 * @param scope     - 'all' or 'arc'
 * @param threshold - Maximum chapters allowed for unresolved hooks (default 10)
 * @returns Sorted conflicts with summary
 */
export function runAllChecks(
  arcId?: string,
  scope: string = 'all',
  threshold: number = 10,
): CrosscheckResult {
  const db = getDatabase();
  if (!db) {
    return {
      conflicts: [],
      summary: {
        total: 0,
        byType: {},
        bySeverity: { BLOCKER: 0, WARNING: 0, INFO: 0 },
        scope,
      },
    };
  }

  const allConflicts: CrosscheckConflict[] = [
    ...detectTemporalConflicts(db, arcId),
    ...detectLocationConflicts(db, arcId),
    ...detectPowerLevelConflicts(db, arcId),
    ...detectRelationshipConflicts(db, arcId),
    ...detectItemConflicts(db, arcId),
    ...detectFactContradictions(db, arcId),
    ...detectUnresolvedHooks(db, threshold, arcId),
  ];

  // Sort by severity (BLOCKER first, then WARNING, then INFO)
  allConflicts.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  // Build summary
  const byType: Record<string, number> = {};
  const bySeverity: Record<ConflictSeverity, number> = {
    BLOCKER: 0,
    WARNING: 0,
    INFO: 0,
  };

  for (const c of allConflicts) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
    bySeverity[c.severity]++;
  }

  // Resolve arc name if applicable
  let arcName: string | undefined;
  if (arcId) {
    const aRow = queryAll(db, 'SELECT name FROM arcs WHERE id = ? LIMIT 1', [arcId]);
    if (aRow.length > 0) {
      arcName = String(aRow[0].name ?? '');
    }
  }

  return {
    conflicts: allConflicts,
    summary: {
      total: allConflicts.length,
      byType,
      bySeverity,
      scope,
      arcName,
    },
  };
}

/** Get the Chinese display name for a check type key. */
export function getCheckName(type: string): string {
  return CHECK_NAMES[type] ?? type;
}
