/**
 * 篇章进度追踪 Tool — novel_progress_track & novel_progress_summary
 *
 * 提供篇章进度的查看、更新和汇总报告生成功能。
 * 与 arc.ts 中的 insertProgressStep() 和 generateArcContent() 配合使用。
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tool } from '@opencode-ai/plugin/tool';
import type { ToolContext } from '@opencode-ai/plugin/tool';
import { getDatabase, generateId } from '../db/index.js';
import { generateFrontmatter } from '../md/frontmatter.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sub-directory for report markdown files relative to content root. */
const REPORT_DIR = 'reports';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's date as YYYY-MM-DD string. */
function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolve the content root directory (`.novel-weaver/content`) from the
 * tool context.
 */
function contentRoot(ctx: ToolContext): string {
  return path.join(ctx.directory, '.novel-weaver', 'content');
}

/** Ensure a directory exists (recursive). Returns false if creation fails. */
function ensureDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    console.error(`[novel-weaver] Failed to create directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Calculate completion percentage (integer 0–100).
 */
function calcProgressPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Map internal arc status to a Chinese label.
 */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: '进行中',
    locked: '未解锁',
    completed: '已通关',
    failed: '已失败',
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Tool: novel_progress_track
// ---------------------------------------------------------------------------

export const novel_progress_track = tool({
  description:
    '查看或更新篇章攻略进度。支持三种操作：'
    + 'view — 查看指定篇章所有攻略步骤的完成状态；'
    + 'update — 更新某个步骤的完成状态（标记完成/未完成）；'
    + 'list — 列出所有篇章的总进度百分比。',
  args: {
    action: tool.schema
      .enum(['view', 'update', 'list'])
      .describe('操作类型：view（查看步骤）、update（更新步骤）、list（列出所有进度）'),
    arc_id: tool.schema
      .string()
      .optional()
      .describe('篇章 ID（view/update 时需要）'),
    step_name: tool.schema
      .string()
      .optional()
      .describe('步骤名称（update 时需要）'),
    completed: tool.schema
      .boolean()
      .optional()
      .describe('完成状态（update 时需要，true=已完成，false=未完成）'),
  },
  async execute(args, context) {
    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化。请先运行 novel_init 初始化。' };
    }

    const { action, arc_id, step_name, completed } = args;

    // ── action = update ─────────────────────────────────────────────
    if (action === 'update') {
      if (!arc_id || !step_name || completed === undefined) {
        return {
          output: '❌ update 操作需要 arc_id、step_name 和 completed 参数。',
        };
      }

      // Verify arc exists
      let dRow: { id: string; name: string };
      try {
        const dStmt = db.prepare('SELECT id, name FROM arcs WHERE id = ?');
        dStmt.bind([arc_id]);
        if (!dStmt.step()) {
          dStmt.free();
          return { output: `❌ 未找到 ID 为「${arc_id}」的篇章。` };
        }
        dRow = dStmt.getAsObject() as { id: string; name: string };
        dStmt.free();
      } catch (err) {
        return {
          output: `[novel_progress_track] 查询篇章失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Verify step exists
      let sRow: { id: string };
      try {
        const sStmt = db.prepare(
          'SELECT id FROM progress WHERE arc_id = ? AND step_name = ?',
        );
        sStmt.bind([arc_id, step_name]);
        if (!sStmt.step()) {
          sStmt.free();
          return {
            output: `❌ 篇章「${dRow.name}」中未找到步骤「${step_name}」。`
              + '请检查步骤名称是否正确。',
          };
        }
        sRow = sStmt.getAsObject() as { id: string };
        sStmt.free();
      } catch (err) {
        return {
          output: `[novel_progress_track] 查询步骤失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const completedInt = completed ? 1 : 0;
      const completedAt = completed ? today() : null;

      try {
        db.run(
          'UPDATE progress SET completed = ?, completed_at = ? WHERE id = ?',
          [completedInt, completedAt, sRow.id],
        );
      } catch (err) {
        return {
          output: `[novel_progress_track] 更新进度失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const statusText = completed ? '✅ 已完成' : '⏳ 未完成';
      return {
        output: `✅ 已更新篇章「${dRow.name}」步骤「${step_name}」状态为：${statusText}`,
        metadata: {
          arc_id,
          arc_name: dRow.name,
          step_name,
          completed,
        },
      };
    }

    // ── action = view ───────────────────────────────────────────────
    if (action === 'view') {
      if (!arc_id) {
        return { output: '❌ view 操作需要 arc_id 参数。' };
      }

      // Verify arc exists
      let dRow: { id: string; name: string; status: string };
      try {
        const dStmt = db.prepare('SELECT id, name, status FROM arcs WHERE id = ?');
        dStmt.bind([arc_id]);
        if (!dStmt.step()) {
          dStmt.free();
          return { output: `❌ 未找到 ID 为「${arc_id}」的篇章。` };
        }
        dRow = dStmt.getAsObject() as {
          id: string;
          name: string;
          status: string;
        };
        dStmt.free();
      } catch (err) {
        return {
          output: `[novel_progress_track] 查询篇章失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Query all steps for this arc (ordered by insertion)
      const steps: {
        step_name: string;
        completed: boolean;
        completed_at: string | null;
      }[] = [];

      try {
        const pStmt = db.prepare(
          'SELECT step_name, completed, completed_at FROM progress WHERE arc_id = ? ORDER BY rowid',
        );
        pStmt.bind([arc_id]);

        while (pStmt.step()) {
          const row = pStmt.getAsObject() as {
            step_name: string;
            completed: number;
            completed_at: string | null;
          };
          steps.push({
            step_name: row.step_name,
            completed: row.completed === 1,
            completed_at: row.completed_at ?? null,
          });
        }
        pStmt.free();
      } catch (err) {
        return {
          output: `[novel_progress_track] 查询步骤失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (steps.length === 0) {
        return {
          output: [
            `📋 **篇章「${dRow.name}」攻略进度**`,
            '',
            '暂无攻略步骤。请先使用 novel_arc_generate 生成篇章及其步骤。',
          ].join('\n'),
          metadata: {
            arc_id,
            arc_name: dRow.name,
            status: dRow.status,
            total_steps: 0,
            completed_steps: 0,
            progress_percent: 0,
          },
        };
      }

      const completedSteps = steps.filter((s) => s.completed).length;
      const totalSteps = steps.length;
      const percent = calcProgressPercent(completedSteps, totalSteps);

      // ── Character state summary ────────────────────────────────────────
      let charStateLines: string[] = [];
      try {
        const csStmt = db.prepare(`
          SELECT cs.status_tags, cs.power_level, cs.location, cs.chapter_num,
                 c.name AS character_name
          FROM character_states cs
          JOIN characters c ON c.id = cs.character_id
          JOIN arcs a ON a.world_id = c.world_id
          WHERE a.id = ?
          ORDER BY cs.chapter_num DESC
        `);
        csStmt.bind([arc_id]);
        const stateMap = new Map<string, { tags: string[]; power: string; lastCh: number }>();
        while (csStmt.step()) {
          const row = csStmt.getAsObject() as {
            status_tags: string | null;
            power_level: string | null;
            location: string | null;
            chapter_num: number;
            character_name: string;
          };
          // Only record first (most recent) occurrence per character
          if (!stateMap.has(row.character_name)) {
            let tags: string[] = [];
            try { tags = JSON.parse(row.status_tags ?? '[]'); } catch { tags = []; }
            stateMap.set(row.character_name, {
              tags,
              power: row.power_level ?? '未知',
              lastCh: row.chapter_num,
            });
          }
        }
        csStmt.free();

        if (stateMap.size > 0) {
          charStateLines.push('', `👥 **角色状态快照（${stateMap.size} 个角色）**`);
          for (const [name, st] of stateMap) {
            const tagStr = st.tags.length > 0 ? ` [${st.tags.join(', ')}]` : '';
            charStateLines.push(`  - [[${name}]]${tagStr} — ${st.power}（最近：第${st.lastCh}章）`);
          }
        }
      } catch (err) {
        // character_states table may not exist yet — silently ignore
        console.error(`[novel-weaver] character state query failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      const stepLines = steps.map((s) => {
        if (s.completed) {
          const atText = s.completed_at
            ? `（${s.completed_at} 完成）`
            : '（完成）';
          return `- [x] ${s.step_name} ${atText}`;
        }
        return `- [ ] ${s.step_name}`;
      });

      const output = [
        `📋 **篇章「${dRow.name}」攻略进度**`,
        '',
        `总进度：${percent}%（${completedSteps}/${totalSteps}）`,
        `篇章状态：${statusLabel(dRow.status)}`,
        ...charStateLines,
        '',
        ...stepLines,
      ].join('\n');

      return {
        output,
        metadata: {
          arc_id,
          arc_name: dRow.name,
          status: dRow.status,
          total_steps: totalSteps,
          completed_steps: completedSteps,
          progress_percent: percent,
        },
      };
    }

    // ── action = list ───────────────────────────────────────────────
    if (action === 'list') {
      let rows: unknown[][];
      try {
        const results = db.exec(`
          SELECT
            a.id,
            a.name,
            a.status,
            COALESCE(p_stats.total_steps, 0)     AS total_steps,
            COALESCE(p_stats.completed_steps, 0)  AS completed_steps
          FROM arcs a
          LEFT JOIN (
            SELECT
              arc_id,
              COUNT(*)                                                AS total_steps,
              SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END)          AS completed_steps
            FROM progress
            GROUP BY arc_id
          ) p_stats ON p_stats.arc_id = a.id
          ORDER BY a.name
        `);

        rows = results[0]?.values ?? [];
      } catch (err) {
        return {
          output: `[novel_progress_track] 查询列表失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (rows.length === 0) {
        return {
          output: '📋 **攻略进度总览**\n\n暂无篇章数据。请先使用 novel_arc_generate 创建篇章。',
          metadata: { arcs: [], total_arcs: 0 },
        };
      }

      const lines: string[] = ['📋 **攻略进度总览**', ''];
      const arcList: {
        id: string;
        name: string;
        status: string;
        total_steps: number;
        completed_steps: number;
        progress_percent: number;
      }[] = [];

      for (const row of rows) {
        const id = row[0] as string;
        const name = row[1] as string;
        const status = row[2] as string;
        const totalSteps = row[3] as number;
        const completedSteps = row[4] as number;
        const percent = calcProgressPercent(
          completedSteps as number,
          totalSteps as number,
        );

        arcList.push({
          id,
          name,
          status,
          total_steps: totalSteps as number,
          completed_steps: completedSteps as number,
          progress_percent: percent,
        });

        if ((totalSteps as number) === 0) {
          lines.push(
            `- **${name}** — 0%（暂无步骤） — 状态：${statusLabel(status)}`,
          );
        } else {
          lines.push(
            `- **${name}** — ${percent}%（${completedSteps}/${totalSteps}）`
            + ` — 状态：${statusLabel(status)}`,
          );
        }
      }

      return {
        output: lines.join('\n'),
        metadata: {
          arcs: arcList,
          total_arcs: arcList.length,
        },
      };
    }

    // Fallback (should never reach here due to enum validation)
    return { output: '❌ 未知操作类型。' };
  },
});

// ---------------------------------------------------------------------------
// Tool: novel_progress_summary
// ---------------------------------------------------------------------------

export const novel_progress_summary = tool({
  description:
    '生成所有篇章的攻略进度总览报告，保存为 Obsidian 兼容的 Markdown 文件'
    + '（.novel-weaver/content/reports/progress-summary-{日期}.md）。'
    + '报告中包含每个篇章的名称、状态、进度百分比和步骤清单。',
  args: {},
  async execute(_args, context) {
    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化。请先运行 novel_init 初始化。' };
    }

    // ── 1. Query all arcs ───────────────────────────────────────
    let arcRows: unknown[][];
    try {
      const arcResults = db.exec(
        'SELECT id, name, status FROM arcs ORDER BY name',
      );
      arcRows = arcResults[0]?.values ?? [];
    } catch (err) {
      return {
        output: `[novel_progress_summary] 查询篇章列表失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (arcRows.length === 0) {
      return {
        output: '⚠️ 暂无篇章数据，无法生成进度报告。请先使用 novel_arc_generate 创建篇章。',
        metadata: { total_arcs: 0, file_path: null },
      };
    }

    // ── 2. Build report sections ────────────────────────────────────
    const sections: string[] = [];
    let totalCompletedSteps = 0;
    let totalSteps = 0;

    for (const aRow of arcRows) {
      const id = aRow[0] as string;
      const name = aRow[1] as string;
      const status = aRow[2] as string;

      // Query steps for this arc
      const steps: { step_name: string; completed: boolean }[] = [];
      try {
        const pStmt = db.prepare(
          'SELECT step_name, completed FROM progress WHERE arc_id = ? ORDER BY rowid',
        );
        pStmt.bind([id]);

        while (pStmt.step()) {
          const row = pStmt.getAsObject() as {
            step_name: string;
            completed: number;
          };
          steps.push({
            step_name: row.step_name,
            completed: row.completed === 1,
          });
        }
        pStmt.free();
      } catch (err) {
        console.error(`[novel-weaver] Failed to query progress for arc ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }

      const completedCount = steps.filter((s) => s.completed).length;
      const totalCount = steps.length;
      const percent = calcProgressPercent(completedCount, totalCount);

      totalCompletedSteps += completedCount;
      totalSteps += totalCount;

      const stepLines: string[] = [];
      if (totalCount === 0) {
        stepLines.push('- 尚未开始');
      } else {
        for (const s of steps) {
          if (s.completed) {
            stepLines.push(`- [x] ${s.step_name}（完成）`);
          } else {
            stepLines.push(`- [ ] ${s.step_name}`);
          }
        }
      }

      sections.push(
        `## ${name} [${percent}%]`,
        '',
        ...stepLines,
        `- 状态: ${statusLabel(status)}`,
        '',
      );
    }

    // ── 3. Build full report content ────────────────────────────────
    const dateStr = today();
    const overallPercent =
      totalSteps > 0
        ? calcProgressPercent(totalCompletedSteps, totalSteps)
        : 0;

    const frontmatter = generateFrontmatter({
      title: '攻略进度总览',
      type: 'progress-report',
      generated: dateStr,
      total_arcs: arcRows.length,
      overall_progress: `${overallPercent}%`,
    });

    const body = [
      '# 攻略进度总览',
      '',
      ...sections,
      '---',
      '',
      `**汇总**：${arcRows.length} 个篇章，总进度 ${totalCompletedSteps}/${totalSteps}（${overallPercent}%）`,
      '',
    ].join('\n');

    const reportContent = frontmatter + body;

    // ── 4. Write to file ────────────────────────────────────────────
    const reportsDir = path.join(contentRoot(context), REPORT_DIR);
    if (!ensureDir(reportsDir)) {
      return {
        output: `⚠️ 无法创建报告目录：${reportsDir}`,
        metadata: { total_arcs: arcRows.length, file_path: null },
      };
    }

    const filename = `progress-summary-${dateStr}.md`;
    const filePath = path.join(reportsDir, filename);
    try {
      fs.writeFileSync(filePath, reportContent, 'utf-8');
    } catch (err) {
      return {
        output: `⚠️ 写入报告文件失败: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { total_arcs: arcRows.length, file_path: null },
      };
    }

    // ── 5. Build output ─────────────────────────────────────────────
    const output = [
      `✅ **攻略进度总览报告已生成！**`,
      '',
      `📄 ${filename}`,
      `📁 ${filePath}`,
      '',
      `共 ${arcRows.length} 个篇章，总进度 ${totalCompletedSteps}/${totalSteps}（${overallPercent}%）`,
      '',
      '💡 打开 Obsidian 即可查看此报告。',
    ].join('\n');

    return {
      output,
      metadata: {
        file_path: filePath,
        filename,
        total_arcs: arcRows.length,
        total_steps: totalSteps,
        completed_steps: totalCompletedSteps,
        overall_progress_percent: overallPercent,
      },
    };
  },
});
