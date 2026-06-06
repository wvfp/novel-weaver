/**
 * Novel Weaver — Pipeline Orchestration (4-Stage Writing Pipeline)
 *
 * Manages the end-to-end novel writing workflow through four sequential
 * stages: setting → planning → writing → reviewing.  State is persisted
 * to the `pipeline_state` SQLite table (auto-created on first use).
 *
 * Tools:
 *  - novel_pipeline_start  — start, resume, skip, or jump to any phase
 *  - novel_pipeline_status — formatted snapshot of current pipeline state
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import { getDatabase, generateId } from '../db/index.js';
import { loadGenreTemplate } from '../modules/chapter/genre-utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered list of pipeline phases.  Index = progression order. */
const PHASES = ['setting', 'planning', 'writing', 'reviewing'] as const;

type Phase = (typeof PHASES)[number];

const PHASE_LABELS: Record<Phase, string> = {
  setting:   '设定阶段（世界观、角色、篇章创建）',
  planning:  '规划阶段（章节大纲、剧情结构）',
  writing:   '写作阶段（章节正文撰写）',
  reviewing: '审查阶段（章节质量审查与修复）',
};

/** SQL to create the pipeline_state table if it doesn't exist yet. */
const CREATE_PIPELINE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS pipeline_state (
    id            TEXT PRIMARY KEY,
    arc_id    TEXT,
    current_phase TEXT NOT NULL DEFAULT 'setting',
    phases_json   TEXT NOT NULL DEFAULT '[]',
    started_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    status        TEXT NOT NULL DEFAULT 'active'
  );
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape single quotes for inline SQL (sql.js local DB). */
function sq(s: string): string {
  return s.replace(/'/g, "''");
}

/** Ensure the pipeline_state table exists. */
function ensurePipelineTable(): void {
  const db = getDatabase();
  if (!db) return;
  try {
    db.run(CREATE_PIPELINE_TABLE_SQL);
  } catch (err) {
    console.error(`[novel-weaver] Failed to create pipeline_state table: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Pipeline state loading / saving
// ---------------------------------------------------------------------------

interface PipelineState {
  id: string;
  arc_id: string | null;
  current_phase: Phase;
  phases_json: string;       // JSON array of completed phase names
  started_at: string;
  updated_at: string;
  status: string;
}

/**
 * Load the first (and typically only) active pipeline record.
 * Returns `null` when no pipeline exists.
 */
function loadPipeline(): PipelineState | null {
  const db = getDatabase();
  if (!db) return null;

  try {
    const result = db.exec(
      "SELECT id, arc_id, current_phase, phases_json, started_at, updated_at, status FROM pipeline_state WHERE status = 'active' LIMIT 1",
    );
    if (result.length === 0 || result[0].values.length === 0) return null;

    const r = result[0].values[0];
    return {
      id:          r[0] as string,
      arc_id:  r[1] as string | null,
      current_phase: r[2] as Phase,
      phases_json: r[3] as string,
      started_at:  r[4] as string,
      updated_at:  r[5] as string,
      status:      r[6] as string,
    };
  } catch (err) {
    console.error(`[novel-weaver] loadPipeline failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Create a fresh pipeline record with default starting state.
 * Returns the newly created record.
 */
function createPipeline(arcId?: string): PipelineState {
  const db = getDatabase();
  if (!db) throw new Error('数据库未初始化');

  const id = generateId();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    db.run(
      `INSERT INTO pipeline_state (id, arc_id, current_phase, phases_json, started_at, updated_at, status)
       VALUES (?, ?, 'setting', '[]', ?, ?, 'active')`,
      [id, arcId ?? null, now, now],
    );
  } catch (err) {
    throw new Error(
      `创建管线记录失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    id,
    arc_id: arcId ?? null,
    current_phase: 'setting',
    phases_json: '[]',
    started_at: now,
    updated_at: now,
    status: 'active',
  };
}

/**
 * Persist an updated pipeline state to the database.
 */
function savePipeline(state: PipelineState): void {
  const db = getDatabase();
  if (!db) return;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  try {
    db.run(
      `UPDATE pipeline_state
       SET current_phase = ?, phases_json = ?, updated_at = ?, status = ?
       WHERE id = ?`,
      [state.current_phase, state.phases_json, now, state.status, state.id],
    );
    state.updated_at = now;
  } catch (err) {
    console.error(`[novel-weaver] savePipeline failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Return the list of completed phases from the JSON string.
 */
function completedPhases(phasesJson: string): Phase[] {
  try {
    const arr = JSON.parse(phasesJson) as string[];
    return arr.filter((p): p is Phase => PHASES.includes(p as Phase));
  } catch {
    return [];
  }
}

/**
 * Determine the next uncompleted phase based on the completed list.
 * Returns the first phase that is not yet completed, or `null` if all are
 * done.
 */
function nextPhase(completed: Phase[]): Phase | null {
  for (const phase of PHASES) {
    if (!completed.includes(phase)) return phase;
  }
  return null;
}

/**
 * Advance the pipeline: mark the current phase as completed / skipped and
 * move current_phase to the next one.  When all phases are done the
 * pipeline status becomes 'completed'.
 */
function advancePipeline(state: PipelineState, skipped: boolean): void {
  const completed = completedPhases(state.phases_json);

  if (!completed.includes(state.current_phase)) {
    completed.push(state.current_phase);
  }

  state.phases_json = JSON.stringify(completed);

  const next = nextPhase(completed);
  if (next) {
    state.current_phase = next;
  } else {
    // All phases complete
    state.current_phase = PHASES[PHASES.length - 1]; // stay on last phase
    state.status = 'completed';
  }

  savePipeline(state);
}

// ---------------------------------------------------------------------------
// Phase context builders
// ---------------------------------------------------------------------------

/**
 * Build a rich context report for the **setting** phase.
 * Queries worlds, characters, and arcs tables to show the user what
 * has been created and what is still missing.
 */
function buildSettingContext(arcId?: string): string {
  const db = getDatabase();
  const lines: string[] = [];

  let worldCount = 0, coreCount = 0, arcWorldCount = 0;
  try {
    const worldResult = db?.exec("SELECT COUNT(*) as cnt FROM worlds");
    worldCount = (worldResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
    const coreResult = db?.exec("SELECT COUNT(*) as cnt FROM worlds WHERE type = 'core'");
    coreCount = (coreResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
    const arcWorldResult = db?.exec("SELECT COUNT(*) as cnt FROM worlds WHERE type = 'arc'");
    arcWorldCount = (arcWorldResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
  } catch (err) {
    console.error(`[novel-weaver] buildSettingContext query failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (worldCount > 0) {
    lines.push(`✅ **世界观已有 ${worldCount} 个世界设定**`);
    lines.push(`  - 核心世界：${coreCount} 个`);
    lines.push(`  - 篇章世界：${arcWorldCount} 个`);
  } else {
    lines.push(`❌ **尚无世界观设定**`);
    lines.push(`  - 请使用 \`novel_world_create\` 创建至少一个核心世界`);
  }

  // ── Characters ─────────────────────────────────────────────────────────
  let charCount = 0;
  try {
    const charResult = db?.exec("SELECT COUNT(*) as cnt FROM characters");
    charCount = (charResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
  } catch (err) {
    console.error(`[novel-weaver] buildSettingContext character query failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (charCount > 0) {
    lines.push(`✅ **已有 ${charCount} 个角色**`);
  } else {
    lines.push(`⚠️ **尚无角色** — 建议创建主角和关键配角`);
  }

  // ── Arcs (specific arc_id if given) ────────────────────────────
  try {
    if (arcId) {
      const aid = sq(arcId);
      const aResult = db?.exec(
        `SELECT id, name, theme, difficulty, status FROM arcs WHERE id = '${aid}'`,
      );
      if (aResult?.[0]?.values?.length ?? 0 > 0) {
        const aRow = aResult![0].values[0];
        lines.push(`✅ **篇章「${aRow[1]}」已存在**`);
        lines.push(`  - 主题：${aRow[2]} | 难度：${aRow[3]}/10 | 状态：${aRow[4]}`);
      } else {
        lines.push(`❌ **未找到篇章 ID「${arcId}」**`);
        lines.push(`  - 请使用 \`novel_arc_generate\` 创建篇章，或省略 arc_id`);
      }
    } else {
      const allAResult = db?.exec("SELECT COUNT(*) as cnt FROM arcs");
      const arcCount = (allAResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
      if (arcCount > 0) {
        lines.push(`✅ **已有 ${arcCount} 个篇章**`);
      } else {
        lines.push(`⚠️ **尚无篇章** — 使用 \`novel_arc_generate\` 创建篇章（副本/试炼/任务/剧情线/战役）`);
      }
    }
  } catch (err) {
    console.error(`[novel-weaver] buildSettingContext arc query failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  lines.push('');
  lines.push('**下一步建议**');
  lines.push('完善以上设定后，使用 `novel_pipeline_start phase=planning` 进入规划阶段。');

  return lines.join('\n');
}

/**
 * Build a context report for the **planning** phase.
 * Checks arcs for chapter planning data and shows the gap between
 * planned chapters and written chapters.
 */
function buildPlanningContext(arcId?: string): string {
  const db = getDatabase();
  const lines: string[] = [];

  if (arcId) {
    const aid = sq(arcId);

    // ── Arc info ─────────────────────────────────────────────────────
    const aResult = db?.exec(
      `SELECT id, name, theme, difficulty FROM arcs WHERE id = '${aid}'`,
    );
    if (aResult?.[0]?.values?.length ?? 0 > 0) {
      const aRow = aResult![0].values[0];
      lines.push(`📋 **篇章「${aRow[1]}」**`);
      lines.push(`  - 主题：${aRow[2]} | 难度：${aRow[3]}/10`);
    } else {
      lines.push(`❌ **未找到篇章 ID「${arcId}」**`);
      lines.push('请使用 `novel_arc_generate` 创建篇章后重试。');
      return lines.join('\n');
    }

    // ── Chapters written vs planned ──────────────────────────────────────
    const chResult = db?.exec(
      `SELECT COUNT(*) as cnt FROM chapters WHERE arc_id = '${aid}'`,
    );
    const writtenCount = (chResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
    lines.push(`📝 **已写章节：${writtenCount} 章**`);

    // Show last chapter if any
    if (writtenCount > 0) {
      const lastResult = db?.exec(
        `SELECT title, chapter_num, volume_num, word_count
         FROM chapters
         WHERE arc_id = '${aid}'
         ORDER BY volume_num DESC, chapter_num DESC LIMIT 1`,
      );
      if (lastResult?.[0]?.values?.length ?? 0 > 0) {
        const lr = lastResult![0].values[0];
        lines.push(`  - 最新章节：第 ${lr[2]} 卷第 ${lr[1]} 章「${lr[0]}」（${lr[3]} 字）`);
      }
    }

    // ── Progress steps as planning proxy ─────────────────────────────────
    const progResult = db?.exec(
      `SELECT COUNT(*) as cnt FROM progress WHERE arc_id = '${aid}'`,
    );
    const stepCount = (progResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
    if (stepCount > 0) {
      const doneResult = db?.exec(
        `SELECT COUNT(*) as cnt FROM progress WHERE arc_id = '${aid}' AND completed = 1`,
      );
      const doneCount = (doneResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
      lines.push(`📊 **攻略步骤：${doneCount}/${stepCount} 完成**`);
    } else {
      lines.push(`⚠️ **尚无攻略步骤** — 篇章缺少进度规划`);
    }
  } else {
    // No arc specified — show overview of all arcs
    const allAResult = db?.exec("SELECT COUNT(*) as cnt FROM arcs");
    const arcCount = (allAResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
    lines.push(`📋 **共有 ${arcCount} 个篇章**`);

    const chResult = db?.exec("SELECT COUNT(*) as cnt FROM chapters");
    const totalCh = (chResult?.[0]?.values?.[0]?.[0] as number) ?? 0;
    lines.push(`📝 **总章节数：${totalCh} 章**`);

    if (arcCount === 0) {
      lines.push('');
      lines.push('⚠️ 请先使用 `novel_arc_generate` 创建至少一个篇章。');
    } else {
      lines.push('');
      lines.push('💡 指定 `arc_id` 获取单个篇章的详细规划信息。');
    }
  }

  lines.push('');
  lines.push('**下一步建议**');
  lines.push('完成章节大纲规划后，使用 `novel_pipeline_start phase=writing` 进入写作阶段。');

  return lines.join('\n');
}

/**
 * Build a context report for the **writing** phase.
 * Loads last chapter and character/world context to guide the next chapter.
 */
function buildWritingContext(arcId?: string): string {
  const db = getDatabase();
  const lines: string[] = [];

  if (!arcId) {
    lines.push('⚠️ **写作阶段需要 arc_id**');
    lines.push('请提供篇章 ID，例如：`novel_pipeline_start phase=writing arc_id=<ID>`');
    return lines.join('\n');
  }

  const aid = sq(arcId);

  // ── Arc info ───────────────────────────────────────────────────────
  const aResult = db?.exec(
    `SELECT name, theme FROM arcs WHERE id = '${aid}'`,
  );
  let arcTheme = '';
  if (aResult?.[0]?.values?.length ?? 0 > 0) {
    const aRow = aResult![0].values[0];
    arcTheme = aRow[1] as string;
    lines.push(`📖 **篇章「${aRow[0]}」** — 主题：${arcTheme}`);
  } else {
    lines.push(`❌ **未找到篇章 ID「${arcId}」**`);
    return lines.join('\n');
  }

  // ── Last chapter ───────────────────────────────────────────────────────
  const lastResult = db?.exec(
    `SELECT title, chapter_num, volume_num, word_count
     FROM chapters
     WHERE arc_id = '${aid}'
     ORDER BY volume_num DESC, chapter_num DESC LIMIT 1`,
  );

  if (lastResult?.[0]?.values?.length ?? 0 > 0) {
    const lr = lastResult![0].values[0];
    lines.push(`📝 **上一章**：第 ${lr[2]} 卷第 ${lr[1]} 章「${lr[0]}」（${lr[3]} 字）`);
    lines.push(`📝 **下一章**：第 ${lr[2]} 卷第 ${(lr[1] as number) + 1} 章`);
  } else {
    lines.push(`📝 **尚无已写章节** — 准备开始第 1 卷第 1 章`);
  }

  // ── Total chapters & word count ────────────────────────────────────────
  const statsResult = db?.exec(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(word_count), 0) as total
     FROM chapters WHERE arc_id = '${aid}'`,
  );
  if (statsResult?.[0]?.values?.length ?? 0 > 0) {
    const sr = statsResult![0].values[0];
    lines.push(`📊 **当前进度**：${sr[0]} 章 / ${sr[1]} 字`);
  }

  // ── Character names for wikilinks ──────────────────────────────────────
  const charResult = db?.exec(
    `SELECT c.name FROM characters c
     JOIN arcs a ON a.world_id = c.world_id
     WHERE a.id = '${aid}'
     ORDER BY c.name`,
  );
  if (charResult?.[0]?.values?.length ?? 0 > 0) {
    const names = charResult![0].values.map((r) => r[0] as string);
    lines.push(`👥 **可用角色**（可在正文中使用 [[wikilink]] 引用）：`);
    lines.push(names.map((n) => `  - [[${n}]]`).join('\n'));
  }

  // ── Genre template context (via PlotWriter) ────────────────────────────
  const genreTemplate = loadGenreTemplate(arcTheme);
  if (genreTemplate) {
    lines.push('');
    lines.push(`📝 **题材模板：${genreTemplate.name}**`);
    if (genreTemplate.styleGuidelines && genreTemplate.styleGuidelines.length > 0) {
      lines.push('**风格指南**');
      for (const g of genreTemplate.styleGuidelines.slice(0, 3)) {
        lines.push(`  - ${g}`);
      }
    }
    if (genreTemplate.styleRules && genreTemplate.styleRules.length > 0) {
      lines.push('**写作规则**');
      for (const r of genreTemplate.styleRules.slice(0, 3)) {
        lines.push(`  - ${r}`);
      }
    }
    lines.push('');
    lines.push('💡 可使用 `novel_write_chapter` 配合题材模板进行写作。');
  }

  lines.push('');
  lines.push('**写作建议**');
  lines.push('使用 `novel_write_chapter`（指定章节号）或 `novel_write_continue`（自动续写）创作正文。');
  lines.push('完成后使用 `novel_pipeline_start phase=reviewing` 进入审查阶段。');

  return lines.join('\n');
}

/**
 * Build a context report for the **reviewing** phase.
 * Finds unreviewed chapters and shows existing review scores.
 */
function buildReviewingContext(arcId?: string): string {
  const db = getDatabase();
  const lines: string[] = [];

  // ── Unreviewed chapters ────────────────────────────────────────────────
  let unreviewedSql: string;

  if (arcId) {
    const aid = sq(arcId);
    unreviewedSql = `
      SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num, ch.word_count
      FROM chapters ch
      LEFT JOIN reviews r ON r.chapter_id = ch.id
      WHERE ch.arc_id = '${aid}' AND r.id IS NULL
      ORDER BY ch.volume_num, ch.chapter_num
    `;
  } else {
    unreviewedSql = `
      SELECT ch.id, ch.title, ch.chapter_num, ch.volume_num, ch.word_count, a.name AS arc_name
      FROM chapters ch
      LEFT JOIN reviews r ON r.chapter_id = ch.id
      LEFT JOIN arcs a ON a.id = ch.arc_id
      WHERE r.id IS NULL
      ORDER BY ch.volume_num, ch.chapter_num
    `;
  }

  const unrevResult = db?.exec(unreviewedSql);
  const unreviewedRows = unrevResult?.[0]?.values ?? [];

  if (unreviewedRows.length > 0) {
    lines.push(`📋 **待审查章节（${unreviewedRows.length} 章）**`);
    for (const row of unreviewedRows) {
      const title = row[1] as string;
      const chNum = row[2] as number;
      const volNum = row[3] as number;
      const wc = row[4] as number;
      const arcName = row[5] as string | undefined;
      const suffix = arcName ? ` [${arcName}]` : '';
      lines.push(`  - 第 ${volNum} 卷第 ${chNum} 章「${title}」（${wc} 字）${suffix}`);
    }
  } else {
    lines.push('✅ **所有章节均已审查**');
  }

  // ── Recent review scores ───────────────────────────────────────────────
  const reviewResult = db?.exec(
    `SELECT r.verdict, r.reviewed_at, ch.title, ch.chapter_num, ch.volume_num
     FROM reviews r
     JOIN chapters ch ON ch.id = r.chapter_id
     ORDER BY r.reviewed_at DESC LIMIT 5`,
  );

  const reviewRows = reviewResult?.[0]?.values ?? [];
  if (reviewRows.length > 0) {
    lines.push('');
    lines.push(`📊 **最近审查结果（最近 ${reviewRows.length} 条）**`);
    for (const row of reviewRows) {
      const verdict = row[0] as string;
      const reviewedAt = row[1] as string;
      const title = row[2] as string;
      const chNum = row[3] as number;
      const volNum = row[4] as number;
      const verdictIcon = verdict === 'pass' ? '✅' : verdict === 'needs-revision' ? '⚠️' : '❌';
      lines.push(`  ${verdictIcon} 第 ${volNum} 卷第 ${chNum} 章「${title}」— ${verdict}（${reviewedAt}）`);
    }
  }

  // ── Chapter status breakdown ───────────────────────────────────────────
  const statusResult = db?.exec(
    `SELECT status, COUNT(*) as cnt FROM chapters GROUP BY status`,
  );
  const statusRows = statusResult?.[0]?.values ?? [];
  if (statusRows.length > 0) {
    lines.push('');
    lines.push('📊 **章节状态分布**');
    for (const row of statusRows) {
      lines.push(`  - ${row[0]}：${row[1]} 章`);
    }
  }

  lines.push('');
  lines.push('**审查建议**');
  lines.push('使用 `novel_review_chapter chapter_id=<ID>` 审查待审章节。');
  lines.push('审查通过后可使用 `novel_pipeline_start phase=setting` 开始新一轮创作循环。');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Orchestration: run phase-specific logic and return the pipeline output
// ---------------------------------------------------------------------------

function buildPhaseOutput(
  phase: Phase,
  state: PipelineState,
  arcId?: string,
  skip?: boolean,
): string {
  const completed = completedPhases(state.phases_json);
  const phaseIndex = PHASES.indexOf(phase);
  const isComplete = state.status === 'completed';

  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(`## 📋 管线状态：${PHASE_LABELS[phase]}`);

  if (isComplete) {
    lines.push('');
    lines.push('🎉 **所有阶段已完成！** 管线已结束。');
    lines.push('可调用 `novel_pipeline_start phase=setting` 开始新一轮创作。');
    return lines.join('\n');
  }

  // ── Phase progression bar ──────────────────────────────────────────────
  lines.push('');
  lines.push('**阶段进度**');
  const barParts = PHASES.map((p, i) => {
    if (completed.includes(p)) return `~~${i + 1}. ${p}~~ ✅`;
    if (p === phase) return `**${i + 1}. ${p}** ⬅️`;
    return `${i + 1}. ${p} ⏳`;
  });
  lines.push(`> ${barParts.join(' → ')}`);
  lines.push('');

  // ── Skip indicator ─────────────────────────────────────────────────────
  if (skip) {
    lines.push(`⏭️ 已跳过「${phase}」阶段，进入下一阶段。`);
    lines.push('');
  }

  // ── Phase-specific context ─────────────────────────────────────────────
  let context: string;
  switch (phase) {
    case 'setting':
      context = buildSettingContext(arcId);
      break;
    case 'planning':
      context = buildPlanningContext(arcId);
      break;
    case 'writing':
      context = buildWritingContext(arcId);
      break;
    case 'reviewing':
      context = buildReviewingContext(arcId);
      break;
  }
  lines.push(context);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool 1 — novel_pipeline_start
// ---------------------------------------------------------------------------

export const novel_pipeline_start = tool({
  description:
    '启动或恢复 4 阶段写作管线（设定→规划→写作→审查）。自动检测当前阶段并引导用户完成。支持跳过和中断恢复。',

  args: {
    phase: tool.schema
      .enum(['setting', 'planning', 'writing', 'reviewing', 'auto'])
      .default('auto')
      .describe('目标阶段（auto=自动从上次中断处继续）'),
    arc_id: tool.schema
      .string()
      .optional()
      .describe('篇章 ID（写作/审查阶段通常需要）'),
    skip: tool.schema
      .boolean()
      .optional()
      .describe('跳过当前阶段（true=标记已跳过并进入下一阶段）'),
  },

  async execute(args, context) {
    const { phase: targetPhase, arc_id: arcId, skip } = args;

    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化。请先运行 novel_init 初始化项目。' };
    }

    // ── 1. Ensure pipeline table exists ─────────────────────────────────
    ensurePipelineTable();

    // ── 2. Load or create pipeline state ────────────────────────────────
    let state = loadPipeline();

    if (!state) {
      // No existing pipeline — create a fresh one
      state = createPipeline(arcId ?? undefined);
    } else if (arcId && arcId !== state.arc_id) {
      // If a different arc_id is provided, update it
      state.arc_id = arcId;
    }

    // ── 3. Determine target phase ───────────────────────────────────────
    let effectivePhase: Phase;

    if (targetPhase === 'auto') {
      // Resume from where we left off (current_phase)
      effectivePhase = state.current_phase;

      // If pipeline is completed, default back to setting for a new cycle
      if (state.status === 'completed') {
        effectivePhase = 'setting';
        state.current_phase = 'setting';
        state.phases_json = '[]';
        state.status = 'active';
      }
    } else {
      // Manual phase jump
      effectivePhase = targetPhase;

      // When jumping backwards or to a different phase, reset completed
      // list so that the target phase becomes the current one, and all
      // phases after it are uncompleted.
      const targetIdx = PHASES.indexOf(targetPhase);
      const completed = completedPhases(state.phases_json).filter(
        (p) => PHASES.indexOf(p) < targetIdx,
      );

      state.current_phase = targetPhase;
      state.phases_json = JSON.stringify(completed);
      state.status = 'active';
    }

    // ── 4. Handle skip ──────────────────────────────────────────────────
    if (skip) {
      advancePipeline(state, true);
      // After advancing, effectivePhase is now the next phase
      effectivePhase = state.current_phase;
    }

    // ── 5. Build phase context output ───────────────────────────────────
    const output = buildPhaseOutput(effectivePhase, state, state.arc_id ?? undefined, skip ?? false);

    // ── 6. Save updated state ───────────────────────────────────────────
    state.current_phase = effectivePhase;
    savePipeline(state);

    const completed = completedPhases(state.phases_json);

    return {
      output,
      metadata: {
        pipeline_id: state.id,
        current_phase: effectivePhase,
        completed_phases: completed,
        status: state.status,
        arc_id: state.arc_id,
        skip_applied: skip ?? false,
        phase_progression: {
          setting: completed.includes('setting') ? (skip && effectivePhase !== 'setting' ? 'skipped' : 'completed') : (effectivePhase === 'setting' ? 'in_progress' : 'pending'),
          planning: completed.includes('planning') ? (skip && effectivePhase !== 'planning' ? 'skipped' : 'completed') : (effectivePhase === 'planning' ? 'in_progress' : 'pending'),
          writing: completed.includes('writing') ? (skip && effectivePhase !== 'writing' ? 'skipped' : 'completed') : (effectivePhase === 'writing' ? 'in_progress' : 'pending'),
          reviewing: completed.includes('reviewing') ? (skip && effectivePhase !== 'reviewing' ? 'skipped' : 'completed') : (effectivePhase === 'reviewing' ? 'in_progress' : 'pending'),
        },
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool 2 — novel_pipeline_status
// ---------------------------------------------------------------------------

export const novel_pipeline_status = tool({
  description:
    '显示当前管线状态：当前阶段、已完成阶段、各阶段详细信息（设定/规划/写作/审查），以及所用篇章上下文。',

  args: {},

  async execute(_args, _context) {
    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化。请先运行 novel_init 初始化项目。' };
    }

    // ── 1. Ensure table exists & load state ─────────────────────────────
    ensurePipelineTable();
    const state = loadPipeline();

    if (!state) {
      return {
        output: [
          '## 📋 管线状态：未启动',
          '',
          '尚无写作管线记录。',
          '使用 `novel_pipeline_start` 启动 4 阶段创作管线。',
          '',
          '**管线流程**',
          '1. 设定阶段 — 创建世界观、角色、篇章',
          '2. 规划阶段 — 规划章节结构和剧情大纲',
          '3. 写作阶段 — 撰写章节正文',
          '4. 审查阶段 — 审查并修复章节质量',
        ].join('\n'),
        metadata: {
          pipeline_active: false,
          current_phase: null,
          completed_phases: [],
          status: 'inactive',
        },
      };
    }

    const completed = completedPhases(state.phases_json);
    const lines: string[] = [];

    // ── Header ──────────────────────────────────────────────────────────
    lines.push(`## 📋 管线状态`);
    lines.push('');

    if (state.status === 'completed') {
      lines.push('🎉 **所有阶段已完成！**');
    } else if (state.status === 'active') {
      lines.push(`⏳ **当前阶段**：${PHASE_LABELS[state.current_phase]}`);
    }

    lines.push(`- **管线 ID**：\`${state.id}\``);
    lines.push(`- **状态**：${state.status === 'active' ? '🟢 进行中' : state.status === 'completed' ? '✅ 已完成' : '🔴 已结束'}`);
    lines.push(`- **创建时间**：${state.started_at}`);
    lines.push(`- **更新时间**：${state.updated_at}`);

    if (state.arc_id) {
      lines.push(`- **关联篇章**：\`${state.arc_id}\``);
    }

    lines.push('');

    // ── Phase progression bar ──────────────────────────────────────────
    lines.push('**阶段进度**');
    const barParts = PHASES.map((p, i) => {
      if (completed.includes(p)) return `~~${i + 1}. ${p}~~ ✅`;
      if (p === state.current_phase) return `**${i + 1}. ${p}** ⬅️`;
      return `${i + 1}. ${p} ⏳`;
    });
    lines.push(`> ${barParts.join(' → ')}`);
    lines.push('');

    // ── Phase details ──────────────────────────────────────────────────
    for (let i = 0; i < PHASES.length; i++) {
      const phase = PHASES[i];
      const isCurrent = phase === state.current_phase;
      const isDone = completed.includes(phase);

      const statusIcon = isDone ? '✅' : isCurrent ? '⬅️' : '⏳';
      lines.push(`### ${statusIcon} 阶段 ${i + 1}：${phase}`);

      if (isDone) {
        lines.push('已完成。');
      } else if (isCurrent) {
        // Show phase-specific context summary
        let contextSummary = '';
        try {
          switch (phase) {
            case 'setting': {
              const wResult = db.exec("SELECT COUNT(*) as cnt FROM worlds");
              const wc = (wResult[0]?.values[0]?.[0] as number) ?? 0;
              const cResult = db.exec("SELECT COUNT(*) as cnt FROM characters");
              const cc = (cResult[0]?.values[0]?.[0] as number) ?? 0;
              contextSummary = `世界观 ${wc} 个，角色 ${cc} 个。`;
              break;
            }
            case 'planning': {
              const chResult = db.exec("SELECT COUNT(*) as cnt FROM chapters");
              const chc = (chResult[0]?.values[0]?.[0] as number) ?? 0;
              contextSummary = `已写 ${chc} 章。`;
              break;
            }
            case 'writing': {
              const chResult = db.exec("SELECT COUNT(*) as cnt FROM chapters");
              const chc = (chResult[0]?.values[0]?.[0] as number) ?? 0;
              const wcResult = db.exec("SELECT COALESCE(SUM(word_count), 0) as total FROM chapters");
              const twc = (wcResult[0]?.values[0]?.[0] as number) ?? 0;
              contextSummary = `已写 ${chc} 章，共 ${twc} 字。`;
              break;
            }
            case 'reviewing': {
              const unrevResult = db.exec(`
                SELECT COUNT(*) as cnt FROM chapters ch
                LEFT JOIN reviews r ON r.chapter_id = ch.id
                WHERE r.id IS NULL
              `);
              const unc = (unrevResult[0]?.values[0]?.[0] as number) ?? 0;
              contextSummary = `待审查 ${unc} 章。`;
              break;
            }
          }
        } catch (err) {
          console.error(`[novel-weaver] pipeline_status context query failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (contextSummary) {
          lines.push(`当前阶段：${contextSummary}`);
        }
        lines.push(`使用 \`novel_pipeline_start\` 继续此阶段的创作。`);
      } else {
        lines.push('等待前置阶段完成。');
      }
      lines.push('');
    }

    // ── Next-step guidance ──────────────────────────────────────────────
    if (state.status === 'active') {
      lines.push('**下一步建议**');
      lines.push(`使用 \`novel_pipeline_start\` 继续管线创作。`);
      if (state.arc_id) {
        lines.push(`当前关联篇章 ID：\`${state.arc_id}\``);
      }
      lines.push('使用 `novel_pipeline_start skip=true` 跳过当前阶段。');
    }

    return {
      output: lines.join('\n'),
      metadata: {
        pipeline_active: true,
        pipeline_id: state.id,
        current_phase: state.current_phase,
        completed_phases: completed,
        status: state.status,
        arc_id: state.arc_id,
        started_at: state.started_at,
        updated_at: state.updated_at,
      },
    };
  },
});
