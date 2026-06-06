/**
 * 题材画像构建器
 *
 * 从题材模板和数据库状态中构建完整的题材写作指导画像。
 * 供 PlotWriter 和上下文组装引擎使用。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDatabase } from '../../../db/index.js';
import { resolveGenre, getGenreDisplayName, getFallbackGenre } from '../constants.js';
import { loadGenreTemplate, getTargetWordCount } from '../genre-utils.js';
import type { GenreTemplate } from '../../../types.js';

// ============================================================
// 类型定义
// ============================================================

export interface GenreProfilePack {
  genre: string;
  profileExcerpt: string;
  referenceHints: string[];
  compositeHints: string[];
  writingGuidance: string[];
  checklist: string[];
  methodology: string;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从模板中提取写作指导。
 */
function extractWritingGuidance(template: GenreTemplate): string[] {
  const hints: string[] = [];

  // 字数目标
  const { min, max } = template.targetWordCount;
  hints.push(`目标字数: ${min}-${max}字`);

  // 风格规则前 3 条
  template.styleRules.slice(0, 3).forEach((r) => hints.push(`风格规则: ${r}`));

  // 推荐写法前 3 条
  template.recommendedPatterns.slice(0, 3).forEach((p) => hints.push(`推荐写法: ${p}`));

  return hints;
}

/**
 * 构建写作检查清单。
 */
function buildChecklist(template: GenreTemplate): string[] {
  const items: string[] = [];

  // 禁用的写法
  template.forbiddenPatterns.slice(0, 5).forEach((p) => items.push(`避免: ${p}`));

  // 推荐的写法
  template.recommendedPatterns.slice(0, 3).forEach((p) => items.push(`采用: ${p}`));

  // 特殊规则
  template.specialRules.slice(0, 3).forEach((r) => items.push(`注意: ${r}`));

  return items;
}

/**
 * 生成方法论策略卡。
 */
function buildMethodology(template: GenreTemplate): string {
  const styleGuide = template.styleGuidelines.slice(0, 3).join('；');
  return `【${template.name}写作方法论】\n${styleGuide}`;
}

/**
 * 从 DB 中查询题材相关的写作模式。
 */
function queryGenrePatterns(genre: string): string[] {
  const db = getDatabase();
  if (!db) return [];

  const patterns: string[] = [];

  try {
    // 查询该题材下各章节的战斗频率（用于仙侠题材）
    if (genre === 'xianxia') {
      const stmt = db.prepare(
        `SELECT COUNT(*) as c FROM chapter_facts WHERE fact_type IN ('combat_result', 'state_change')`
      );
      if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        if (row.c > 0) patterns.push(`本章节已记录 ${row.c} 次战斗/状态变化`);
      }
      stmt.free();
    }
  } catch {
    // DB 可能未初始化，忽略
  }

  // 从章节文件中读取风格参考
  try {
    const settingsDir = path.join(process.cwd(), '.novel-weaver', 'content', 'settings');
    if (fs.existsSync(settingsDir)) {
      const files = fs.readdirSync(settingsDir);
      const genreFiles = files.filter((f) => f.includes(resolveGenre(genre)));
      if (genreFiles.length > 0) {
        patterns.push(`设定文件参考: ${genreFiles.join(', ')}`);
      }
    }
  } catch {
    // 忽略
  }

  return patterns;
}

// ============================================================
// 主函数
// ============================================================

/**
 * 构建完整的题材写作画像。
 *
 * @param projectRoot - 项目根目录
 * @param chapter - 章节号
 * @param genre - 题材名称
 * @returns 题材画像包
 */
export function buildGenreProfile(
  projectRoot: string,
  chapter: number,
  genre: string,
): GenreProfilePack {
  const canonical = resolveGenre(genre);
  const template = loadGenreTemplate(canonical);

  // 默认值（模板不存在时）
  if (!template) {
    return {
      genre: canonical,
      profileExcerpt: `未找到「${getGenreDisplayName(canonical)}」题材模板，使用通用设定`,
      referenceHints: [],
      compositeHints: [],
      writingGuidance: ['目标字数: 2000-3000字'],
      checklist: ['避免过度使用 AI 表达', '保持章节节奏变化'],
      methodology: '通用写作方法论：根据剧情自然推进，注意节奏和对话比例',
    };
  }

  // 题材摘要
  const profileExcerpt = `【${template.name}】${template.description}`;

  // 参考提示
  const referenceHints = extractWritingGuidance(template);

  // 复合提示（多题材组合）
  const compositeHints = queryGenrePatterns(canonical);

  // 写作指导
  const writingGuidance = [
    `题材: ${template.name}`,
    `字数目标: ${template.targetWordCount.min}-${template.targetWordCount.max}字`,
    ...template.styleGuidelines.slice(0, 3).map((g) => `风格指导: ${g}`),
  ];

  // 检查清单
  const checklist = buildChecklist(template);

  // 方法论
  const methodology = buildMethodology(template);

  return {
    genre: canonical,
    profileExcerpt,
    referenceHints,
    compositeHints,
    writingGuidance,
    checklist,
    methodology,
  };
}
