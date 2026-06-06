/**
 * 上下文组装配置工具
 *
 * 提供上下文各分段的默认权重配置和基于章节进度的动态权重调整。
 * 用于 Wave 2 的上下文组装引擎。
 */

import { getDatabase } from '../../db/index.js';
import { queryOne } from '../../db/helpers.js';
import { getRegistry } from '../../genre-packs/index.js';
import type { GenrePack } from '../../genre-packs/types.js';

// ============================================================
// 截面权重配置
// ============================================================

/**
 * 上下文各分段的默认权重。
 * 权重越高，该分段在上下文中的重要性和保留优先级越高。
 */
export const DEFAULT_SECTION_WEIGHTS: Record<string, number> = {
  core: 1.0,       // 核心设定/世界观信息
  scene: 0.8,      // 当前场景上下文
  alerts: 0.6,     // 剧情提醒/伏笔提示
  characters: 0.7, // 角色状态摘要
  facts: 0.5,      // 章节事实
  hooks: 0.4,      // 活跃伏笔/预告
  style: 0.3,      // 风格锚点
};

// ============================================================
// 阶段动态权重
// ============================================================

/** 各阶段的权重乘数 */
export const STAGE_MULTIPLIERS: Record<string, Record<string, number>> = {
  early: {
    core: 0.8,
    scene: 0.9,
    alerts: 0.5,
    characters: 0.5,
    facts: 0.3,
    hooks: 0.3,
    style: 0.4,
  },
  middle: {
    core: 1.0,
    scene: 0.8,
    alerts: 0.8,
    characters: 0.7,
    facts: 0.6,
    hooks: 0.6,
    style: 0.3,
  },
  late: {
    core: 1.0,
    scene: 0.7,
    alerts: 0.7,
    characters: 0.6,
    facts: 0.5,
    hooks: 0.9,
    style: 0.3,
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 根据章节进度获取动态权重。
 *
 * @param chapterNum - 当前章节号
 * @param totalChapters - 总章节数（未知时传 0）
 * @returns 各分段的权重值
 */
export function getStageWeights(
  chapterNum: number,
  totalChapters: number = 0,
): Record<string, number> {
  if (totalChapters <= 0) {
    return { ...DEFAULT_SECTION_WEIGHTS };
  }

  const progress = chapterNum / totalChapters;

  let stage: string;
  if (progress <= 0.2) {
    stage = 'early';
  } else if (progress < 0.8) {
    stage = 'middle';
  } else {
    stage = 'late';
  }

  const multipliers = STAGE_MULTIPLIERS[stage] ?? STAGE_MULTIPLIERS.middle;
  const weights: Record<string, number> = {};

  for (const [key, base] of Object.entries(DEFAULT_SECTION_WEIGHTS)) {
    weights[key] = base * (multipliers[key] ?? 1.0);
  }

  return weights;
}

/**
 * 获取指定分段的权重值。
 *
 * @param section - 分段名称
 * @param chapterNum - 当前章节号
 * @param totalChapters - 总章节数
 */
export function getSectionWeight(
  section: string,
  chapterNum: number,
  totalChapters: number = 0,
): number {
  const weights = getStageWeights(chapterNum, totalChapters);
  return weights[section] ?? 0.3;
}

// ============================================================
// Genre Pack 配置加载
// ============================================================

/** 题材包配置摘要，用于写作上下文注入 */
export interface GenreConfig {
  writingRules: GenrePack['writingRules'];
  powerSystem: GenrePack['powerSystem'];
  supportedArcTypes: GenrePack['supportedArcTypes'];
  defaultArcType: GenrePack['defaultArcType'];
}

/**
 * 从数据库加载当前项目的题材包配置。
 *
 * 1. 读取 projects 表的 genre_pack_id
 * 2. 通过 GenrePackRegistry 解析对应的 GenrePack
 * 3. 返回写作规则、力量体系和篇章类型
 *
 * 如果数据库未初始化或题材包未找到，返回 null。
 *
 * @param _projectRoot - 项目根目录（保留参数，当前从 DB 全局单例读取）
 */
export function loadGenreConfig(_projectRoot?: string): GenreConfig | null {
  try {
    const db = getDatabase();
    if (!db) return null;
    const row = queryOne('SELECT genre_pack_id FROM projects LIMIT 1');
    if (!row || !row.genre_pack_id) return null;
    const registry = getRegistry();
    const pack = registry.get(row.genre_pack_id as string);
    if (!pack) return null;
    return {
      writingRules: pack.writingRules,
      powerSystem: pack.powerSystem,
      supportedArcTypes: pack.supportedArcTypes,
      defaultArcType: pack.defaultArcType,
    };
  } catch {
    return null;
  }
}
