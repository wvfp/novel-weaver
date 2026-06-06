/**
 * 题材元数据和别名解析
 *
 * 定义所有支持题材的元信息、别名映射和回退链。
 * 用于题材解析、模板加载和写作提示生成。
 */

// ============================================================
// 篇章类型常量
// ============================================================

/** 5 种篇章类型 */
export const ARC_TYPES = ['dungeon', 'trial', 'quest', 'storyline', 'campaign'] as const;

/** 篇章类型中文显示名 */
export const ARC_TYPE_DISPLAY_NAMES: Record<string, string> = {
  dungeon: '副本',
  trial: '试炼',
  quest: '任务',
  storyline: '剧情线',
  campaign: '战役',
};

// ============================================================
// 题材元数据
// ============================================================

/**
 * 题材元信息映射表。
 * key: 题材内部标识符（小写英文）
 * value: 显示名、别名列表、回退链
 */
export const GENRE_META: Record<string, {
  displayName: string;
  aliases: string[];
  fallbackChain: string[];
}> = {
  xianxia: {
    displayName: '仙侠',
    aliases: ['修仙', '修真', '玄幻', '仙侠', '修真文明', '东方玄幻'],
    fallbackChain: ['fantasy'],
  },
  'sci-fi': {
    displayName: '科幻',
    aliases: ['科幻', '未来', '赛博', '星际', 'SF', '科幻世界'],
    fallbackChain: ['fantasy'],
  },
  urban: {
    displayName: '都市',
    aliases: ['都市', '现代', '校园', '都市异能', '现实'],
    fallbackChain: ['fantasy'],
  },
  horror: {
    displayName: '恐怖',
    aliases: ['恐怖', '惊悚', '悬疑', '灵异', '克苏鲁'],
    fallbackChain: ['fantasy'],
  },
  apocalypse: {
    displayName: '末世',
    aliases: ['末世', '末日', '废土', '生存', '灾难'],
    fallbackChain: ['fantasy'],
  },
  'infinite-flow': {
    displayName: '无限流',
    aliases: ['无限流', '无限', '轮回', '主神空间', '副本流'],
    fallbackChain: ['fantasy'],
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将输入的题材名称解析为标准题材标识符。
 * 支持输入别名（如"修仙"→"xianxia"）。
 *
 * @param input - 输入的题材名称
 * @returns 标准题材标识符，未匹配时返回 "fantasy"
 */
export function resolveGenre(input: string): string {
  const normalized = input.toLowerCase().trim();

  // 直接匹配 key
  if (normalized in GENRE_META) {
    return normalized;
  }

  // 通过别名匹配
  for (const [key, meta] of Object.entries(GENRE_META)) {
    if (meta.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return key;
    }
  }

  // 别名部分匹配
  for (const [key, meta] of Object.entries(GENRE_META)) {
    if (meta.aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
      return key;
    }
  }

  return 'fantasy';
}

/**
 * 获取指定题材的中文显示名。
 *
 * @param genre - 题材标识符
 * @returns 中文显示名
 */
export function getGenreDisplayName(genre: string): string {
  return GENRE_META[genre]?.displayName ?? '通用';
}

/**
 * 获取题材的回退链。
 * 当当前题材的模板不存在时，沿回退链查找父题材模板。
 *
 * @param genre - 题材标识符
 * @returns 回退链数组
 */
export function getFallbackGenre(genre: string): string {
  const meta = GENRE_META[genre];
  if (!meta || meta.fallbackChain.length === 0) {
    return 'fantasy';
  }
  return meta.fallbackChain[0];
}

/**
 * 从 GenrePackRegistry 增强题材别名映射。
 * 将已注册题材包的 subGenres 合并到 GENRE_META 的 aliases 中。
 * 此函数是幂等的，多次调用不会重复添加别名。
 */
export function augmentGenreAliasesFromRegistry(): void {
  try {
    // Lazy import to avoid circular dependency at module load
    const { getRegistry } = require('../../genre-packs/index.js') as typeof import('../../genre-packs/index.js');
    const registry = getRegistry();
    const packs = registry.listAll();

    for (const pack of packs) {
      if (!GENRE_META[pack.id]) {
        GENRE_META[pack.id] = {
          displayName: pack.name,
          aliases: [...pack.subGenres],
          fallbackChain: ['fantasy'],
        };
      } else {
        const existing = new Set(GENRE_META[pack.id].aliases.map(a => a.toLowerCase()));
        for (const sg of pack.subGenres) {
          if (!existing.has(sg.toLowerCase())) {
            GENRE_META[pack.id].aliases.push(sg);
            existing.add(sg.toLowerCase());
          }
        }
      }
    }
  } catch {
    // GenrePackRegistry not available — keep existing aliases
  }
}
