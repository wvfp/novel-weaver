/**
 * novel-weaver Genre Pack Tools
 *
 * Two tools for managing genre packs:
 *  - novel_genre_list   — list all available genre packs
 *  - novel_genre_config — view or switch the current project's genre pack
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import { getDatabase, generateId } from '../db/index.js';
import { queryOne, persistDb } from '../db/helpers.js';
import { getRegistry } from '../genre-packs/index.js';
import type { GenrePack } from '../genre-packs/types.js';

// ---------------------------------------------------------------------------
// novel_genre_list
// ---------------------------------------------------------------------------

export const novel_genre_list = tool({
  description:
    '列出所有可用的小说题材包（Genre Pack），包含题材名称、子类型和默认篇章类型',
  args: {},

  async execute(_args, _context) {
    const registry = getRegistry();
    const packs = registry.listAll();

    if (packs.length === 0) {
      return { output: '未找到任何题材包。请确认 genre-packs 目录下存在有效的 pack.json 文件。' };
    }

    const lines: string[] = [
      `共 ${packs.length} 个可用题材包：`,
      '',
    ];

    for (const summary of packs) {
      const pack = registry.get(summary.id);
      const arcTypeLabel = arcTypeToLabel(summary.supportedArcTypes[0] ?? 'dungeon');
      const supportedLabels = summary.supportedArcTypes.map(arcTypeToLabel).join('、');
      const powerName = pack?.powerSystem.name ?? '—';

      lines.push(`【${summary.name}】(${summary.id})`);
      lines.push(`  子类型: ${summary.subGenres.join('、') || '无'}`);
      lines.push(`  默认篇章: ${arcTypeLabel}`);
      lines.push(`  支持篇章: ${supportedLabels}`);
      lines.push(`  力量体系: ${powerName}`);
      lines.push('');
    }

    return { output: lines.join('\n') };
  },
});

// ---------------------------------------------------------------------------
// novel_genre_config
// ---------------------------------------------------------------------------

export const novel_genre_config = tool({
  description:
    '查看或切换当前小说项目的题材包配置。不传参数查看当前配置，传入 genre_pack_id 切换题材',
  args: {
    genre_pack_id: tool.schema
      .string()
      .optional()
      .describe('要切换的题材包 ID（如 infinite-flow、xianxia、urban、_default）'),
  },

  async execute(args, context) {
    const db = getDatabase();
    if (!db) {
      return { output: '错误：数据库未初始化。请先初始化小说项目，使用 novel_init 工具。' };
    }

    // ── View current config ──────────────────────────────────────────────
    if (!args.genre_pack_id) {
      return viewCurrentConfig(db);
    }

    // ── Switch genre pack ────────────────────────────────────────────────
    return switchGenrePack(db, args.genre_pack_id, context.directory);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function viewCurrentConfig(db: NonNullable<ReturnType<typeof getDatabase>>): { output: string } {
  const project = queryOne('SELECT id, name, genre_pack_id FROM projects LIMIT 1');
  if (!project) {
    return { output: '未找到项目记录。请先使用 novel_init 初始化项目。' };
  }

  const projectId = String(project.id);
  const projectName = String(project.name);
  const currentPackId = project.genre_pack_id ? String(project.genre_pack_id) : null;

  if (!currentPackId) {
    return {
      output: [
        `项目「${projectName}」尚未配置题材包。`,
        '',
        '使用 novel_genre_config 传入 genre_pack_id 来切换题材。',
        '使用 novel_genre_list 查看所有可用题材包。',
      ].join('\n'),
    };
  }

  const registry = getRegistry();
  const pack = registry.get(currentPackId);

  if (!pack) {
    return {
      output: [
        `项目「${projectName}」当前题材包: ${currentPackId}（未找到对应题材包定义）`,
        '',
        '该题材包可能已被移除。请使用 novel_genre_list 查看可用题材并重新配置。',
      ].join('\n'),
    };
  }

  // Check for custom overrides in genre_config table
  const configRow = queryOne(
    'SELECT custom_overrides FROM genre_config WHERE project_id = ?',
    [projectId],
  );
  const hasOverrides = configRow?.custom_overrides != null;

  return {
    output: [
      `项目「${projectName}」当前题材包:`,
      '',
      formatPackDetail(pack),
      '',
      hasOverrides ? '（存在自定义覆盖配置）' : '',
    ].join('\n'),
  };
}

function switchGenrePack(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  genrePackId: string,
  projectRoot: string,
): { output: string } {
  const registry = getRegistry();
  const pack = registry.get(genrePackId);

  if (!pack) {
    const available = registry.listAll().map(p => `  - ${p.id}（${p.name}）`).join('\n');
    return {
      output: [
        `题材包「${genrePackId}」不存在。`,
        '',
        '可用题材包：',
        available || '  （无）',
      ].join('\n'),
    };
  }

  const project = queryOne('SELECT id, name FROM projects LIMIT 1');
  if (!project) {
    return { output: '未找到项目记录。请先使用 novel_init 初始化项目。' };
  }

  const projectId = String(project.id);
  const projectName = String(project.name);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Update projects table
  db.run(
    'UPDATE projects SET genre_pack_id = ?, updated_at = ? WHERE id = ?',
    [genrePackId, now, projectId],
  );

  // Upsert genre_config table
  const existing = queryOne(
    'SELECT id FROM genre_config WHERE project_id = ? AND genre_pack_id = ?',
    [projectId, genrePackId],
  );

  if (existing) {
    db.run(
      'UPDATE genre_config SET updated_at = ? WHERE id = ?',
      [now, String(existing.id)],
    );
  } else {
    db.run(
      'INSERT INTO genre_config (id, project_id, genre_pack_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [generateId(), projectId, genrePackId, now, now],
    );
  }

  persistDb(projectRoot);

  return {
    output: [
      `已将项目「${projectName}」的题材包切换为「${pack.name}」(${pack.id})`,
      '',
      formatPackDetail(pack),
    ].join('\n'),
  };
}

function formatPackDetail(pack: GenrePack): string {
  const supportedLabels = pack.supportedArcTypes.map(arcTypeToLabel).join('、');

  return [
    `名称: ${pack.name}`,
    `ID: ${pack.id}`,
    `版本: ${pack.version}`,
    `描述: ${pack.description}`,
    `子类型: ${pack.subGenres.join('、') || '无'}`,
    `默认篇章类型: ${arcTypeToLabel(pack.defaultArcType)}`,
    `支持篇章类型: ${supportedLabels}`,
    `力量体系: ${pack.powerSystem.name}`,
    `  等级: ${pack.powerSystem.levels.join(' → ')}`,
    `  核心资源: ${pack.powerSystem.coreResource}`,
    `  突破方式: ${pack.powerSystem.breakthroughMethod}`,
    `写作规则:`,
    `  禁用词: ${pack.writingRules.forbiddenWords.length} 个`,
    `  推荐手法: ${pack.writingRules.recommendedPatterns.join('、')}`,
    `  禁用手法: ${pack.writingRules.forbiddenPatterns.join('、')}`,
    `  段落风格: ${pack.writingRules.paragraphStyle}`,
    `  对话风格: ${pack.writingRules.dialogueStyle}`,
  ].join('\n');
}

const ARC_TYPE_LABELS: Record<string, string> = {
  dungeon: '副本',
  trial: '试炼',
  quest: '任务',
  storyline: '剧情线',
  campaign: '战役',
};

function arcTypeToLabel(type: string): string {
  return ARC_TYPE_LABELS[type] ?? type;
}
