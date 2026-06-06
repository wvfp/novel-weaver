/**
 * 上下文评分层 (Context Ranker)
 *
 * 对上下文包中的各元素进行评分排序：
 *   - 最近概要（按时间 + 伏笔加分）
 *   - 角色（按最近出场 + 出现频率）
 *   - 提醒（按严重程度 + 紧急性）
 *
 * 纯确定性算法，无 LLM 调用。
 * 参考 webnovel-writer 的 context_ranker.py 模式。
 */

import type { ContextPack, ChapterSummary, CharacterSnapshot, AlertItem } from './context-manager.js';

// ============================================================
// 评分常量
// ============================================================

const RECENCY_WEIGHT = 0.6;
const FREQUENCY_WEIGHT = 0.3;
const HOOK_BONUS = 0.15;

// ============================================================
// 评分函数
// ============================================================

/**
 * 计算时间衰减的接近度分数。
 * 越近的章节分数越高。
 *
 * @param chapterGap - 当前章节与目标章节的差距
 * @returns 接近度分数 (0-1)
 */
export function recencyScore(chapterGap: number): number {
  return 1.0 / (1.0 + Math.max(0, chapterGap));
}

/**
 * 计算出现频率分数。
 * 出现次数越多分数越高，但对高频取对数压缩。
 *
 * @param total - 总出现次数
 * @returns 频率分数 (0-1)
 */
export function frequencyScore(total: number): number {
  return Math.min(1.0, Math.log(1.0 + total) / Math.log(11.0));
}

/**
 * 综合评分。
 *
 * @param recency - 接近度分数
 * @param frequency - 频率分数
 * @param hookBonus - 伏笔加分（0-1）
 * @returns 综合分数
 */
export function combinedScore(
  recency: number,
  frequency: number,
  hookBonus: number = 0,
): number {
  return recency * RECENCY_WEIGHT + frequency * FREQUENCY_WEIGHT + hookBonus * HOOK_BONUS;
}

// ============================================================
// 排序函数
// ============================================================

/**
 * 对概要按接近度和伏笔提示排序。
 */
function rankSummaries(
  summaries: ChapterSummary[],
  currentChapter: number,
): ChapterSummary[] {
  return [...summaries].sort((a, b) => {
    const gapA = currentChapter - a.chapterNum;
    const gapB = currentChapter - b.chapterNum;
    const scoreA = combinedScore(recencyScore(gapA), 0, a.hookHint ? 1 : 0);
    const scoreB = combinedScore(recencyScore(gapB), 0, b.hookHint ? 1 : 0);
    return scoreB - scoreA; // 降序
  });
}

/**
 * 对角色按最近出场时间和总频率排序。
 */
function rankCharacters(
  characters: CharacterSnapshot[],
  currentChapter: number,
): CharacterSnapshot[] {
  return [...characters].sort((a, b) => {
    const gapA = a.lastChapter ? currentChapter - a.lastChapter : 99;
    const gapB = b.lastChapter ? currentChapter - b.lastChapter : 99;
    const scoreA = combinedScore(recencyScore(gapA), 0.5);
    const scoreB = combinedScore(recencyScore(gapB), 0.5);
    return scoreB - scoreA;
  });
}

/**
 * 对提醒按严重程度和接近度排序。
 */
function rankAlerts(alerts: AlertItem[]): AlertItem[] {
  return [...alerts].sort((a, b) => {
    // critical > warning > info
    const severityMap: Record<string, number> = { critical: 3, warning: 2, info: 1 };
    const aSev = severityMap[a.type] ?? 0;
    const bSev = severityMap[b.type] ?? 0;
    return bSev - aSev;
  });
}

// ============================================================
// 主函数
// ============================================================

/**
 * 对上下文包中的所有元素进行评分和排序。
 *
 * @param pack - 原始上下文包
 * @param currentChapter - 当前章节号
 * @returns 排序后的上下文包
 */
export function rankPack(pack: ContextPack, currentChapter: number): ContextPack {
  return {
    ...pack,
    summaries: rankSummaries(pack.summaries, currentChapter),
    characters: rankCharacters(pack.characters, currentChapter),
    alerts: rankAlerts(pack.alerts),
    // 附加 _contextScore 用于调试
  };
}

/**
 * 计算单个概要的评分（用于调试）。
 */
export function scoreSummary(summary: ChapterSummary, currentChapter: number): number {
  const gap = currentChapter - summary.chapterNum;
  return combinedScore(recencyScore(gap), 0, summary.hookHint ? 1 : 0);
}
