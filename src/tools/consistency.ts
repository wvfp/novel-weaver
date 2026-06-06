/**
 * novel-weaver Cross-World Consistency Check Tools
 *
 * Two tools for infinite-flow novel setting consistency management:
 *  - novel_consistency_check  — scans all arc worlds for setting consistency
 *                               issues, returns sorted results, generates report
 *  - novel_consistency_rules  — manages custom consistency rules in the `rules`
 *                               table (list/add/remove)
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDatabase, generateId } from '../db/index.js';
import { generateFrontmatter } from '../md/frontmatter.js';
import { generateWikilink } from '../md/wikilink.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity for a consistency issue. */
type IssueSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

/** A single consistency issue found during scanning. */
interface ConsistencyIssue {
  dimension: string;
  severity: IssueSeverity;
  description: string;
  worldRefs: string[];
}

/** World row shape from the DB. */
interface WorldRow {
  id: string;
  name: string;
  type: string;
  status: string;
  yaml_metadata: string | null;
}

/** Character row shape from the DB. */
interface CharacterRow {
  id: string;
  world_id: string;
  name: string;
  role_type: string;
  aliases: string | null;
  description: string | null;
}

/** Arc row shape from the DB. */
interface ArcRow {
  id: string;
  world_id: string;
  name: string;
  arc_type: string;
  genre_id: string;
  theme: string;
  difficulty: number;
  rules: string | null;
  rewards: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subdirectory under the project root for generated report .md files. */
const REPORTS_DIR = '.novel-weaver/content/reports';

/** Keywords that hint at an ability/power description in character text. */
const ABILITY_KEYWORDS = [
  '能力', '技能', '法术', '功法', '火球', '修炼', '等级',
  '修为', '魔法', '灵力', '斗气', '神力', '念力', '异能',
];

/** Keywords that hint at time-related rules in arc data. */
const TIME_KEYWORDS = [
  '天', '小时', '分钟', '时间流速', '时间比例', '时间差',
  '限时', '倒计时',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get today's date as YYYY-MM-DD string. */
function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
    console.error(`[novel-weaver] queryAll failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Ensure a directory exists (recursive). */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Sort issues: BLOCKER first, then WARNING, then INFO. */
function sortIssues(issues: ConsistencyIssue[]): ConsistencyIssue[] {
  const order: Record<IssueSeverity, number> = {
    BLOCKER: 0,
    WARNING: 1,
    INFO: 2,
  };
  return [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Build a human-readable severity label for the report. */
function severityLabel(severity: IssueSeverity): string {
  switch (severity) {
    case 'BLOCKER':
      return '🚫 阻塞';
    case 'WARNING':
      return '⚠️ 警告';
    case 'INFO':
      return 'ℹ️ 提示';
  }
}

// ---------------------------------------------------------------------------
// Consistency Check Engine
// ---------------------------------------------------------------------------

/**
 * Run all 5 consistency dimensions against the current database.
 *
 * Dimensions checked:
 *  1. Power consistency   — ability keywords across worlds
 *  2. Item consistency    — reward items with conflicting descriptions/tiers
 *  3. Character relation  — same character with different roles/descriptions
 *  4. Timeline            — time-related rules in arcs
 *  5. NPC consistency     — NPC backgrounds across different worlds
 */
function runConsistencyChecks(
  db: NonNullable<ReturnType<typeof getDatabase>>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // ── 1. Load all relevant data ──────────────────────────────────────────
  const worlds = queryAll(
    db,
    'SELECT id, name, type, status, yaml_metadata FROM worlds',
    [],
  ) as unknown as WorldRow[];

  const characters = queryAll(
    db,
    'SELECT id, world_id, name, role_type, aliases, description FROM characters',
    [],
  ) as unknown as CharacterRow[];

  const arcs = queryAll(
    db,
    'SELECT id, world_id, name, arc_type, genre_id, theme, difficulty, rules, rewards, status FROM arcs',
    [],
  ) as unknown as ArcRow[];

  if (worlds.length === 0) {
    return issues; // empty — nothing to check
  }

  // Build lookup maps
  const worldMap = new Map<string, WorldRow>();
  for (const w of worlds) worldMap.set(w.id, w);

  // Group characters by name for cross-world analysis
  const charByName = new Map<string, CharacterRow[]>();
  for (const c of characters) {
    const arr = charByName.get(c.name) ?? [];
    arr.push(c);
    charByName.set(c.name, arr);
  }

  // Group arcs by world
  const arcsByWorld = new Map<string, ArcRow[]>();
  for (const a of arcs) {
    const arr = arcsByWorld.get(a.world_id) ?? [];
    arr.push(a);
    arcsByWorld.set(a.world_id, arr);
  }

  // ── 2. Power consistency check ────────────────────────────────────────
  // Detect ability/power keywords appearing in multiple worlds with different
  // character descriptions, suggesting contradictory power system descriptions.
  const worldAbilities = new Map<string, Set<string>>(); // worldId -> ability keywords found

  for (const c of characters) {
    if (!c.description) continue;
    const desc = c.description;
    const found = ABILITY_KEYWORDS.filter((kw) => desc.includes(kw));
    if (found.length === 0) continue;

    if (!worldAbilities.has(c.world_id)) {
      worldAbilities.set(c.world_id, new Set());
    }
    const wAbilities = worldAbilities.get(c.world_id)!;
    for (const kw of found) {
      wAbilities.add(kw);
    }
  }

  // Compare ability keyword sets across worlds
  const worldIds = [...worldAbilities.keys()];
  for (let i = 0; i < worldIds.length; i++) {
    for (let j = i + 1; j < worldIds.length; j++) {
      const wIdA = worldIds[i];
      const wIdB = worldIds[j];
      const setA = worldAbilities.get(wIdA)!;
      const setB = worldAbilities.get(wIdB)!;

      const overlap = [...setA].filter((kw) => setB.has(kw));
      if (overlap.length === 0) continue;

      const wA = worldMap.get(wIdA);
      const wB = worldMap.get(wIdB);
      const worldNameA = wA?.name ?? wIdA;
      const worldNameB = wB?.name ?? wIdB;

      // Check if the same ability appears described differently across these worlds
      for (const ability of overlap) {
        // Find character descriptions mentioning this ability in each world
        const descsA = characters
          .filter((c) => c.world_id === wIdA && c.description?.includes(ability))
          .map((c) => c.description ?? '');
        const descsB = characters
          .filter((c) => c.world_id === wIdB && c.description?.includes(ability))
          .map((c) => c.description ?? '');

        const uniqueDescsA = [...new Set(descsA)];
        const uniqueDescsB = [...new Set(descsB)];

        // If both worlds mention the same ability, flag it as a potential
        // power system contradiction
        issues.push({
          dimension: '力量体系一致性',
          severity: 'BLOCKER',
          description: [
            `力量体系关键词「${ability}」同时出现在 ${generateWikilink(worldNameA)} 和 ${generateWikilink(worldNameB)} 中，`,
            `请检查是否存在能力描述矛盾。`,
            uniqueDescsA.length > 0
              ? `  ${worldNameA} 描述：${uniqueDescsA[0].slice(0, 80)}`
              : '',
            uniqueDescsB.length > 0
              ? `  ${worldNameB} 描述：${uniqueDescsB[0].slice(0, 80)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          worldRefs: [worldNameA, worldNameB],
        });
      }
    }
  }

  // ── 3. Item consistency check ─────────────────────────────────────────
  // Collect reward items across all arcs and detect contradictions.
  const itemMap = new Map<
    string,
    Array<{ arcName: string; worldName: string; tier: string; desc: string }>
  >();

  for (const a of arcs) {
    if (!a.rewards) continue;
    try {
      const rewards = JSON.parse(a.rewards) as Array<{
        name: string;
        description: string;
        tier: string;
      }>;
      const world = worldMap.get(a.world_id);
      const worldName = world?.name ?? '未知世界';
      for (const r of rewards) {
        const arr = itemMap.get(r.name) ?? [];
        arr.push({
          arcName: a.name,
          worldName,
          tier: r.tier,
          desc: r.description,
        });
        itemMap.set(r.name, arr);
      }
    } catch {
      // skip invalid JSON rewards
    }
  }

  for (const [itemName, occurrences] of itemMap) {
    if (occurrences.length <= 1) continue;

    const descs = new Set(occurrences.map((o) => o.desc));
    const tiers = new Set(occurrences.map((o) => o.tier));

    if (descs.size > 1) {
      // Same item name with different descriptions
      const refs = occurrences
        .map((o) => `  - ${generateWikilink(o.arcName)}（${o.worldName}: ${o.desc}）`)
        .join('\n');
      issues.push({
        dimension: '物品一致性',
        severity: 'WARNING',
        description: `物品「${itemName}」在不同篇章中描述不一致：\n${refs}`,
        worldRefs: [...new Set(occurrences.map((o) => o.worldName))],
      });
    } else if (tiers.size > 1) {
      // Same item name, same description but different tier levels
      const refs = occurrences
        .map((o) => `  - ${generateWikilink(o.arcName)}（${o.worldName}: ${o.tier === 'legendary' ? '传说' : o.tier === 'rare' ? '稀有' : '基础'}）`)
        .join('\n');
      issues.push({
        dimension: '物品一致性',
        severity: 'INFO',
        description: `物品「${itemName}」在不同篇章中品级不一致：\n${refs}`,
        worldRefs: [...new Set(occurrences.map((o) => o.worldName))],
      });
    }
  }

  // ── 4. Character relationship consistency ────────────────────────────
  // Same character appearing in multiple worlds with conflicting roles or
  // contradictory descriptions.
  for (const [charName, charGroup] of charByName) {
    if (charGroup.length <= 1) continue;

    const roles = new Set(charGroup.map((c) => c.role_type));
    const worldsWithChar = charGroup.map((c) => {
      const w = worldMap.get(c.world_id);
      return w?.name ?? c.world_id;
    });
    const uniqueWorlds = [...new Set(worldsWithChar)];

    if (roles.size > 1) {
      // Same character, different role types — this is a BLOCKER
      const roleDetails = charGroup
        .map(
          (c) =>
            `${generateWikilink(worldMap.get(c.world_id)?.name ?? c.world_id)}（${c.role_type}）`,
        )
        .join('，');
      issues.push({
        dimension: '角色关系一致性',
        severity: 'BLOCKER',
        description: `角色 ${generateWikilink(charName)} 在不同世界中角色类型不一致：${roleDetails}`,
        worldRefs: uniqueWorlds,
      });
    }

    // Check description conflicts
    const descs = charGroup
      .map((c) => (c.description ?? '').trim())
      .filter(Boolean);
    if (descs.length > 1 && new Set(descs).size > 1) {
      const descDetails = charGroup
        .map(
          (c) =>
            `${generateWikilink(worldMap.get(c.world_id)?.name ?? c.world_id)}：${(c.description ?? '').slice(0, 60)}`,
        )
        .join('\n  - ');
      issues.push({
        dimension: '角色关系一致性',
        severity: 'WARNING',
        description: `角色 ${generateWikilink(charName)} 在不同世界中背景描述不一致：\n  - ${descDetails}`,
        worldRefs: uniqueWorlds,
      });
    }
  }

  // ── 5. Timeline consistency ───────────────────────────────────────────
  // Check for time-related rules in arcs under each core world.
  for (const w of worlds) {
    if (w.type !== 'core') continue;
    const coreArcs = arcsByWorld.get(w.id) ?? [];

    for (const a of coreArcs) {
      if (!a.rules) continue;
      try {
        const rulesData = JSON.parse(a.rules) as Record<string, unknown>;
        const rulesArr = (rulesData.rules as string[]) ?? [];
        const rulesText = rulesArr.join(' ');
        const foundTimeRefs = TIME_KEYWORDS.filter((kw) => rulesText.includes(kw));

        if (foundTimeRefs.length > 0) {
          issues.push({
            dimension: '时间线一致性',
            severity: 'INFO',
            description: `篇章 ${generateWikilink(a.name)} 包含时间相关规则「${foundTimeRefs.join('、')}」，建议核实核心世界 ${generateWikilink(w.name)} 与篇章之间的时间流速比例`,
            worldRefs: [w.name],
          });
        }
      } catch {
        // skip invalid JSON rules
      }
    }
  }

  // ── 6. NPC consistency ────────────────────────────────────────────────
  // Same NPC (role_type = 'npc') appearing in different worlds with
  // contradictory background descriptions.
  const npcByName = new Map<string, CharacterRow[]>();
  for (const c of characters) {
    if (c.role_type === 'npc') {
      const arr = npcByName.get(c.name) ?? [];
      arr.push(c);
      npcByName.set(c.name, arr);
    }
  }

  for (const [npcName, npcs] of npcByName) {
    if (npcs.length <= 1) continue;

    const worldsWithNpc = npcs.map((n) => {
      const w = worldMap.get(n.world_id);
      return w?.name ?? n.world_id;
    });
    const uniqueWorlds = [...new Set(worldsWithNpc)];

    const descriptions = npcs
      .map((n) => (n.description ?? '').trim())
      .filter(Boolean);

    if (descriptions.length > 1 && new Set(descriptions).size > 1) {
      const bgDetails = npcs
        .map(
          (n) =>
            `${generateWikilink(worldMap.get(n.world_id)?.name ?? n.world_id)}：${(n.description ?? '').slice(0, 60)}`,
        )
        .join('\n  - ');
      issues.push({
        dimension: 'NPC 一致性',
        severity: 'WARNING',
        description: `NPC ${generateWikilink(npcName)} 在不同世界中背景描述不一致：\n  - ${bgDetails}`,
        worldRefs: uniqueWorlds,
      });
    }
  }

  // ── 7. Cross-chapter fact consistency ──────────────────────────────────
  // Check chapter_facts for contradictory facts about the same entity.
  // E.g., entity "张三" has combat_result:死亡 in ch5 and state_change:升级 in ch10.
  const chapterFacts = queryAll(
    db,
    `SELECT cf.id, cf.fact_type, cf.entity_ref, cf.description, cf.chapter_num,
            ch.title AS chapter_title
     FROM chapter_facts cf
     LEFT JOIN chapters ch ON ch.id = cf.chapter_id
     WHERE cf.entity_ref IS NOT NULL AND cf.entity_ref != ''
     ORDER BY cf.entity_ref, cf.chapter_num`,
    [],
  );

  // Group facts by entity_ref
  const factsByEntity = new Map<string, Array<{
    fact_type: string;
    description: string;
    chapter_num: number;
    chapter_title: string | null;
  }>>();
  for (const f of chapterFacts) {
    const entity = String(f.entity_ref ?? '');
    if (!entity) continue;
    const arr = factsByEntity.get(entity) ?? [];
    arr.push({
      fact_type: String(f.fact_type ?? ''),
      description: String(f.description ?? ''),
      chapter_num: Number(f.chapter_num ?? 0),
      chapter_title: f.chapter_title ? String(f.chapter_title) : null,
    });
    factsByEntity.set(entity, arr);
  }

  // Contradiction pairs: fact_type combinations that conflict
  const CONFLICT_PAIRS: Array<[string, string]> = [
    ['combat_result', 'state_change'],
    ['hook_set', 'hook_payoff'],
  ];
  // Self-contradictory fact_types within the same entity
  const SELF_CONFLICT_TYPES = ['combat_result'];

  for (const [entity, facts] of factsByEntity) {
    if (facts.length < 2) continue;

    // Check for death + later activity contradiction
    const deathFact = facts.find((f) => f.fact_type === 'combat_result' && /死亡|阵亡|战死|击杀/.test(f.description));
    if (deathFact) {
      const laterFacts = facts.filter((f) => f.chapter_num > deathFact.chapter_num);
      if (laterFacts.length > 0) {
        const laterDesc = laterFacts
          .map((f) => `第${f.chapter_num}章「${f.fact_type}」${f.description.slice(0, 40)}`)
          .join('; ');
        issues.push({
          dimension: '跨章节事实一致性',
          severity: 'WARNING',
          description: `实体「${entity}」在第${deathFact.chapter_num}章被标记为死亡，后续章节仍有关联事实（${laterDesc}），请检查是否矛盾`,
          worldRefs: [entity],
        });
      }
    }

    // Check conflict pairs
    for (const [typeA, typeB] of CONFLICT_PAIRS) {
      const factsA = facts.filter((f) => f.fact_type === typeA);
      const factsB = facts.filter((f) => f.fact_type === typeB);
      if (factsA.length > 0 && factsB.length > 0) {
        const aChs = factsA.map((f) => `第${f.chapter_num}章`).join('、');
        const bChs = factsB.map((f) => `第${f.chapter_num}章`).join('、');
        issues.push({
          dimension: '跨章节事实一致性',
          severity: 'WARNING',
          description: `实体「${entity}」同时存在 ${typeA}（${aChs}）和 ${typeB}（${bChs}）类型的事实，请核实是否存在冲突`,
          worldRefs: [entity],
        });
      }
    }

    // Check self-contradictory types: e.g., combat_result appears multiple times with opposite outcomes
    for (const conflictType of SELF_CONFLICT_TYPES) {
      const sameTypeFacts = facts.filter((f) => f.fact_type === conflictType);
      if (sameTypeFacts.length < 2) continue;

      const outcomes = new Set(sameTypeFacts.map((f) => f.description.trim()));
      if (outcomes.size > 1) {
        const detail = sameTypeFacts
          .map((f) => `第${f.chapter_num}章: ${f.description.slice(0, 40)}`)
          .join('\n  - ');
        issues.push({
          dimension: '跨章节事实一致性',
          severity: 'INFO',
          description: `实体「${entity}」的 ${conflictType} 事实在多章中存在不同结果：\n  - ${detail}`,
          worldRefs: [entity],
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate the full Obsidian-compatible Markdown report content.
 */
function buildReportContent(issues: ConsistencyIssue[], projectDir: string): string {
  const sorted = sortIssues(issues);

  const meta = generateFrontmatter({
    title: '一致性检查报告',
    type: 'consistency-report',
    generated: today(),
    total_issues: sorted.length,
    blocker_count: sorted.filter((i) => i.severity === 'BLOCKER').length,
    warning_count: sorted.filter((i) => i.severity === 'WARNING').length,
    info_count: sorted.filter((i) => i.severity === 'INFO').length,
  });

  const parts: string[] = [meta, '', '# 一致性检查报告', ''];

  if (sorted.length === 0) {
    parts.push('✅ **未发现一致性问题，所有世界设定一致。**', '');
    parts.push('> 注意：此检查基于现有数据的启发式分析，可能无法覆盖所有设定矛盾。', '');
    return parts.join('\n');
  }

  // Summary
  const blockerCount = sorted.filter((i) => i.severity === 'BLOCKER').length;
  const warningCount = sorted.filter((i) => i.severity === 'WARNING').length;
  const infoCount = sorted.filter((i) => i.severity === 'INFO').length;

  parts.push('## 概览', '');
  parts.push(`| 级别 | 数量 |`);
  parts.push(`|------|------|`);
  parts.push(`| 🚫 BLOCKER | ${blockerCount} |`);
  parts.push(`| ⚠️ WARNING | ${warningCount} |`);
  parts.push(`| ℹ️ INFO | ${infoCount} |`);
  parts.push('');

  // Group issues by severity
  const severities: IssueSeverity[] = ['BLOCKER', 'WARNING', 'INFO'];
  const dimensionIcons: Record<string, string> = {
    '力量体系一致性': '⚡',
    '物品一致性': '🎒',
    '角色关系一致性': '👤',
    '时间线一致性': '⏱',
    'NPC 一致性': '🎭',
    '跨章节事实一致性': '📖',
  };

  for (const sev of severities) {
    const group = sorted.filter((i) => i.severity === sev);
    if (group.length === 0) continue;

    parts.push(`## ${severityLabel(sev)} 级别（${group.length} 项）`, '');
    for (let idx = 0; idx < group.length; idx++) {
      const issue = group[idx];
      const icon = dimensionIcons[issue.dimension] ?? '•';
      parts.push(`### ${idx + 1}. ${icon} ${issue.dimension}`, '');
      parts.push('- [ ] ' + issue.description, '');

      // World reference links
      if (issue.worldRefs.length > 0) {
        parts.push(
          `  涉及世界：${issue.worldRefs.map((w) => generateWikilink(w)).join('、')}`,
          '',
        );
      }
    }
  }

  parts.push('---', '');
  parts.push(`> 报告生成时间：${today()} | 检查维度：6 项 | 引擎：novel-weaver consistency-check`, '');
  parts.push('');

  return parts.join('\n');
}

/**
 * Write the consistency report to disk.
 * Returns the relative file path of the generated report.
 */
function writeReport(
  issues: ConsistencyIssue[],
  projectDir: string,
): string | null {
  try {
    const reportsDir = path.resolve(projectDir, REPORTS_DIR);
    ensureDir(reportsDir);

    const filename = `consistency-${today()}.md`;
    const filePath = path.join(reportsDir, filename);

    const content = buildReportContent(issues, projectDir);
    fs.writeFileSync(filePath, content, 'utf-8');

    return path.join(REPORTS_DIR, filename);
  } catch (err) {
    console.error(`[novel-weaver] Failed to write consistency report: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool: novel_consistency_check
// ---------------------------------------------------------------------------

export const novel_consistency_check = tool({
  description:
    '检查所有无限流篇章世界间的设定一致性。自动扫描 worlds / arcs / characters 表，'
    + '从 5 个维度（力量体系、物品、角色关系、时间线、NPC）进行启发式分析，'
    + '按 BLOCKER / WARNING / INFO 排序输出结果，'
    + '并生成 Obsidian 兼容的 Markdown 报告文件（.novel-weaver/content/reports/consistency-{date}.md）。',
  args: {},
  async execute(_args, context) {
    const db = getDatabase();
    if (!db) {
      return { output: '错误：数据库未初始化。请确保插件已正确加载。' };
    }

    // ── Ensure rules table exists ──────────────────────────────────────
    try {
      db.run(`CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        rule_type TEXT NOT NULL DEFAULT 'custom',
        config TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    } catch (err) {
      return {
        output: `[novel_consistency_check] 创建规则表失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── Run checks ─────────────────────────────────────────────────────
    let issues: ConsistencyIssue[];
    try {
      issues = runConsistencyChecks(db);
    } catch (err) {
      return {
        output: `❌ 一致性检查执行错误：${(err as Error).message}`,
      };
    }

    const sorted = sortIssues(issues);

    // ── Write report ───────────────────────────────────────────────────
    let reportPath: string | null = null;
    try {
      reportPath = writeReport(issues, context.directory);
    } catch (err) {
      // Report file write failed — still return the results
      console.error('[novel-weaver] Failed to write consistency report:', err);
    }

    // ── Build output ───────────────────────────────────────────────────
    const blockerCount = sorted.filter((i) => i.severity === 'BLOCKER').length;
    const warningCount = sorted.filter((i) => i.severity === 'WARNING').length;
    const infoCount = sorted.filter((i) => i.severity === 'INFO').length;
    const total = sorted.length;

    const lines: string[] = [
      total === 0
        ? '✅ **未发现一致性问题，所有世界设定一致！**'
        : `🔍 **一致性检查完成，发现 ${total} 个问题**`,
      '',
      `| 级别 | 数量 |`,
      `|------|------|`,
      `| 🚫 BLOCKER | ${blockerCount} |`,
      `| ⚠️ WARNING | ${warningCount} |`,
      `| ℹ️ INFO | ${infoCount} |`,
      '',
    ];

    if (reportPath) {
      lines.push(`📄 报告已保存：\`${reportPath}\``, '');
    }

    if (total > 0) {
      lines.push('---', '');
      for (const issue of sorted) {
        const label = issue.severity === 'BLOCKER'
          ? '🚫'
          : issue.severity === 'WARNING'
            ? '⚠️'
            : 'ℹ️';
        lines.push(`### [${issue.severity}] ${issue.dimension}`);
        lines.push('');
        lines.push(issue.description);
        lines.push('');
      }
    }

    return {
      output: lines.join('\n'),
      metadata: {
        total_issues: total,
        blocker_count: blockerCount,
        warning_count: warningCount,
        info_count: infoCount,
        report_file: reportPath,
        dimensions_checked: [
          'power_consistency',
          'item_consistency',
          'character_relationship',
          'timeline',
          'npc_consistency',
          'cross_chapter_fact_consistency',
        ],
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: novel_consistency_rules
// ---------------------------------------------------------------------------

export const novel_consistency_rules = tool({
  description:
    '管理自定义一致性检查规则。支持三个操作：'
    + 'list — 列出所有规则；'
    + 'add — 添加新规则（需提供 name + description + 可选 config）；'
    + 'remove — 按 ID 删除规则。'
    + '规则存储在 SQLite rules 表中。',
  args: {
    action: tool.schema
      .enum(['list', 'add', 'remove'])
      .describe('操作类型：list（列出所有规则）、add（添加规则）、remove（删除规则）'),
    name: tool.schema
      .string()
      .optional()
      .describe('规则名称（action=add 时必填）'),
    description: tool.schema
      .string()
      .optional()
      .describe('规则描述（action=add 时可选）'),
    config: tool.schema
      .string()
      .optional()
      .describe('规则配置（action=add 时可选，JSON 字符串）'),
    id: tool.schema
      .string()
      .optional()
      .describe('规则 ID（action=remove 时必填）'),
  },
  async execute(args, _context) {
    const db = getDatabase();
    if (!db) {
      return { output: '错误：数据库未初始化。请确保插件已正确加载。' };
    }

    // ── Ensure rules table exists ──────────────────────────────────────
    try {
      db.run(`CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        rule_type TEXT NOT NULL DEFAULT 'custom',
        config TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    } catch (err) {
      return {
        output: `[novel_consistency_rules] 创建规则表失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const { action } = args;

    // ── List all rules ─────────────────────────────────────────────────
    if (action === 'list') {
      const rows = queryAll(
        db,
        'SELECT id, name, description, rule_type, config, enabled, created_at FROM rules ORDER BY created_at DESC',
        [],
      ) as unknown as Array<{
        id: string;
        name: string;
        description: string | null;
        rule_type: string;
        config: string | null;
        enabled: number;
        created_at: string;
      }>;

      if (rows.length === 0) {
        return {
          output: '📋 当前没有自定义一致性规则。使用 `action=add` 添加规则。',
          metadata: { count: 0, rules: [] },
        };
      }

      const lines: string[] = [
        `📋 共 ${rows.length} 条自定义一致性规则：`,
        '',
        `| ID | 名称 | 类型 | 启用 | 创建时间 |`,
        `|----|------|------|------|----------|`,
        ...rows.map(
          (r) =>
            `| \`${r.id.slice(0, 8)}…\` | ${r.name} | ${r.rule_type} | ${r.enabled ? '✅' : '❌'} | ${r.created_at} |`,
        ),
        '',
      ];

      for (const r of rows) {
        lines.push(`### ${r.name}（\`${r.id}\`）`, '');
        if (r.description) {
          lines.push(`描述：${r.description}`, '');
        }
        if (r.config) {
          lines.push(`配置：\`\`\`json\n${r.config}\n\`\`\``, '');
        }
        lines.push(`类型：${r.rule_type} | 启用：${r.enabled ? '是' : '否'} | 创建于：${r.created_at}`, '');
      }

      return {
        output: lines.join('\n'),
        metadata: {
          count: rows.length,
          rules: rows.map((r) => ({
            id: r.id,
            name: r.name,
            rule_type: r.rule_type,
            enabled: !!r.enabled,
            created_at: r.created_at,
          })),
        },
      };
    }

    // ── Add a rule ─────────────────────────────────────────────────────
    if (action === 'add') {
      if (!args.name) {
        return { output: '❌ 添加规则时 name 参数为必填项。' };
      }

      const id = generateId();
      const configStr = args.config ?? null;

      try {
        db.run(
          `INSERT INTO rules (id, name, description, rule_type, config, enabled)
           VALUES (?, ?, ?, 'custom', ?, 1)`,
          [id, args.name, args.description ?? null, configStr],
        );
      } catch (err) {
        return { output: `❌ 添加规则失败：${(err as Error).message}` };
      }

      return {
        output: [
          `✅ 规则「${args.name}」添加成功！`,
          `  ID: ${id}`,
          `  描述：${args.description ?? '（无）'}`,
          `  配置：${configStr ?? '（无）'}`,
          '',
          `使用 \`novel_consistency_rules\` action=list 查看所有规则。`,
        ].join('\n'),
        metadata: {
          id,
          name: args.name,
          action: 'add',
        },
      };
    }

    // ── Remove a rule ──────────────────────────────────────────────────
    if (action === 'remove') {
      if (!args.id) {
        return { output: '❌ 删除规则时 id 参数为必填项。' };
      }

      // Verify the rule exists
      const existing = queryAll(db, 'SELECT id, name FROM rules WHERE id = ?', [args.id]);
      if (existing.length === 0) {
        return { output: `❌ 未找到 ID 为「${args.id}」的规则。` };
      }

      const ruleName = String(existing[0].name ?? '未知');

      try {
        db.run('DELETE FROM rules WHERE id = ?', [args.id]);
      } catch (err) {
        return { output: `❌ 删除规则失败：${(err as Error).message}` };
      }

      return {
        output: `✅ 规则「${ruleName}」（${args.id}）已删除。`,
        metadata: {
          id: args.id,
          name: ruleName,
          action: 'remove',
        },
      };
    }

    // Fallback (should never reach here due to enum validation)
    return { output: `❌ 不支持的操作类型「${action}」。支持的操作：list, add, remove。` };
  },
});
