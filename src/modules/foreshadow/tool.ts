/**
 * novel-weaver Foreshadow Tracking Tool
 *
 * Tracks hooks (伏笔) across chapters by analysing chapter_facts entries:
 *  - Hook set: when a hook/question/chekhov's gun is introduced (hook_set type)
 *  - Hook payoff: when a hook is resolved (hook_payoff type)
 *  - Unresolved hooks: hooks set N+ chapters ago without payoff
 *  - Hook density: hooks per chapter
 *  - Hook type distribution: categories of hooks
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import { getDatabase } from '../../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single hook_set row from chapter_facts enriched with arc info. */
interface HookSetRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  chapter_num: number;
  entity_ref: string | null;
  description: string;
  created_at: string;
  arc_name: string;
  chapter_title: string;
}

/** A single hook_payoff row from chapter_facts. */
interface HookPayoffRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  chapter_num: number;
  entity_ref: string | null;
  description: string;
  created_at: string;
}

/** A hook with its resolved status and category. */
interface Hook {
  id: string;
  chapter_num: number;
  arc_name: string;
  chapter_title: string;
  entity_ref: string | null;
  description: string;
  category: HookCategory;
  resolved: boolean;
  payoff_chapter_num: number | null;
  chapters_ago: number;
}

/** Categorised hook type. */
type HookCategory =
  | 'mystery_hook'
  | 'crisis_hook'
  | 'emotional_hook'
  | 'world_building_hook'
  | 'relationship_hook'
  | 'uncategorised';

/** Hook density per chapter. */
interface ChapterDensity {
  chapter_num: number;
  hook_count: number;
}

/** Type distribution counts. */
type TypeDistribution = Record<HookCategory, number>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Keywords that hint at a hook's narrative category. */
const CATEGORY_KEYWORDS: Record<HookCategory, string[]> = {
  mystery_hook: [
    '谜', '秘密', '真相', '为什么', '疑问', '谜团', '可疑', '奇怪',
    '神秘', '未知', '隐藏', '暗', '密码', '谜题', '线索',
  ],
  crisis_hook: [
    '危机', '危险', '威胁', '战斗', '冲突', '对决', '死亡', '毁灭',
    '灾难', '浩劫', '决战', '陷阱', '伏击',
  ],
  emotional_hook: [
    '情感', '情感', '爱', '恨', '羁绊', '牵挂', '背叛', '信任',
    '误会', '承诺', '约定', '遗憾', '悔恨', '救赎',
  ],
  world_building_hook: [
    '世界', '设定', '规则', '体系', '传说', '历史', '遗迹', '宝物',
    '神器', '秘境', '大陆', '种族', '文明',
  ],
  relationship_hook: [
    '关系', '相遇', '重逢', '师徒', '兄弟', '姐妹', '盟友', '敌人',
    '同伴', '伙伴', '家族', '血脉',
  ],
  uncategorised: [],
};

/** Default unresolved threshold in chapters. */
const DEFAULT_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a parameterised SELECT query and return all rows as objects.
 */
function queryAll<T extends Record<string, unknown>>(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  sql: string,
  params: unknown[],
): T[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row) rows.push(row as T);
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

/**
 * Categorise a hook by scanning entity_ref and description for category keywords.
 */
function categoriseHook(entityRef: string | null, description: string): HookCategory {
  const text = [entityRef ?? '', description].join(' ').toLowerCase();

  // Score each category by keyword hits
  const scores = new Map<HookCategory, number>();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const cat = category as HookCategory;
    if (cat === 'uncategorised') continue;
    let score = 0;
    for (const kw of keywords) {
      // Count occurrences of each keyword
      let idx = 0;
      while (true) {
        idx = text.indexOf(kw, idx);
        if (idx === -1) break;
        score++;
        idx += kw.length;
      }
    }
    if (score > 0) scores.set(cat, score);
  }

  // Return the highest-scoring category
  let best: HookCategory = 'uncategorised';
  let bestScore = 0;
  for (const [cat, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  return best;
}

/**
 * Get the latest chapter number in scope (for computing chapters_ago).
 */
function getLatestChapterNum(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId: string | null,
): number {
  const sql = arcId
    ? 'SELECT COALESCE(MAX(chapter_num), 0) AS max_num FROM chapters WHERE arc_id = ?'
    : 'SELECT COALESCE(MAX(chapter_num), 0) AS max_num FROM chapters';
  const params: unknown[] = arcId ? [arcId] : [];
  const rows = queryAll<{ max_num: number }>(db, sql, params);
  return rows.length > 0 ? rows[0].max_num : 0;
}

// ---------------------------------------------------------------------------
// Foreshadow Engine
// ---------------------------------------------------------------------------

/**
 * Run the foreshadow analysis.
 *
 * @param db           - Database handle
 * @param arcId        - Optional arc filter
 * @param threshold    - Chapters after which a hook is flagged as unresolved
 * @returns Analysis result with hooks, unresolved list, density, summary
 */
function runForeshadowAnalysis(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  arcId: string | null,
  threshold: number,
): {
  hooks: Hook[];
  unresolved: Hook[];
  density: ChapterDensity[];
  summary: {
    total_hooks: number;
    resolved: number;
    unresolved_count: number;
    resolution_rate: string;
    threshold: number;
    arc_filter: string | null;
    type_distribution: TypeDistribution;
  };
} {
  // ── 1. Get max chapter number for scope ──────────────────────────────
  const maxChapterNum = getLatestChapterNum(db, arcId);
  const latestChapter = maxChapterNum;

  // ── 2. Build the SQL for hook_set entries ────────────────────────────
  const hookSetSql = arcId
    ? `SELECT
         cf.id, cf.chapter_id, cf.chapter_num,
         cf.entity_ref, cf.description, cf.created_at,
         a.name AS arc_name,
         c.title AS chapter_title
       FROM chapter_facts cf
       JOIN chapters c ON cf.chapter_id = c.id
       JOIN arcs a ON c.arc_id = a.id
       WHERE cf.fact_type = 'hook_set'
         AND c.arc_id = ?
       ORDER BY cf.chapter_num ASC`
    : `SELECT
         cf.id, cf.chapter_id, cf.chapter_num,
         cf.entity_ref, cf.description, cf.created_at,
         a.name AS arc_name,
         c.title AS chapter_title
       FROM chapter_facts cf
       JOIN chapters c ON cf.chapter_id = c.id
       JOIN arcs a ON c.arc_id = a.id
       WHERE cf.fact_type = 'hook_set'
       ORDER BY cf.chapter_num ASC`;

  const hookSetParams: unknown[] = arcId ? [arcId] : [];
  const hookSets = queryAll<HookSetRow>(db, hookSetSql, hookSetParams);

  // ── 3. Get all hook_payoff entries ───────────────────────────────────
  const payoffSql = arcId
    ? `SELECT
         cf.id, cf.chapter_id, cf.chapter_num,
         cf.entity_ref, cf.description, cf.created_at
       FROM chapter_facts cf
       JOIN chapters c ON cf.chapter_id = c.id
       WHERE cf.fact_type = 'hook_payoff'
         AND c.arc_id = ?
       ORDER BY cf.chapter_num ASC`
    : `SELECT
         cf.id, cf.chapter_id, cf.chapter_num,
         cf.entity_ref, cf.description, cf.created_at
       FROM chapter_facts cf
       WHERE cf.fact_type = 'hook_payoff'
       ORDER BY cf.chapter_num ASC`;

  const payoffParams: unknown[] = arcId ? [arcId] : [];
  const payoffs = queryAll<HookPayoffRow>(db, payoffSql, payoffParams);

  // ── 4. Match payoffs to hook sets ────────────────────────────────────
  // Strategy: match by entity_ref first, then fallback to description overlap
  const matchedSetIds = new Set<string>();
  const hookPayoffMap = new Map<string, HookPayoffRow[]>(); // hook_set_id -> payoffs

  for (const payoff of payoffs) {
    // Find matching hook_set by entity_ref
    let matchedId: string | null = null;

    if (payoff.entity_ref) {
      // Try exact entity_ref match
      const exactMatch = hookSets.find(
        (h) => h.entity_ref === payoff.entity_ref && !matchedSetIds.has(h.id),
      );
      if (exactMatch) {
        matchedId = exactMatch.id;
      }
    }

    if (!matchedId) {
      // Fallback: match by description overlap (first 40 chars similarity)
      const payDesc = payoff.description.slice(0, 40).trim();
      const fuzzyMatch = hookSets.find((h) => {
        if (matchedSetIds.has(h.id)) return false;
        const setDesc = h.description.slice(0, 40).trim();
        return setDesc === payDesc || (payDesc.length > 10 && setDesc.includes(payDesc));
      });
      if (fuzzyMatch) {
        matchedId = fuzzyMatch.id;
      }
    }

    if (matchedId) {
      matchedSetIds.add(matchedId);
      const existing = hookPayoffMap.get(matchedId) ?? [];
      existing.push(payoff);
      hookPayoffMap.set(matchedId, existing);
    }
  }

  // ── 5. Build hook list with resolution status ────────────────────────
  const hooks: Hook[] = [];
  const densityMap = new Map<number, number>();

  for (const hs of hookSets) {
    const payoffsForHook = hookPayoffMap.get(hs.id) ?? [];
    const resolved = payoffsForHook.length > 0;
    const latestPayoffChapter = resolved
      ? Math.max(...payoffsForHook.map((p) => p.chapter_num))
      : null;

    const chaptersSince = latestPayoffChapter
      ? latestChapter - latestPayoffChapter
      : latestChapter - hs.chapter_num;

    // Track density
    densityMap.set(hs.chapter_num, (densityMap.get(hs.chapter_num) ?? 0) + 1);

    hooks.push({
      id: hs.id,
      chapter_num: hs.chapter_num,
      arc_name: hs.arc_name,
      chapter_title: hs.chapter_title,
      entity_ref: hs.entity_ref,
      description: hs.description,
      category: categoriseHook(hs.entity_ref, hs.description),
      resolved,
      payoff_chapter_num: latestPayoffChapter,
      chapters_ago: chaptersSince,
    });
  }

  // ── 6. Identify unresolved hooks beyond threshold ────────────────────
  const unresolved = hooks.filter((h) => !h.resolved && h.chapters_ago >= threshold);

  // ── 7. Build density table ────────────────────────────────────────────
  const density: ChapterDensity[] = [...densityMap.entries()]
    .map(([chapterNum, hookCount]) => ({ chapter_num: chapterNum, hook_count: hookCount }))
    .sort((a, b) => a.chapter_num - b.chapter_num);

  // ── 8. Build type distribution ────────────────────────────────────────
  const typeDistribution: TypeDistribution = {
    mystery_hook: 0,
    crisis_hook: 0,
    emotional_hook: 0,
    world_building_hook: 0,
    relationship_hook: 0,
    uncategorised: 0,
  };

  for (const h of hooks) {
    typeDistribution[h.category] = (typeDistribution[h.category] ?? 0) + 1;
  }

  // ── 9. Summary ───────────────────────────────────────────────────────
  const totalHooks = hooks.length;
  const resolvedCount = hooks.filter((h) => h.resolved).length;
  const rate = totalHooks > 0
    ? `${((resolvedCount / totalHooks) * 100).toFixed(1)}%`
    : 'N/A';

  return {
    hooks,
    unresolved,
    density,
    summary: {
      total_hooks: totalHooks,
      resolved: resolvedCount,
      unresolved_count: unresolved.length,
      resolution_rate: rate,
      threshold,
      arc_filter: arcId,
      type_distribution: typeDistribution,
    },
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Category label in Chinese. */
function categoryLabel(cat: HookCategory): string {
  const labels: Record<HookCategory, string> = {
    mystery_hook: '悬疑型',
    crisis_hook: '危机型',
    emotional_hook: '情感型',
    world_building_hook: '世界观型',
    relationship_hook: '关系型',
    uncategorised: '未分类',
  };
  return labels[cat] ?? '未分类';
}

/** Category icon. */
function categoryIcon(cat: HookCategory): string {
  const icons: Record<HookCategory, string> = {
    mystery_hook: '🔍',
    crisis_hook: '⚡',
    emotional_hook: '💖',
    world_building_hook: '🌍',
    relationship_hook: '🔗',
    uncategorised: '❓',
  };
  return icons[cat] ?? '❓';
}

/**
 * Build the formatted output text.
 */
function buildOutput(result: ReturnType<typeof runForeshadowAnalysis>): string {
  const { hooks, unresolved, density, summary } = result;
  const lines: string[] = [];

  // ── Header ───────────────────────────────────────────────────────────
  lines.push('# 🔮 伏笔追踪报告', '');
  if (summary.arc_filter) {
    lines.push(`> 范围：篇章 \`${summary.arc_filter}\``, '');
  }
  lines.push(`> 生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`, '');
  lines.push('');

  // ── Summary ──────────────────────────────────────────────────────────
  lines.push('## 📊 概览', '');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push(`| 总伏笔数 | ${summary.total_hooks} |`);
  lines.push(`| 已回收 | ${summary.resolved} |`);
  lines.push(`| 未回收（≥${summary.threshold}章） | ${summary.unresolved_count} |`);
  lines.push(`| 回收率 | ${summary.resolution_rate} |`);
  lines.push('');

  // ── Type Distribution ────────────────────────────────────────────────
  const typeCategories: HookCategory[] = [
    'mystery_hook',
    'crisis_hook',
    'emotional_hook',
    'world_building_hook',
    'relationship_hook',
    'uncategorised',
  ];
  const hasTypes = typeCategories.some((cat) => (summary.type_distribution[cat] ?? 0) > 0);

  if (hasTypes) {
    lines.push('### 伏笔类型分布', '');
    lines.push('| 类型 | 数量 | 占比 |');
    lines.push('|------|------|------|');
    for (const cat of typeCategories) {
      const count = summary.type_distribution[cat] ?? 0;
      const pct = summary.total_hooks > 0
        ? `${((count / summary.total_hooks) * 100).toFixed(1)}%`
        : '0%';
      if (count > 0) {
        lines.push(`| ${categoryIcon(cat)} ${categoryLabel(cat)} | ${count} | ${pct} |`);
      }
    }
    lines.push('');
  }

  // ── Unresolved Hooks ─────────────────────────────────────────────────
  if (unresolved.length > 0) {
    lines.push(`## ⚠️ 未回收伏笔（${unresolved.length} 项，超过 ${summary.threshold} 章未回收）`, '');
    lines.push('');

    for (let idx = 0; idx < unresolved.length; idx++) {
      const h = unresolved[idx];
      lines.push(`### ${idx + 1}. ${categoryIcon(h.category)} ${h.description.slice(0, 60)}${h.description.length > 60 ? '…' : ''}`);
      lines.push('');
      lines.push(`- **设置章节**：第 ${h.chapter_num} 章「${h.chapter_title}」`);
      lines.push(`- **篇章**：${h.arc_name}`);
      lines.push(`- **类型**：${categoryLabel(h.category)}`);
      lines.push(`- **已过章节**：${h.chapters_ago} 章`);
      if (h.entity_ref) {
        lines.push(`- **关联实体**：\`${h.entity_ref}\``);
      }
      lines.push(`- **描述**：${h.description}`);
      lines.push('');
    }

    lines.push('---', '');
  } else if (hooks.length > 0) {
    lines.push('✅ **所有伏笔均在合理章节范围内已回收，没有超过阈值的未回收伏笔。**', '');
    lines.push('');
  }

  // ── Hook Density ─────────────────────────────────────────────────────
  if (density.length > 0) {
    lines.push('## 📈 伏笔密度（每章节伏笔数）', '');
    lines.push('');
    lines.push('| 章节 | 伏笔数 | 密度评级 |');
    lines.push('|------|--------|----------|');

    let maxDensity = 0;
    for (const d of density) {
      if (d.hook_count > maxDensity) maxDensity = d.hook_count;
    }

    for (const d of density) {
      let rating: string;
      if (d.hook_count === 0) {
        rating = '🟢 无';
      } else if (d.hook_count <= 2) {
        rating = '🟢 适中';
      } else if (d.hook_count <= 4) {
        rating = '🟡 偏高';
      } else {
        rating = '🔴 过高';
      }
      lines.push(`| 第 ${d.chapter_num} 章 | ${d.hook_count} | ${rating} |`);
    }
    lines.push('');

    // Overall density assessment
    const totalChapters = density.length;
    const totalHooks = summary.total_hooks;
    if (totalChapters > 0) {
      const avgDensity = (totalHooks / totalChapters).toFixed(2);
      lines.push(`> 平均密度：每章 ${avgDensity} 个伏笔`, '');
      if (maxDensity > 4) {
        lines.push('> ⚠️ 某些章节伏笔密度过高（>4），可能导致读者困惑。建议适当分散到周边章节。', '');
      } else if (totalHooks > 0 && parseFloat(avgDensity) < 0.3) {
        lines.push('> ℹ️ 平均密度偏低，故事可能缺乏悬念张力。可考虑适当增加伏笔设置。', '');
      }
      lines.push('');
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────
  if (hooks.length === 0) {
    lines.push('📭 **未发现任何伏笔记录。**', '');
    lines.push('');
    lines.push('> 伏笔通过章节写作中的 `chapter_facts` 自动记录。', '');
    lines.push('> 写作时添加 `hook_set` 和 `hook_payoff` 类型的事实即可追踪。', '');
    lines.push('');
  }

  // ── Footer ───────────────────────────────────────────────────────────
  lines.push('---', '');
  lines.push('> 报告引擎：novel-weaver foreshadow-tracker | 阈值：≥', '');
  // Fix the threshold display — redo last line
  lines.pop();
  lines.push(`> 报告引擎：novel-weaver foreshadow-tracker | 阈值：≥ ${summary.threshold} 章无回收即标记`, '');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool: novel_foreshadow
// ---------------------------------------------------------------------------

export const novel_foreshadow = tool({
  description:
    '追踪小说中的伏笔（hooks/foreshadowing）设置与回收情况。'
    + '分析 chapter_facts 中的 hook_set（设置伏笔）和 hook_payoff（回收伏笔）条目，'
    + '生成包含回收率、未回收伏笔列表、伏笔密度和类型分布的追踪报告。'
    + '支持按篇章筛选和自定义未回收阈值。',
  args: {
    arc_id: tool.schema
      .string()
      .optional()
      .describe('篇章 ID（可选），指定后只分析该篇章内的伏笔'),
    threshold: tool.schema
      .number()
      .optional()
      .describe('未回收伏笔的章节阈值（默认 10），超过此章节数无回收即标记为未回收'),
  },
  async execute(args, _context) {
    const db = getDatabase();
    if (!db) {
      return { output: '请先初始化小说项目，使用 novel_init 工具。' };
    }

    const arcId: string | null = args.arc_id ?? null;
    const threshold: number = args.threshold ?? DEFAULT_THRESHOLD;

    if (threshold < 1) {
      return { output: '❌ threshold 参数必须大于等于 1。' };
    }

    let result: ReturnType<typeof runForeshadowAnalysis>;
    try {
      result = runForeshadowAnalysis(db, arcId, threshold);
    } catch (err) {
      return {
        output: `❌ 伏笔分析执行错误：${(err as Error).message}`,
      };
    }

    const output = buildOutput(result);

    return {
      output,
      metadata: {
        total_hooks: result.summary.total_hooks,
        resolved: result.summary.resolved,
        unresolved_count: result.summary.unresolved_count,
        resolution_rate: result.summary.resolution_rate,
        threshold: result.summary.threshold,
        arc_filter: result.summary.arc_filter,
        type_distribution: result.summary.type_distribution,
        unresolved_ids: result.unresolved.map((h) => h.id),
      },
    };
  },
});
