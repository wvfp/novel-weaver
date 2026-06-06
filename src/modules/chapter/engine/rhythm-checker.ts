/**
 * 呼吸感检查器
 *
 * 检测章节文本的节奏问题（句式重复、段落模板化、节奏均匀等）
 * 并提供自动调整建议。纯统计分析，不调 LLM。
 */

// ============================================================
// 类型定义
// ============================================================

export interface RhythmReport {
  sentenceLengths: {
    mean: number;
    median: number;
    stddev: number;
    distribution: number[];
  };
  paragraphTypes: {
    narrative: number;
    dialogue: number;
    action: number;
    description: number;
    mixed: number;
  };
  openingDiversity: {
    uniqueStarters: number;
    totalParagraphs: number;
  };
  consecutivePatterns: {
    sameSubject: number;
    sameStructure: number;
  };
  tensionScore: number;
}

export interface BreathingIssue {
  type: string;
  severity: 'info' | 'warning' | 'high';
  description: string;
  suggestion: string;
  location?: { paragraph: number };
}

// ============================================================
// 辅助函数
// ============================================================

/** 计算均值 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 计算中位数 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 计算标准差 */
function stddev(values: number[], avg: number): number {
  if (values.length <= 1) return 0;
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

// ============================================================
// 段落类型检测
// ============================================================

/** 判断段落类型 */
function classifyParagraph(text: string): 'narrative' | 'dialogue' | 'action' | 'description' | 'mixed' {
  const hasDialogue = /[「「""]/.test(text);
  const hasAction = /[抓打踢砍跳跑击刺投]/.test(text);
  const hasDescription = /[是有着充满笼罩弥漫飘浮]/.test(text);

  if (hasDialogue && (hasAction || hasDescription)) return 'mixed';
  if (hasDialogue) return 'dialogue';
  if (hasAction) return 'action';
  if (hasDescription) return 'description';
  return 'narrative';
}

/** 检测主语重复 */
function detectRepeatedSubject(paragraphs: string[]): number {
  let count = 0;
  const subjectPatterns = [
    /^他[，,]/,
    /^她[，,]/,
    /^它[，,]/,
    /^我[，,]/,
  ];

  let consecutive = 0;
  for (const para of paragraphs) {
    const hasSubject = subjectPatterns.some((p) => p.test(para.trim()));
    if (hasSubject) {
      consecutive++;
      if (consecutive >= 4) count++;
    } else {
      consecutive = 0;
    }
  }
  return count;
}

/** 检测结构重复 */
function detectRepeatedStructure(paragraphs: string[]): number {
  let count = 0;
  let consecutive = 0;
  let prevType: string | null = null;

  for (const para of paragraphs) {
    const type = classifyParagraph(para);
    if (prevType && prevType === type) {
      consecutive++;
      if (consecutive >= 5) count++;
    } else {
      consecutive = 0;
    }
    prevType = type;
  }
  return count;
}

// ============================================================
// 主函数
// ============================================================

/**
 * 分析文本节奏。
 *
 * @param text - 要分析的文本
 * @returns 节奏报告
 */
export function analyzeRhythm(text: string): RhythmReport {
  // 分段
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // 分句
  const sentences = text.split(/[。！？!?\n]/).filter((s) => s.trim().length > 0);
  const sentenceLengths = sentences.map((s) => s.replace(/\s/g, '').length);
  const avgSentLen = mean(sentenceLengths);

  // 段落长度
  const paraLengths = paragraphs.map((p) => p.replace(/\s/g, '').length);

  // 句子长度分布
  const distribution = [0, 0, 0, 0, 0]; // <10, 10-20, 20-30, 30-50, >50
  for (const len of sentenceLengths) {
    if (len <= 10) distribution[0]++;
    else if (len <= 20) distribution[1]++;
    else if (len <= 30) distribution[2]++;
    else if (len <= 50) distribution[3]++;
    else distribution[4]++;
  }

  // 段落类型统计
  const typeCount = { narrative: 0, dialogue: 0, action: 0, description: 0, mixed: 0 };
  for (const para of paragraphs) {
    const type = classifyParagraph(para);
    typeCount[type]++;
  }

  // 开头多样性
  const starters = new Set(paragraphs.map((p) => p.trim().substring(0, 2)));
  const uniqueStarters = starters.size;

  // 重复模式
  const sameSubject = detectRepeatedSubject(paragraphs);
  const sameStructure = detectRepeatedStructure(paragraphs);

  // 张力分数（基于句子长度标准差和段落变化）
  const sentStddev = stddev(sentenceLengths, avgSentLen);
  const tensionScore = Math.min(10, Math.max(0, (sentStddev / avgSentLen) * 10));

  return {
    sentenceLengths: {
      mean: avgSentLen,
      median: median(sentenceLengths),
      stddev: sentStddev,
      distribution,
    },
    paragraphTypes: typeCount,
    openingDiversity: {
      uniqueStarters,
      totalParagraphs: paragraphs.length,
    },
    consecutivePatterns: {
      sameSubject,
      sameStructure,
    },
    tensionScore,
  };
}

/**
 * 检测呼吸感问题。
 *
 * @param text - 要检测的文本
 * @returns 检测到的问题列表
 */
export function checkBreathing(text: string): BreathingIssue[] {
  const issues: BreathingIssue[] = [];
  const report = analyzeRhythm(text);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // 1. 句子长度标准差过小 → 节奏过于均匀
  if (report.sentenceLengths.stddev < 10 && report.sentenceLengths.mean > 15) {
    issues.push({
      type: 'uniform_rhythm',
      severity: 'warning',
      description: `句子长度标准差 ${report.sentenceLengths.stddev.toFixed(1)} < 10，节奏过于均匀`,
      suggestion: '混入短句（2-5字）和长句（30+字），打破均匀节奏',
    });
  }

  // 2. 连续 4+ 句同一主语开头 → 句式重复
  if (report.consecutivePatterns.sameSubject > 0) {
    issues.push({
      type: 'repeated_subject',
      severity: 'warning',
      description: `检测到 ${report.consecutivePatterns.sameSubject} 处连续 4+ 句同一主语开头`,
      suggestion: '使用状语/时间/场景开头替代：『就在这时』『窗外』『突然』',
    });
  }

  // 3. 连续 5+ 段相同类型 → 段落模板化
  if (report.consecutivePatterns.sameStructure > 0) {
    issues.push({
      type: 'template_paragraph',
      severity: 'warning',
      description: `检测到 ${report.consecutivePatterns.sameStructure} 处连续 5+ 段同一类型`,
      suggestion: '交错不同类型段落：叙→对→叙→描述→对→动作',
    });
  }

  // 4. 单句段落占比过小 → 缺乏冲击停顿
  const singleSentenceParas = paragraphs.filter((p) => {
    const s = p.split(/[。！？!?\n]/).filter((x) => x.trim().length > 0);
    return s.length === 1 && p.replace(/\s/g, '').length < 30;
  });
  const singleRatio = paragraphs.length > 0 ? singleSentenceParas.length / paragraphs.length : 0;
  if (singleRatio < 0.15) {
    issues.push({
      type: 'lack_of_punch',
      severity: 'info',
      description: `单句段落占比 ${(singleRatio * 100).toFixed(0)}% < 15%，缺乏冲击停顿`,
      suggestion: '在关键情节处插入单句段落（如『他死了。』『门开了。』）增加冲击力',
    });
  }

  // 5. 段落长度过于集中 → 段落结构模板化
  if (paragraphs.length > 3) {
    const paraLengths = paragraphs.map((p) => p.replace(/\s/g, '').length);
    const avgLen = mean(paraLengths);
    const threshold = avgLen * 0.3;
    const withinRange = paraLengths.filter((l) => Math.abs(l - avgLen) <= threshold);
    const concentrationRatio = withinRange.length / paraLengths.length;
    if (concentrationRatio > 0.8) {
      issues.push({
        type: 'uniform_paragraph',
        severity: 'info',
        description: `段落长度集中度 ${(concentrationRatio * 100).toFixed(0)}%，段落结构模板化`,
        suggestion: '变化段落长度：插入超短段（10字以内）和超长段（200+字）',
      });
    }
  }

  // 6. 开头多样性不足
  if (report.openingDiversity.totalParagraphs > 5) {
    const diversityRatio = report.openingDiversity.uniqueStarters / report.openingDiversity.totalParagraphs;
    if (diversityRatio < 0.3) {
      issues.push({
        type: 'low_opening_diversity',
        severity: 'info',
        description: `段落开头多样性 ${(diversityRatio * 100).toFixed(0)}%，开头模式单一`,
        suggestion: '变换段落开头方式：时间状语、场景描写、对话、动作、心理描写交替使用',
      });
    }
  }

  return issues;
}

/**
 * 自动调整节奏。
 *
 * @param text - 原文
 * @param issues - 检测到的问题
 * @returns 调整后的文本
 */
export function mixRhythm(text: string, issues: BreathingIssue[]): string {
  let result = text;

  for (const issue of issues) {
    switch (issue.type) {
      case 'uniform_paragraph': {
        // 在关键位置插入单句段落
        const lines = result.split('\n');
        const insertAt = Math.floor(lines.length * 0.6);
        if (insertAt < lines.length) {
          lines.splice(insertAt, 0, '\n他沉默了片刻。\n');
          result = lines.join('\n');
        }
        break;
      }
      default:
        break;
    }
  }

  return result;
}
