/**
 * novel-weaver Cross-Chapter Fact Conflict Detection Tool
 *
 * Provides the `novel_crosscheck` tool for detecting 7 types of continuity
 * conflicts across chapters: temporal, location, power level, relationship,
 * item, fact contradiction, and unresolved hooks.
 *
 * Pure SQL + logic — no LLM calls. All DB operations are synchronous (sql.js).
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDatabase, generateId } from '../../db/index.js';
import { generateFrontmatter } from '../../md/frontmatter.js';
import { generateWikilink } from '../../md/wikilink.js';
import {
  runAllChecks,
  getCheckName,
  type CrosscheckConflict,
  type ConflictSeverity,
} from './fact-checker.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subdirectory under the project root for generated report .md files. */
const REPORTS_DIR = '.novel-weaver/content/reports';

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

/** Ensure a directory exists (recursive). */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Build a human-readable severity label for the report. */
function severityLabel(severity: ConflictSeverity): string {
  switch (severity) {
    case 'BLOCKER':
      return '🚫 阻塞';
    case 'WARNING':
      return '⚠️ 警告';
    case 'INFO':
      return 'ℹ️ 提示';
  }
}

/** Severity icons for output. */
function severityIcon(severity: ConflictSeverity): string {
  switch (severity) {
    case 'BLOCKER':
      return '🚫';
    case 'WARNING':
      return '⚠️';
    case 'INFO':
      return 'ℹ️';
  }
}

/** Map check type to an emoji icon. */
function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    temporal: '⏱',
    location: '📍',
    power_level: '⚡',
    relationship: '🤝',
    item: '🎒',
    fact_contradiction: '❌',
    unresolved_hook: '🪝',
  };
  return icons[type] ?? '•';
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Build the full Obsidian-compatible Markdown report content.
 */
function buildReportContent(
  conflicts: CrosscheckConflict[],
  scope: string,
  arcName?: string,
): string {
  const blockerCount = conflicts.filter((c) => c.severity === 'BLOCKER').length;
  const warningCount = conflicts.filter((c) => c.severity === 'WARNING').length;
  const infoCount = conflicts.filter((c) => c.severity === 'INFO').length;

  const meta = generateFrontmatter({
    title: '跨章节事实冲突检查报告',
    type: 'crosscheck-report',
    generated: today(),
    total_conflicts: conflicts.length,
    blocker_count: blockerCount,
    warning_count: warningCount,
    info_count: infoCount,
    scope,
    arc: arcName ?? 'all',
  });

  const parts: string[] = [meta, '', '# 跨章节事实冲突检查报告', ''];

  if (conflicts.length === 0) {
    parts.push(
      '✅ **未发现跨章节事实冲突，章节连续性良好！**',
      '',
      '> 注意：此检查基于 chapter_facts 和 character_states 表中的结构数据，',
      '> 可能无法覆盖所有叙事层面的不一致。',
      '',
    );
    return parts.join('\n');
  }

  // Scope info
  if (scope === 'arc' && arcName) {
    parts.push(`> 检查范围：篇章 ${generateWikilink(arcName)}`);
    parts.push('');
  } else {
    parts.push('> 检查范围：全部篇章');
    parts.push('');
  }

  // Summary table
  parts.push('## 概览', '');
  parts.push('| 级别 | 数量 |');
  parts.push('|------|------|');
  parts.push(`| 🚫 BLOCKER | ${blockerCount} |`);
  parts.push(`| ⚠️ WARNING | ${warningCount} |`);
  parts.push(`| ℹ️ INFO | ${infoCount} |`);
  parts.push('');

  // Per-severity sections
  const severities: ConflictSeverity[] = ['BLOCKER', 'WARNING', 'INFO'];

  for (const sev of severities) {
    const group = conflicts.filter((c) => c.severity === sev);
    if (group.length === 0) continue;

    parts.push(`## ${severityLabel(sev)} 级别（${group.length} 项）`, '');
    for (let idx = 0; idx < group.length; idx++) {
      const c = group[idx];
      const icon = typeIcon(c.type);
      const typeName = getCheckName(c.type);

      parts.push(`### ${idx + 1}. ${icon} ${typeName}`, '');
      parts.push('- [ ] ' + c.description, '');

      // Chapter references
      if (c.chapterRefs.length > 0) {
        const chRefs = c.chapterRefs
          .map((r) => `第 ${r.chapterNum} 章${r.title ? `（${r.title}）` : ''}`)
          .join('、');
        parts.push(`  涉及章节：${chRefs}`);
        parts.push('');
      }

      // Proof / evidence
      parts.push('  ```');
      parts.push(`  ${c.proof}`);
      parts.push('  ```');
      parts.push('');

      // Entity references
      if (c.entityRefs.length > 0) {
        parts.push(
          `  相关实体：${c.entityRefs.map((e) => generateWikilink(e)).join('、')}`,
          '',
        );
      }
    }
  }

  parts.push('---', '');
  parts.push(
    `> 报告生成时间：${today()} | 检查维度：7 项 | 引擎：novel-weaver crosscheck`,
    '',
  );

  return parts.join('\n');
}

/**
 * Write the crosscheck report to disk.
 * Returns the relative file path of the generated report.
 */
function writeReport(
  conflicts: CrosscheckConflict[],
  projectDir: string,
  scope: string,
  arcName?: string,
): string | null {
  try {
    const reportsDir = path.resolve(projectDir, REPORTS_DIR);
    ensureDir(reportsDir);

    const filename = `crosscheck-${today()}.md`;
    const filePath = path.join(reportsDir, filename);

    const content = buildReportContent(conflicts, scope, arcName);
    fs.writeFileSync(filePath, content, 'utf-8');

    return path.join(REPORTS_DIR, filename);
  } catch (err) {
    console.error(
      `[novel-weaver] Failed to write crosscheck report: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool: novel_crosscheck
// ---------------------------------------------------------------------------

export const novel_crosscheck = tool({
  description:
    '跨章节事实冲突检测工具。自动扫描 chapter_facts 和 character_states 表，'
    + '从 7 个维度（时间线冲突、位置冲突、战力冲突、关系冲突、物品冲突、'
    + '事实矛盾、未回收伏笔）检测章节间的连续性冲突，'
    + '按 BLOCKER / WARNING / INFO 排序输出结果，'
    + '并生成 Obsidian 兼容的 Markdown 报告文件（.novel-weaver/content/reports/crosscheck-{date}.md）。',
  args: {
    scope: tool.schema
      .enum(['all', 'arc'])
      .optional()
      .describe('检查范围：all = 所有篇章（默认），arc = 指定篇章'),
    arc_id: tool.schema
      .string()
      .optional()
      .describe('篇章 ID（scope=arc 时必填）'),
    threshold: tool.schema
      .number()
      .optional()
      .describe('伏笔未回收阈值（默认 10 章，即超过 10 章未回收的 hook 会被标记）'),
  },
  async execute(args, context) {
    const db = getDatabase();
    if (!db) {
      return {
        output: '错误：数据库未初始化。请确保插件已正确加载。',
      };
    }

    const scope = args.scope ?? 'all';
    const arcId = args.arc_id;
    const threshold = args.threshold ?? 10;

    // Validate: scope=arc requires arc_id
    if (scope === 'arc' && !arcId) {
      return {
        output: '❌ scope=arc 时必须提供 arc_id 参数。',
      };
    }

    // Verify arc exists if arc_id provided
    if (arcId) {
      const check = db.prepare('SELECT id FROM arcs WHERE id = ?');
      check.bind([arcId]);
      if (!check.step()) {
        check.free();
        return {
          output: `❌ 未找到 ID 为「${arcId}」的篇章。`,
        };
      }
      check.free();
    }

    // ── Run checks ──────────────────────────────────────────────────────
    let result: ReturnType<typeof runAllChecks>;
    try {
      result = runAllChecks(arcId, scope, threshold);
    } catch (err) {
      return {
        output: `❌ 事实冲突检查执行错误：${(err as Error).message}`,
      };
    }

    const { conflicts, summary } = result;

    // ── Write report ────────────────────────────────────────────────────
    let reportPath: string | null = null;
    try {
      reportPath = writeReport(
        conflicts,
        context.directory,
        scope,
        summary.arcName,
      );
    } catch (err) {
      console.error('[novel-weaver] Failed to write crosscheck report:', err);
    }

    // ── Build output ────────────────────────────────────────────────────
    const total = summary.total;
    const { BLOCKER: blockerCount, WARNING: warningCount, INFO: infoCount } = summary.bySeverity;

    const lines: string[] = [];

    if (total === 0) {
      lines.push('✅ **未发现跨章节事实冲突，章节连续性良好！**');
      lines.push('');
    } else {
      lines.push(`🔍 **事实冲突检查完成，发现 ${total} 个问题**`);
      lines.push('');
    }

    // Scope line
    if (scope === 'arc' && summary.arcName) {
      lines.push(`📁 检查范围：${generateWikilink(summary.arcName)}（${arcId}）`);
    } else {
      lines.push('📁 检查范围：全部篇章');
    }
    lines.push(`📏 伏笔未回收阈值：${threshold} 章`);
    lines.push('');

    // Summary table
    lines.push('| 级别 | 数量 |');
    lines.push('|------|------|');
    lines.push(`| 🚫 BLOCKER | ${blockerCount} |`);
    lines.push(`| ⚠️ WARNING | ${warningCount} |`);
    lines.push(`| ℹ️ INFO | ${infoCount} |`);
    lines.push('');

    if (reportPath) {
      lines.push(`📄 报告已保存：\`${reportPath}\``);
      lines.push('');
    }

    // Breakdown by type
    if (total > 0) {
      lines.push('### 各维度统计', '');
      lines.push('| 维度 | 数量 |');
      lines.push('|------|------|');
      for (const [typeKey, count] of Object.entries(summary.byType)) {
        const typeLabel = getCheckName(typeKey);
        lines.push(`| ${typeIcon(typeKey)} ${typeLabel} | ${count} |`);
      }
      lines.push('');
    }

    // List all conflicts
    if (total > 0) {
      lines.push('---', '');
      for (const c of conflicts) {
        const icon = severityIcon(c.severity);
        const typeName = getCheckName(c.type);
        lines.push(`### ${icon} [${c.severity}] ${typeName}`);
        lines.push('');
        lines.push(c.description);
        lines.push('');

        // Chapter refs
        if (c.chapterRefs.length > 0) {
          const chInfo = c.chapterRefs
            .map((r) => `第 ${r.chapterNum} 章`)
            .join(' → ');
          lines.push(`📖 ${chInfo}`);
          lines.push('');
        }
      }
    }

    return {
      output: lines.join('\n'),
      metadata: {
        total_conflicts: total,
        blocker_count: blockerCount,
        warning_count: warningCount,
        info_count: infoCount,
        report_file: reportPath,
        scope,
        arc_id: arcId ?? null,
        threshold,
        dimensions_checked: [
          'temporal',
          'location',
          'power_level',
          'relationship',
          'item',
          'fact_contradiction',
          'unresolved_hook',
        ],
        by_type: summary.byType,
      },
    };
  },
});
