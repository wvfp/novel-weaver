/**
 * 题材工具函数
 *
 * 提供题材解析、模板加载、写作提示生成等功能。
 * 参考 webnovel-writer 的 genre_profile_builder.py 模式。
 */

import { resolveGenre, getGenreDisplayName } from './constants.js';
import type { GenreProfile, GenreTemplate } from '../../types.js';
import { getRegistry } from '../../genre-packs/index.js';
import type { GenrePack } from '../../genre-packs/types.js';

// ============================================================
// 题材解析
// ============================================================

/**
 * 解析题材组合字符串。
 * 支持分隔符: +、/、、
 *
 * @param raw - 原始题材字符串，如 "都市异能+系统流"
 * @returns 解析后的题材标记数组
 */
export function parseGenreTokens(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];

  // 使用常见分隔符分割
  const tokens = raw.split(/[+／\/、,，]/).map((t) => t.trim()).filter(Boolean);
  return [...new Set(tokens)]; // 去重
}

/**
 * 根据题材标记判断主导风格基调。
 */
function inferDominantTone(tokens: string[]): string {
  const toneMap: Record<string, string> = {
    '仙侠': '诗意',
    '修仙': '诗意',
    '修真': '诗意',
    '科幻': '冷峻',
    '赛博': '冷峻',
    '星际': '冷峻',
    '都市': '真实',
    '现代': '真实',
    '校园': '真实',
    '恐怖': '压抑',
    '灵异': '压抑',
    '惊悚': '压抑',
    '末世': '粗粝',
    '末日': '粗粝',
    '废土': '粗粝',
    '玄幻': '诗意',
    '奇幻': '诗意',
  };

  for (const token of tokens) {
    for (const [key, tone] of Object.entries(toneMap)) {
      if (token.includes(key)) return tone;
    }
  }

  return '中性';
}

/**
 * 根据题材标记推断节奏。
 */
function inferPacing(tokens: string[]): string {
  const fastPace = ['战斗', '冒险', '悬疑', '惊悚', '无限流', '快穿'];
  const slowPace = ['日常', '种田', '经营', '慢生活', '治愈'];

  let fastScore = 0;
  let slowScore = 0;

  for (const token of tokens) {
    if (fastPace.some((p) => token.includes(p))) fastScore++;
    if (slowPace.some((p) => token.includes(p))) slowScore++;
  }

  if (fastScore > slowScore) return '紧凑';
  if (slowScore > fastScore) return '舒缓';
  return '张弛';
}

/**
 * 根据题材标记推断写作焦点领域。
 */
function inferFocusAreas(tokens: string[]): string[] {
  const areaMap: Record<string, string[]> = {
    '战斗': ['战斗描写', '技能系统'],
    '言情': ['人物关系', '情感发展'],
    '悬疑': ['情节铺垫', '推理逻辑'],
    '推理': ['情节铺垫', '推理逻辑'],
    '搞笑': ['对话节奏', '幽默桥段'],
    '日常': ['生活细节', '群像互动'],
    '种田': ['资源管理', '发展历程'],
    '经营': ['资源管理', '系统描述'],
    '冒险': ['场景描写', '探索驱动'],
    '策略': ['智力对决', '博弈过程'],
  };

  const areas = new Set<string>();
  for (const token of tokens) {
    for (const [key, relatedAreas] of Object.entries(areaMap)) {
      if (token.includes(key)) {
        relatedAreas.forEach((a) => areas.add(a));
      }
    }
  }

  return areas.size > 0 ? [...areas] : ['叙事驱动', '角色塑造'];
}

/**
 * 构建题材画像。
 *
 * @param genre - 题材名称
 * @returns 题材画像对象
 */
export function buildGenreProfile(genre: string): GenreProfile {
  const tokens = parseGenreTokens(genre);
  const canonical = resolveGenre(genre);

  return {
    genre: canonical,
    tokens,
    dominantTone: inferDominantTone(tokens),
    pacing: inferPacing(tokens),
    focusAreas: inferFocusAreas(tokens),
  };
}

// ============================================================
// 字数目标
// ============================================================

/**
 * 标准题材字数范围配置。
 */
const WORD_COUNT_RANGES: Record<string, { min: number; max: number }> = {
  xianxia: { min: 3000, max: 5000 },
  'sci-fi': { min: 2500, max: 4000 },
  urban: { min: 2000, max: 3500 },
  horror: { min: 2000, max: 3000 },
  apocalypse: { min: 2500, max: 4000 },
};

/**
 * 获取指定题材的目标字数范围。
 *
 * @param genre - 题材名称
 * @returns 字数范围 { min, max }
 */
export function getTargetWordCount(genre: string): { min: number; max: number } {
  const canonical = resolveGenre(genre);
  return WORD_COUNT_RANGES[canonical] ?? { min: 2000, max: 3000 };
}

// ============================================================
// 题材模板加载
// ============================================================

/** 已加载的题材模板缓存 */
const templateCache = new Map<string, GenreTemplate | null>();

/**
 * Convert a GenrePack to a GenreTemplate for unified consumption.
 */
function packToTemplate(pack: GenrePack): GenreTemplate {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    targetWordCount: getTargetWordCount(pack.id),
    styleGuidelines: [
      pack.writingRules.paragraphStyle,
      pack.writingRules.dialogueStyle,
    ],
    styleRules: pack.writingRules.recommendedPatterns,
    forbiddenPatterns: pack.writingRules.forbiddenPatterns,
    recommendedPatterns: pack.writingRules.recommendedPatterns,
    specialRules: [
      `力量体系: ${pack.powerSystem.name} (${pack.powerSystem.levels.join(' → ')})`,
      `核心资源: ${pack.powerSystem.coreResource}`,
      `突破方式: ${pack.powerSystem.breakthroughMethod}`,
    ],
  };
}

/**
 * 加载指定题材的写作模板。
 * 优先从 GenrePackRegistry 解析，回退到 genre-templates/ 目录的 JSON 模板文件。
 *
 * @param genre - 题材名称
 * @returns 题材模板对象，未找到时返回 null
 */
export function loadGenreTemplate(genre: string): GenreTemplate | null {
  const canonical = resolveGenre(genre);

  // 1. Try GenrePackRegistry first
  try {
    const registry = getRegistry();
    const pack = registry.resolve(canonical);
    if (pack) {
      const template = packToTemplate(pack);
      templateCache.set(canonical, template);
      return template;
    }
  } catch {
    // GenrePackRegistry resolve failed — fall through to JSON templates
  }

  // 2. Check cache
  if (templateCache.has(canonical)) {
    return templateCache.get(canonical) ?? null;
  }

  // 3. Fall back to existing genre template JSON files
  try {
    const template = require(`./genre-templates/${canonical}.json`) as GenreTemplate;

    if (!template.id || !template.name || !template.styleGuidelines) {
      console.warn(`[novel-weaver] 题材模板 "${canonical}" 缺少必要字段`);
      templateCache.set(canonical, null);
      return null;
    }

    templateCache.set(canonical, template);
    return template;
  } catch {
    templateCache.set(canonical, null);
    return null;
  }
}

/**
 * 清除题材模板缓存。
 * 在模板文件更新后调用。
 */
export function clearGenreTemplateCache(): void {
  templateCache.clear();
}
