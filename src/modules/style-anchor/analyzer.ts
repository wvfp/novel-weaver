/**
 * 风格锚点分析器
 *
 * 对章节文本进行统计分析，提取风格特征；
 * 与已有风格锚点画像对比，检测偏离。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================
// 类型定义
// ============================================================

export interface StyleProfile {
  /** 句子长度统计 */
  sentenceLength: {
    mean: number;
    median: number;
    stddev: number;
    distribution: number[]; // <10, 10-20, 20-30, 30-50, >50
  };
  /** 段落长度统计 */
  paragraphLength: {
    mean: number;
    max: number;
    min: number;
  };
  /** 高频词/字（前 50） */
  topWords: [string, number][];
  /** 对话比例（0-1） */
  dialogueRatio: number;
  /** 标点频率 */
  punctuationFreq: Record<string, number>;
  /** 情绪词密度 */
  emotionDensity: { positive: number; negative: number };
  /** 副词密度 */
  adverbDensity: number;
}

export interface StyleDeviation {
  metric: string;
  expected: number;
  actual: number;
  deviation: number; // Z-score
  severity: 'info' | 'warning' | 'high';
  description: string;
}

// ============================================================
// 统计分析
// ============================================================

/**
 * 计算数组的均值。
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 计算数组的中位数。
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * 计算数组的标准差。
 */
function stddev(values: number[], avg: number): number {
  if (values.length <= 1) return 0;
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * 构建长度分布桶。
 */
function buildDistribution(values: number[], buckets: number[]): number[] {
  const dist = new Array(buckets.length).fill(0);
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < buckets.length; i++) {
      if (v <= buckets[i]) {
        dist[i]++;
        placed = true;
        break;
      }
    }
    if (!placed) dist[buckets.length - 1]++;
  }
  return dist;
}

// ============================================================
// 主分析函数
// ============================================================

/** 中文情绪词表（正向） */
const POSITIVE_WORDS = [
  '高兴', '快乐', '兴奋', '激动', '感动', '温暖', '欣慰',
  '欣喜', '幸福', '满足', '自豪', '期待', '惊喜', '畅快',
];

/** 中文情绪词表（负向） */
const NEGATIVE_WORDS = [
  '悲伤', '愤怒', '恐惧', '焦虑', '绝望', '痛苦', '压抑',
  '忧郁', '悲哀', '怨恨', '惊慌', '沮丧', '不安', '遗憾',
];

/** 常见 AI 味副词 */
const ADVERB_WORDS = [
  '缓缓', '淡淡', '微微', '轻轻', '悄悄', '默默', '渐渐',
  '稍稍', '略微', '隐隐', '猛然', '忽然', '突然', '顿时',
];

/**
 * 分析章节文本生成风格画像。
 *
 * @param text - 章节正文
 * @returns 风格画像
 */
export function analyzeAnchors(text: string): StyleProfile {
  // 分词句
  const sentences = text.split(/[。！？!?\n]/).filter((s) => s.trim().length > 0);
  const sentenceLengths = sentences.map((s) => s.replace(/\s/g, '').length);

  // 分段
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const paragraphLengths = paragraphs.map((p) => p.replace(/\s/g, '').length);

  // 句子长度统计
  const avgSentenceLen = mean(sentenceLengths);
  const sentenceDist = buildDistribution(sentenceLengths, [10, 20, 30, 50]);

  // 段落长度统计
  const avgParaLen = mean(paragraphLengths);
  const maxParaLen = paragraphLengths.length > 0 ? Math.max(...paragraphLengths) : 0;
  const minParaLen = paragraphLengths.length > 0 ? Math.min(...paragraphLengths) : 0;

  // 对话比例
  let dialogueCount = 0;
  const totalChars = text.replace(/\s/g, '').length;
  const dialogueMatches = text.match(/[「『""][^「『""]*[」』""]/g);
  if (dialogueMatches) {
    dialogueCount = dialogueMatches.reduce((sum, d) => sum + d.replace(/\s/g, '').length, 0);
  }
  const dialogueRatio = totalChars > 0 ? dialogueCount / totalChars : 0;

  // 高频双字词
  const chineseChars = text.replace(/[^\u4e00-\u9fff]/g, '');
  const bigramFreq: Record<string, number> = {};
  for (let i = 0; i < chineseChars.length - 1; i++) {
    const bigram = chineseChars.substring(i, i + 2);
    bigramFreq[bigram] = (bigramFreq[bigram] ?? 0) + 1;
  }
  const topWords: [string, number][] = Object.entries(bigramFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50) as [string, number][];

  // 标点频率
  const punctuationFreq: Record<string, number> = {};
  const punctChars = '，。！？、：；""「」——……～·';
  for (const char of punctChars) {
    const count = (text.match(new RegExp(`\\${char}`, 'g')) ?? []).length;
    if (count > 0) punctuationFreq[char] = count;
  }

  // 情绪词密度
  let positiveCount = 0;
  let negativeCount = 0;
  for (const word of POSITIVE_WORDS) {
    const matches = text.match(new RegExp(word, 'g'));
    if (matches) positiveCount += matches.length;
  }
  for (const word of NEGATIVE_WORDS) {
    const matches = text.match(new RegExp(word, 'g'));
    if (matches) negativeCount += matches.length;
  }
  const totalWords = chineseChars.length;
  const emotionDensity = {
    positive: totalWords > 0 ? positiveCount / totalWords : 0,
    negative: totalWords > 0 ? negativeCount / totalWords : 0,
  };

  // 副词密度
  let adverbCount = 0;
  for (const word of ADVERB_WORDS) {
    const matches = text.match(new RegExp(word, 'g'));
    if (matches) adverbCount += matches.length;
  }
  const adverbDensity = totalWords > 0 ? adverbCount / totalWords : 0;

  return {
    sentenceLength: {
      mean: avgSentenceLen,
      median: median(sentenceLengths),
      stddev: stddev(sentenceLengths, avgSentenceLen),
      distribution: sentenceDist,
    },
    paragraphLength: {
      mean: avgParaLen,
      max: maxParaLen,
      min: minParaLen,
    },
    topWords,
    dialogueRatio,
    punctuationFreq,
    emotionDensity,
    adverbDensity,
  };
}

/**
 * 将文本与已有风格锚点画像对比，检测偏离。
 *
 * @param text - 待检测的文本
 * @param profile - 风格锚点画像（需要至少包含 sentenceLength 和 dialogueRatio）
 * @returns 偏离项列表
 */
export function compareToAnchor(text: string, profile: Partial<StyleProfile>): StyleDeviation[] {
  const actual = analyzeAnchors(text);
  const deviations: StyleDeviation[] = [];

  // 句子长度均值偏离
  if (profile.sentenceLength?.mean !== undefined) {
    const expected = profile.sentenceLength.mean;
    const dev = actual.sentenceLength.mean - expected;
    const threshold = expected * 0.3; // 30% 偏差阈值
    const zScore = expected > 0 ? dev / expected : 0;

    if (Math.abs(dev) > threshold) {
      deviations.push({
        metric: 'sentence_length_mean',
        expected,
        actual: actual.sentenceLength.mean,
        deviation: zScore,
        severity: Math.abs(zScore) > 0.5 ? 'high' : 'warning',
        description: `句子长度均值偏离: 期望 ${expected.toFixed(1)}字, 实际 ${actual.sentenceLength.mean.toFixed(1)}字`,
      });
    }
  }

  // 句子长度标准差
  if (profile.sentenceLength?.stddev !== undefined) {
    const expected = profile.sentenceLength.stddev;
    if (actual.sentenceLength.stddev < expected * 0.5) {
      deviations.push({
        metric: 'sentence_length_stddev',
        expected,
        actual: actual.sentenceLength.stddev,
        deviation: (actual.sentenceLength.stddev - expected) / expected,
        severity: 'warning',
        description: '句子长度变化过小，节奏可能过于均匀',
      });
    }
  }

  // 对话比例
  if (profile.dialogueRatio !== undefined) {
    const expected = profile.dialogueRatio;
    const dev = actual.dialogueRatio - expected;
    if (Math.abs(dev) > 0.15) {
      deviations.push({
        metric: 'dialogue_ratio',
        expected,
        actual: actual.dialogueRatio,
        deviation: dev / expected,
        severity: Math.abs(dev) > 0.25 ? 'high' : 'warning',
        description: `对话比例偏离: 期望 ${(expected * 100).toFixed(0)}%, 实际 ${(actual.dialogueRatio * 100).toFixed(0)}%`,
      });
    }
  }

  // 副词密度偏离
  if (profile.adverbDensity !== undefined) {
    const expected = profile.adverbDensity;
    if (actual.adverbDensity > expected * 1.5) {
      deviations.push({
        metric: 'adverb_density',
        expected,
        actual: actual.adverbDensity,
        deviation: (actual.adverbDensity - expected) / expected,
        severity: actual.adverbDensity > expected * 2 ? 'high' : 'warning',
        description: `副词密度过高: 期望 ${(expected * 1000).toFixed(2)}‰, 实际 ${(actual.adverbDensity * 1000).toFixed(2)}‰`,
      });
    }
  }

  return deviations;
}

// ============================================================
// 持久化
// ============================================================

/**
 * 保存风格画像到 JSON 文件。
 *
 * @param profile - 风格画像
 * @param filePath - 保存路径
 */
export function saveProfile(profile: StyleProfile, filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
}

/**
 * 从 JSON 文件加载风格画像。
 *
 * @param filePath - 文件路径
 * @returns 风格画像，不存在时返回 null
 */
export function loadProfile(filePath: string): StyleProfile | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as StyleProfile;
  } catch {
    return null;
  }
}
