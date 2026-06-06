/**
 * 角色状态快照 Tool — novel_state_snapshot
 *
 * 只读查询工具，展示实体在故事中任意时间点的状态历史：
 *   - 当前状态（状态标签、实力等级、位置、物品）
 *   - 状态变化历程（按章节排序）
 *   - 关系变化追踪
 *   - 章节事实摘要
 *   - 首次/最近出场章节
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import { getDatabase } from '../../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw row from character_states table (snake_case from DB). */
interface CharacterStateRow {
  id: string;
  character_id: string;
  chapter_id: string;
  chapter_num: number;
  status_tags: string | null;
  power_level: string | null;
  location: string | null;
  items: string | null;
  relationships: string | null;
  narrative_state: string | null;
  context: string | null;
  created_at: string;
}

/** Parsed relationship entry. */
interface RelationshipEntry {
  target: string;
  type: string;
  change: string;
}

/** Parsed character state for display. */
interface ParsedState {
  chapter_num: number;
  status_tags: string[];
  power_level: string | null;
  location: string | null;
  items: string[];
  relationships: RelationshipEntry[];
  narrative_state: string | null;
}

/** Raw row from chapter_facts table. */
interface ChapterFactRow {
  id: string;
  chapter_id: string;
  fact_type: string;
  entity_ref: string | null;
  description: string;
  chapter_num: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a JSON string to an array.
 * Returns an empty array on null/undefined/parse failure.
 */
function safeParseArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Safely parse a JSON string to a relationship entry array.
 */
function safeParseRelationships(raw: string | null): RelationshipEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as RelationshipEntry[] : [];
  } catch {
    return [];
  }
}

/**
 * Format a string list for display.
 * If empty, returns "—".
 */
function formatList(items: string[]): string {
  if (items.length === 0) return '—';
  return items.join(', ');
}

/**
 * Format a date string for display (YYYY-MM-DD).
 */
function formatDate(raw: string): string {
  if (!raw) return '—';
  return raw.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tool: novel_state_snapshot
// ---------------------------------------------------------------------------

export const novel_state_snapshot = tool({
  description:
    '查询角色或实体在故事中任意时间点的状态快照。'
    + '展示当前状态、实力等级变化历程、位置变动、物品变更、关系变化及章节事实。'
    + '支持按章节号过滤，查看特定时间点的历史状态。',
  args: {
    entity_id: tool.schema
      .string()
      .describe(
        '实体 ID（角色的 UUID，也支持按角色名搜索）',
      ),
    at_chapter: tool.schema
      .number()
      .optional()
      .describe(
        '按章节号过滤——只显示此章节及之前的状态（默认使用最新章节）',
      ),
  },
  async execute(args, _context) {
    const db = getDatabase();
    if (!db) {
      return {
        output: '❌ 数据库未初始化。请先运行 novel_init 初始化。',
      };
    }

    const { entity_id, at_chapter } = args;

    // ── 1. Resolve the entity ──────────────────────────────────────────
    // Try as UUID first, then fallback to name search
    let charRow: {
      id: string;
      world_id: string;
      name: string;
      role_type: string;
      description: string | null;
    } | null = null;

    try {
      // Attempt direct UUID lookup
      const charStmt = db.prepare(
        'SELECT id, world_id, name, role_type, description FROM characters WHERE id = ?',
      );
      charStmt.bind([entity_id]);
      if (charStmt.step()) {
        charRow = charStmt.getAsObject() as any;
      }
      charStmt.free();
    } catch (err) {
      // Fall through to name search below
    }

    // Not found by UUID — try by name
    if (!charRow) {
      try {
        const nameStmt = db.prepare(
          'SELECT id, world_id, name, role_type, description FROM characters WHERE name = ?',
        );
        nameStmt.bind([entity_id]);
        if (nameStmt.step()) {
          charRow = nameStmt.getAsObject() as any;
        }
        nameStmt.free();
      } catch (err) {
        return {
          output:
            `[novel_state_snapshot] 查询角色失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    if (!charRow) {
      return {
        output: `❌ 未找到 ID 或名称为「${entity_id}」的角色。请确认角色已创建。`,
      };
    }

    // ── 2. Look up the entity's world ─────────────────────────────────
    let worldName = '—';
    try {
      const worldStmt = db.prepare('SELECT name FROM worlds WHERE id = ?');
      worldStmt.bind([charRow.world_id]);
      if (worldStmt.step()) {
        const wRow = worldStmt.getAsObject() as { name: string };
        worldName = wRow.name;
      }
      worldStmt.free();
    } catch {
      // Non-critical — leave as "—"
    }

    // ── 3. Query character_states ──────────────────────────────────────
    const states: CharacterStateRow[] = [];

    try {
      let sql =
        'SELECT id, character_id, chapter_id, chapter_num, status_tags, power_level, location, items, relationships, narrative_state, context, created_at FROM character_states WHERE character_id = ?';
      const params: any[] = [charRow.id];

      if (at_chapter !== undefined) {
        sql += ' AND chapter_num <= ?';
        params.push(at_chapter);
      }

      sql += ' ORDER BY chapter_num ASC';

      const stateStmt = db.prepare(sql);
      stateStmt.bind(params);

      while (stateStmt.step()) {
        states.push(stateStmt.getAsObject() as unknown as CharacterStateRow);
      }
      stateStmt.free();
    } catch (err) {
      return {
        output:
          `[novel_state_snapshot] 查询角色状态失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── 4. Determine first and last appearance ─────────────────────────
    // Also try chapters table to find associated chapters
    const chapterNums = states.map((s) => s.chapter_num);
    const firstChapter = chapterNums.length > 0 ? Math.min(...chapterNums) : null;
    const lastChapter = chapterNums.length > 0 ? Math.max(...chapterNums) : null;

    // ── 5. Query chapter_facts for this entity ─────────────────────────
    const facts: ChapterFactRow[] = [];
    try {
      const factStmt = db.prepare(
        `SELECT id, chapter_id, fact_type, entity_ref, description, chapter_num
         FROM chapter_facts
         WHERE entity_ref = ?
         ORDER BY chapter_num ASC`,
      );
      factStmt.bind([charRow.name]);

      while (factStmt.step()) {
        facts.push(factStmt.getAsObject() as unknown as ChapterFactRow);
      }
      factStmt.free();
    } catch {
      // Non-critical — facts may be empty
    }

    // ── 6. Parse states for display ────────────────────────────────────
    const parsedStates: ParsedState[] = states.map((s) => ({
      chapter_num: s.chapter_num,
      status_tags: safeParseArray(s.status_tags),
      power_level: s.power_level ?? null,
      location: s.location ?? null,
      items: safeParseArray(s.items),
      relationships: safeParseRelationships(s.relationships),
      narrative_state: s.narrative_state ?? null,
    }));

    // Current state = the last parsed state (or null if no states)
    const currentState =
      parsedStates.length > 0
        ? parsedStates[parsedStates.length - 1]
        : null;

    // ── 7. Collect all unique relationship changes ─────────────────────
    const allRelationships: { chapter_num: number; entry: RelationshipEntry }[] = [];
    for (const ps of parsedStates) {
      for (const rel of ps.relationships) {
        allRelationships.push({ chapter_num: ps.chapter_num, entry: rel });
      }
    }

    // ── 8. Build the output ────────────────────────────────────────────
    const lines: string[] = [];

    // Header
    const filterSuffix =
      at_chapter !== undefined ? `（截至第 ${at_chapter} 章）` : '';
    lines.push(`📊 **角色状态快照：${charRow.name}** ${filterSuffix}`, '');

    // Basic info
    lines.push('**基本信息**', '');
    lines.push(`- 所属世界：${worldName}`);
    const roleLabel: Record<string, string> = {
      protagonist: '主角',
      support: '配角',
      antagonist: '反派',
      npc: 'NPC',
    };
    lines.push(`- 角色类型：${roleLabel[charRow.role_type] ?? charRow.role_type}`);
    if (firstChapter !== null) {
      lines.push(`- 首次出场：第 ${firstChapter} 章`);
    }
    if (lastChapter !== null && lastChapter !== firstChapter) {
      lines.push(`- 最近出场：第 ${lastChapter} 章`);
    }
    if (charRow.description) {
      lines.push(`- 简介：${charRow.description}`);
    }
    lines.push('');

    // Current state
    if (currentState) {
      lines.push('**当前状态**', '');
      lines.push(
        `- 状态标签：${formatList(currentState.status_tags)}`,
      );
      lines.push(`- 实力等级：${currentState.power_level ?? '—'}`);
      lines.push(`- 位置：${currentState.location ?? '—'}`);
      lines.push(`- 物品：${formatList(currentState.items)}`);
      lines.push(
        `- 叙述状态：${currentState.narrative_state ?? '—'}`,
      );
      lines.push('');
    } else {
      lines.push('**当前状态**', '', '暂无状态记录。', '');
    }

    // State history table
    if (parsedStates.length > 0) {
      lines.push('**状态变化历程**', '');
      lines.push(
        '| 章节 | 状态标签 | 实力等级 | 位置 | 物品 |',
      );
      lines.push(
        '|------|---------|---------|------|------|',
      );

      for (const ps of parsedStates) {
        const ch = ps.chapter_num;
        const tags = formatList(ps.status_tags);
        const power = ps.power_level ?? '—';
        const loc = ps.location ?? '—';
        const items = formatList(ps.items);
        lines.push(`| ${ch} | ${tags} | ${power} | ${loc} | ${items} |`);
      }
      lines.push('');
    }

    // Relationship changes
    if (allRelationships.length > 0) {
      lines.push('**关系变化**', '');
      lines.push('| 章节 | 目标 | 变化 | 类型 |');
      lines.push('|------|------|------|------|');

      for (const { chapter_num, entry } of allRelationships) {
        lines.push(
          `| ${chapter_num} | ${entry.target} | ${entry.change} | ${entry.type} |`,
        );
      }
      lines.push('');
    }

    // Chapter facts
    if (facts.length > 0) {
      lines.push('**章节事实**', '');

      const factTypeLabels: Record<string, string> = {
        new_character: '新角色登场',
        location_change: '位置变动',
        item_acquire: '获得物品',
        plot_advance: '剧情推进',
        combat_result: '战斗结果',
        relationship_change: '关系变化',
        state_change: '状态变化',
        hook_set: '伏笔设置',
        hook_payoff: '伏笔回收',
      };

      for (const fact of facts) {
        const typeLabel =
          factTypeLabels[fact.fact_type] ?? fact.fact_type;
        lines.push(
          `- **第 ${fact.chapter_num} 章**（${typeLabel}）：${fact.description}`,
        );
      }
      lines.push('');
    }

    // Footer / meta
    if (parsedStates.length === 0) {
      lines.push(
        '⚠️ 该角色暂无状态变化记录。状态数据会在写作过程中由 AI 自动写入。',
      );
    }

    const output = lines.join('\n');

    return {
      output,
      metadata: {
        entity_id: charRow.id,
        entity_name: charRow.name,
        world_name: worldName,
        role_type: charRow.role_type,
        first_chapter: firstChapter,
        last_chapter: lastChapter,
        total_state_snapshots: parsedStates.length,
        total_facts: facts.length,
        current_power_level: currentState?.power_level ?? null,
        current_location: currentState?.location ?? null,
        current_status_tags: currentState?.status_tags ?? [],
      },
    };
  },
});
